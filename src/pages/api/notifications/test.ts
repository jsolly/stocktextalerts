import type { APIRoute } from "astro";
import {
	checkAndIncrementRateLimit,
	ONE_HOUR_SECONDS,
} from "../../../lib/rate-limit";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { createEmailSender } from "./email/utils";
import { processEmailUpdate, processSmsUpdate } from "./processing";
import { loadUserStocks, toUserRecord } from "./shared";
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

	// Rate limit: 5 test notifications per hour per user
	const limitResult = await checkAndIncrementRateLimit(
		`test-notification:${authUser.id}`,
		ONE_HOUR_SECONDS,
		5,
	);

	if (!limitResult.allowed) {
		const now = new Date();
		const durationSeconds = Math.ceil(
			(limitResult.resetTime.getTime() - now.getTime()) / 1000,
		);
		return new Response(
			JSON.stringify({
				success: false,
				error: `Rate limit exceeded. Try again in ${durationSeconds} seconds.`,
			}),
			{
				status: 429,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const user = await userService.getById(authUser.id);
	if (!user) {
		return new Response(
			JSON.stringify({ success: false, error: "User not found" }),
			{
				status: 404,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	let body: { type?: string };
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

	const userStocks = await loadUserStocks(adminSupabase, user.id);
	if (userStocks === null) {
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
		const userRecord = toUserRecord(user);
		let sent = false;
		let logged = false;

		if (type === "email") {
			const sendEmail = createEmailSender();
			const result = await processEmailUpdate(
				adminSupabase,
				userRecord,
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
				userRecord,
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
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify({ success: true, logged }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Test notification error:", error);
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
