import type { APIRoute } from "astro";
import type { Enums } from "../../../lib/database.types";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { createEmailSender } from "./email/utils";
import { processEmailUpdate, processSmsUpdate } from "./processing";
import { loadUserStocks, type UserStockRow } from "./shared";
import {
	createSmsSender,
	createTwilioClient,
	readTwilioConfig,
} from "./sms/twilio-utils";

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);
	const authUser = await userService.getCurrentUser();

	if (!authUser) {
		return new Response(
			JSON.stringify({ success: false, error: "Unauthorized" }),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	let body: { type?: Enums<"delivery_method"> };
	try {
		body = await request.json();
	} catch {
		return new Response(
			JSON.stringify({ success: false, error: "Invalid JSON" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const { type } = body;
	if (type !== "email" && type !== "sms") {
		return new Response(
			JSON.stringify({ success: false, error: "Invalid notification type" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	// Use admin client for processing to bypass RLS on notification_log
	const adminSupabase = createSupabaseAdminClient();

	let userStocks: UserStockRow[];
	try {
		userStocks = await loadUserStocks(adminSupabase, authUser.id);
	} catch (error) {
		console.error("Failed to load user stocks", { userId: authUser.id, error });
		return new Response(
			JSON.stringify({ success: false, error: "Failed to load stocks" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const stocksList =
		userStocks.length === 0
			? "You don't have any tracked stocks"
			: userStocks.map((stock) => `${stock.symbol} - ${stock.name}`).join(", ");

	try {
		let sent = false;
		let logged = false;
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
				return new Response(
					JSON.stringify({ success: false, error: "Failed to load user" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!user) {
				return new Response(
					JSON.stringify({ success: false, error: "User not found" }),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!user.email_notifications_enabled) {
				return new Response(
					JSON.stringify({
						success: false,
						error: "User record missing required email notification fields",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
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
			logged = result.logged;
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
				return new Response(
					JSON.stringify({ success: false, error: "Failed to load user" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!user) {
				return new Response(
					JSON.stringify({ success: false, error: "User not found" }),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (
				!user.sms_notifications_enabled ||
				user.sms_opted_out ||
				!user.phone_verified ||
				!user.phone_country_code?.trim() ||
				!user.phone_number?.trim()
			) {
				return new Response(
					JSON.stringify({
						success: false,
						error: "User record missing required SMS notification fields",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
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
			logged = result.logged;
			errorDetails = result.error;
			errorCode = result.errorCode;
		}

		if (!sent) {
			const response: {
				success: false;
				error: string;
				errorDetails?: string;
				errorCode?: string;
			} = {
				success: false,
				error: `Failed to send ${type === "email" ? "email" : "SMS"}`,
			};

			if (errorDetails) {
				response.errorDetails = errorDetails;
			}
			if (errorCode) {
				response.errorCode = errorCode;
			}

			return new Response(JSON.stringify(response), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ success: true, logged }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Notification preview error:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
