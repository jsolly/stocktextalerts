import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";

import { truncateSms } from "../../../lib/format";
import { createSupabaseAdminClient } from "../../../lib/supabase";
import { sendUserEmail, shouldSendEmail } from "./email";
import { createEmailSender, formatEmailMessage } from "./email/utils";
import {
	loadUserStocks,
	recordNotification,
	shouldNotifyUser,
	type UserRecord,
} from "./shared";
import { sendUserSms, shouldSendSms } from "./sms";
import {
	createSmsSender,
	createTwilioClient,
	readTwilioConfig,
} from "./sms/twilio-utils";

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

		const currentTime = new Date();
		const getCurrentTime = () => currentTime;

		const { data: users, error: usersError } = await supabase
			.from("users")
			.select(
				`
			id,
			email,
			phone_country_code,
			phone_number,
			phone_verified,
			sms_opted_out,
			timezone,
			notification_start_hour,
			notification_end_hour,
			email_notifications_enabled,
			sms_notifications_enabled
		`,
			)
			.or(
				"email_notifications_enabled.eq.true,sms_notifications_enabled.eq.true",
			);

		if (usersError) {
			throw new Error("Failed to fetch users");
		}

		let skipped = 0;
		let logFailures = 0;
		let emailsSent = 0;
		let emailsFailed = 0;
		let smsSent = 0;
		let smsFailed = 0;

		const processUser = async (user: UserRecord) => {
			if (!shouldNotifyUser(user, getCurrentTime)) {
				skipped++;
				return;
			}

			const userStocks = await loadUserStocks(supabase, user.id);
			if (userStocks === null) {
				skipped++;
				return;
			}

			const stocksList =
				userStocks.length === 0
					? "You don't have any tracked stocks"
					: userStocks.map((stock) => stock.symbol).join(", ");

			// Process Email
			if (shouldSendEmail(user)) {
				const message = formatEmailMessage(userStocks, stocksList);
				const result = await sendUserEmail(
					user,
					"Your Stock Update",
					message,
					sendEmail,
				);

				if (result.success) emailsSent++;
				else emailsFailed++;

				const logged = await recordNotification(supabase, {
					userId: user.id,
					type: "scheduled_update",
					deliveryMethod: "email",
					messageDelivered: result.success,
					message: result.success ? message : result.error,
					error: result.success ? undefined : result.error,
					errorCode: result.success ? undefined : result.errorCode,
				});
				if (!logged) logFailures++;
			}

			// Process SMS
			if (shouldSendSms(user)) {
				const smsMessage = truncateSms(
					userStocks.length === 0
						? `${stocksList}. Reply STOP to opt out.`
						: `Tracked: ${stocksList}. Reply STOP to opt out.`,
				);

				const result = await sendUserSms(user, smsMessage, sendSms);

				if (result.success) smsSent++;
				else smsFailed++;

				const logged = await recordNotification(supabase, {
					userId: user.id,
					type: "scheduled_update",
					deliveryMethod: "sms",
					messageDelivered: result.success,
					message: result.success ? smsMessage : result.error,
					error: result.success ? undefined : result.error,
					errorCode: result.success ? undefined : result.errorCode,
				});
				if (!logged) logFailures++;
			}
		};

		await Promise.all((users ?? []).map(processUser));

		return new Response(
			JSON.stringify({
				success: true,
				skipped,
				logFailures,
				emailsSent,
				emailsFailed,
				smsSent,
				smsFailed,
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
