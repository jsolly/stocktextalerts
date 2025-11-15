import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";

import { createSupabaseAdminClient } from "../../../lib/supabase";
import { type EmailSender, sendHourlyNotifications } from "./hourly-utils";
import {
	createSmsSender,
	createTwilioClient,
	readTwilioConfig,
} from "./twilio-utils";

export const POST: APIRoute = async ({ request }) => {
	const cronSecret = request.headers.get("x-vercel-cron-secret");
	const envCronSecret = import.meta.env.CRON_SECRET;

	if (!envCronSecret) {
		console.error("CRON_SECRET environment variable is not configured");
		return new Response("Server misconfigured", { status: 500 });
	}

	if (!cronSecret) {
		return new Response("Unauthorized", { status: 401 });
	}

	let authorized = false;

	if (cronSecret.length === envCronSecret.length) {
		try {
			authorized = timingSafeEqual(
				Buffer.from(cronSecret),
				Buffer.from(envCronSecret),
			);
		} catch (error) {
			console.error("Failed to compare cron secrets securely", error);
			return new Response("Internal server error", { status: 500 });
		}
	}

	if (!authorized) {
		return new Response("Unauthorized", { status: 401 });
	}

	const supabase = createSupabaseAdminClient();

	try {
		const twilioConfig = readTwilioConfig();
		const twilioClient = createTwilioClient(twilioConfig);
		const sendSms = createSmsSender(twilioClient, twilioConfig.phoneNumber);
		const sendEmail = createEmailSender();

		const result = await sendHourlyNotifications({
			supabase,
			sendEmail,
			sendSms,
		});

		return new Response(
			JSON.stringify({
				success: true,
				skipped: result.skipped,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("Cron job error:", error);
		return new Response("Internal server error", { status: 500 });
	}
};

function createEmailSender(): EmailSender {
	return async () => {
		return { success: true };
	};
}
