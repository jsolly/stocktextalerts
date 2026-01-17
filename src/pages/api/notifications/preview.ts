import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { parseWithSchema } from "../form-utils";
import { createEmailSender } from "./email/utils";
import { processEmailUpdate, processSmsUpdate } from "./processing";
import { loadUserStocks, type UserStockRow } from "./shared";
import {
	createSmsSender,
	createTwilioClient,
	readTwilioConfig,
} from "./sms/twilio-utils";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);
	const authUser = await userService.getCurrentUser();

	if (!authUser) {
		return redirect("/signin?error=unauthorized");
	}

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		type: { type: "enum", values: ["email", "sms"] as const, required: true },
	} as const);

	if (!parsed.ok) {
		console.error("Preview notification rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/dashboard?error=invalid_form");
	}
	const { type } = parsed.data;

	const successKey =
		type === "email" ? "preview_email_sent" : "preview_sms_sent";

	// Use admin client for processing to bypass RLS on notification_log
	const adminSupabase = createSupabaseAdminClient();

	const endpoint =
		type === "email"
			? "preview_notification_email"
			: "preview_notification_sms";

	const { data: rateLimitAllowed, error: rateLimitError } =
		await adminSupabase.rpc("check_rate_limit", {
			p_user_id: authUser.id,
			p_endpoint: endpoint,
			p_max_requests: 5,
			p_window_minutes: 60,
		});

	if (rateLimitError) {
		console.error("Rate limit check failed", {
			userId: authUser.id,
			error: rateLimitError,
		});
		return redirect("/dashboard?error=preview_failed");
	}

	if (rateLimitAllowed !== true) {
		return redirect("/dashboard?error=preview_rate_limited");
	}

	let userStocks: UserStockRow[];
	try {
		userStocks = await loadUserStocks(adminSupabase, authUser.id);
	} catch (error) {
		console.error("Failed to load user stocks", { userId: authUser.id, error });
		return redirect("/dashboard?error=preview_failed");
	}

	const stocksList =
		userStocks.length === 0
			? "You don't have any tracked stocks"
			: userStocks.map((stock) => `${stock.symbol} - ${stock.name}`).join(", ");

	try {
		let sent = false;
		let errorDetails: string | undefined;
		let errorCode: string | undefined;

		if (type === "email") {
			const { data: user, error: userError } = await adminSupabase
				.from("users")
				.select("id,email,email_notifications_enabled")
				.eq("id", authUser.id)
				.maybeSingle();

			if (userError) {
				console.error("Failed to load user for email preview", {
					userId: authUser.id,
					error: userError,
				});
				return redirect("/dashboard?error=preview_failed");
			}

			if (!user) {
				return redirect("/dashboard?error=user_not_found");
			}

			if (!user.email_notifications_enabled) {
				return redirect("/dashboard?error=preview_email_disabled");
			}

			const sendEmail = createEmailSender();
			const result = await processEmailUpdate(
				adminSupabase,
				user,
				userStocks,
				stocksList,
				sendEmail,
			);
			sent = result.sent;
			errorDetails = result.error;
			errorCode = result.errorCode;
		} else {
			const { data: user, error: userError } = await adminSupabase
				.from("users")
				.select(
					"id,phone_country_code,phone_number,phone_verified,sms_notifications_enabled,sms_opted_out",
				)
				.eq("id", authUser.id)
				.maybeSingle();

			if (userError) {
				console.error("Failed to load user for SMS preview", {
					userId: authUser.id,
					error: userError,
				});
				return redirect("/dashboard?error=preview_failed");
			}

			if (!user) {
				return redirect("/dashboard?error=user_not_found");
			}

			if (!user.sms_notifications_enabled) {
				return redirect("/dashboard?error=preview_sms_disabled");
			}

			if (user.sms_opted_out) {
				return redirect("/dashboard?error=preview_sms_opted_out");
			}

			if (!user.phone_country_code?.trim() || !user.phone_number?.trim()) {
				return redirect("/dashboard?error=preview_sms_missing_phone");
			}

			if (!user.phone_verified) {
				return redirect("/dashboard?error=preview_sms_unverified");
			}

			const twilioConfig = readTwilioConfig();
			const twilioClient = createTwilioClient(twilioConfig);
			const sendSms = createSmsSender(twilioClient, twilioConfig.phoneNumber);

			const result = await processSmsUpdate(
				adminSupabase,
				user,
				userStocks,
				stocksList,
				sendSms,
			);
			sent = result.sent;
			errorDetails = result.error;
			errorCode = result.errorCode;
		}

		if (!sent) {
			console.error("Preview notification failed to send", {
				userId: authUser.id,
				type,
				errorDetails,
				errorCode,
			});
			return redirect("/dashboard?error=preview_failed");
		}

		return redirect(`/dashboard?success=${successKey}`);
	} catch (error) {
		console.error("Notification preview error:", error);
		return redirect("/dashboard?error=preview_failed");
	}
};
