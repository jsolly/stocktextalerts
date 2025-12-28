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
	const authHeader = request.headers.get("authorization");
	const envCronSecret = import.meta.env.CRON_SECRET;

	if (!envCronSecret) {
		console.error("CRON_SECRET environment variable is not configured");
		return new Response("Server misconfigured", { status: 500 });
	}

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return new Response("Unauthorized", { status: 401 });
	}

	const cronSecret = authHeader.split("Bearer ")[1];
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

		let twilioConfig: ReturnType<typeof readTwilioConfig> | null = null;
		let sendSms: ReturnType<typeof createSmsSender> | null = null;

		const getSmsSender = (): ReturnType<typeof createSmsSender> | null => {
			if (sendSms) {
				return sendSms;
			}

			try {
				if (!twilioConfig) {
					twilioConfig = readTwilioConfig();
				}
				const twilioClient = createTwilioClient(twilioConfig);
				sendSms = createSmsSender(twilioClient, twilioConfig.phoneNumber);
				return sendSms;
			} catch (error) {
				console.error("Failed to initialize Twilio client:", error);
				return null;
			}
		};

		const processUser = async (user: UserRecord) => {
			const stats = {
				skipped: 0,
				logFailures: 0,
				emailsSent: 0,
				emailsFailed: 0,
				smsSent: 0,
				smsFailed: 0,
			};

			if (!shouldNotifyUser(user, getCurrentTime)) {
				stats.skipped++;
				return stats;
			}

			const userStocks = await loadUserStocks(supabase, user.id);
			if (userStocks === null) {
				stats.skipped++;
				return stats;
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

				if (result.success) stats.emailsSent++;
				else stats.emailsFailed++;

				const logged = await recordNotification(supabase, {
					userId: user.id,
					type: "scheduled_update",
					deliveryMethod: "email",
					messageDelivered: result.success,
					message: result.success ? message : result.error,
					error: result.success ? undefined : result.error,
					errorCode: result.success ? undefined : result.errorCode,
				});
				if (!logged) stats.logFailures++;
			}

			// Process SMS
			if (shouldSendSms(user)) {
				const smsSender = getSmsSender();
				if (!smsSender) {
					stats.smsFailed++;
					const logged = await recordNotification(supabase, {
						userId: user.id,
						type: "scheduled_update",
						deliveryMethod: "sms",
						messageDelivered: false,
						message: "SMS service unavailable",
						error: "Twilio client not initialized",
					});
					if (!logged) stats.logFailures++;
					return stats;
				}

				const smsMessage = truncateSms(
					userStocks.length === 0
						? `${stocksList}. Reply STOP to opt out.`
						: `Tracked: ${stocksList}. Reply STOP to opt out.`,
				);

				const result = await sendUserSms(user, smsMessage, smsSender);

				if (result.success) stats.smsSent++;
				else stats.smsFailed++;

				const logged = await recordNotification(supabase, {
					userId: user.id,
					type: "scheduled_update",
					deliveryMethod: "sms",
					messageDelivered: result.success,
					message: result.success ? smsMessage : result.error,
					error: result.success ? undefined : result.error,
					errorCode: result.success ? undefined : result.errorCode,
				});
				if (!logged) stats.logFailures++;
			}
			return stats;
		};

		const results = await Promise.all((users ?? []).map(processUser));

		const totals = results.reduce(
			(acc, curr) => ({
				skipped: acc.skipped + curr.skipped,
				logFailures: acc.logFailures + curr.logFailures,
				emailsSent: acc.emailsSent + curr.emailsSent,
				emailsFailed: acc.emailsFailed + curr.emailsFailed,
				smsSent: acc.smsSent + curr.smsSent,
				smsFailed: acc.smsFailed + curr.smsFailed,
			}),
			{
				skipped: 0,
				logFailures: 0,
				emailsSent: 0,
				emailsFailed: 0,
				smsSent: 0,
				smsFailed: 0,
			},
		);

		return new Response(JSON.stringify({ success: true, ...totals }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Cron job error:", error);
		return new Response("Internal server error", { status: 500 });
	}
};
