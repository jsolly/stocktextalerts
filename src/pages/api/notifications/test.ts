import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { createEmailSender } from "./email/utils";
import { processEmailUpdate, processSmsUpdate } from "./processing";
import { loadUserStocks, type UserRecord } from "./shared";
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
		return new Response("Unauthorized", { status: 401 });
	}

	const user = await userService.getById(authUser.id);
	if (!user) {
		return new Response("User not found", { status: 404 });
	}

	let body: { type?: string };
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	const { type } = body;
	if (type !== "email" && type !== "sms") {
		return new Response("Invalid notification type", { status: 400 });
	}

	// Use admin client for processing to bypass RLS on notification_log
	const adminSupabase = createSupabaseAdminClient();

	const userStocks = await loadUserStocks(adminSupabase, user.id);
	if (userStocks === null) {
		return new Response("Failed to load stocks", { status: 500 });
	}

	const stocksList =
		userStocks.length === 0
			? "You don't have any tracked stocks"
			: userStocks.map((stock) => `${stock.symbol} - ${stock.name}`).join(", ");

	try {
		let sent = false;
		let logged = false;

		if (type === "email") {
			const sendEmail = createEmailSender();
			// Cast user to UserRecord to satisfy UserRecord vs User branding mismatch
			// This is safe because User (from DB) has all fields required by UserRecord
			const result = await processEmailUpdate(
				adminSupabase,
				user as UserRecord,
				userStocks,
				stocksList,
				sendEmail,
			);
			sent = result.sent;
			logged = result.logged;
		} else {
			const twilioConfig = readTwilioConfig();
			const twilioClient = createTwilioClient(twilioConfig);
			const sendSms = createSmsSender(twilioClient, twilioConfig.phoneNumber);

			const result = await processSmsUpdate(
				adminSupabase,
				user as UserRecord,
				userStocks,
				stocksList,
				sendSms,
			);
			sent = result.sent;
			logged = result.logged;
		}

		if (!sent) {
			return new Response(
				JSON.stringify({
					success: false,
					error: `Failed to send ${type === "email" ? "email" : "SMS"}`,
				}),
				{ status: 500 },
			);
		}

		return new Response(JSON.stringify({ success: true, logged }), {
			status: 200,
		});
	} catch (error) {
		console.error("Test notification error:", error);
		return new Response(
			JSON.stringify({ success: false, error: String(error) }),
			{ status: 500 },
		);
	}
};
