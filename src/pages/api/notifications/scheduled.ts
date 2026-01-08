import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";

import { createSupabaseAdminClient } from "../../../lib/supabase";
import { createEmailSender } from "./email/utils";
import { processEmailUpdate, processSmsUpdate } from "./processing";
import {
	type DeliveryMethod,
	loadUserStocks,
	recordNotification,
	shouldNotifyUser,
	type UserRecord,
} from "./shared";
import { shouldSendSms } from "./sms";
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
			notification_frequency,
			daily_notification_hour,
			breaking_news_enabled,
			breaking_news_threshold_percent,
			breaking_news_outside_window,
			email_notifications_enabled,
			sms_notifications_enabled
		`,
			)
			.or(
				"email_notifications_enabled.eq.true,sms_notifications_enabled.eq.true",
			);

		if (usersError) {
			const errorMsg =
				usersError instanceof Error
					? usersError.message
					: JSON.stringify(usersError);
			throw new Error(`Failed to fetch users: ${errorMsg}`);
		}

		let twilioConfig: ReturnType<typeof readTwilioConfig> | null = null;
		let sendSms: ReturnType<typeof createSmsSender> | null = null;

		interface SmsSenderResult {
			sender: ReturnType<typeof createSmsSender> | null;
			error?: string;
		}

		const getSmsSender = (): SmsSenderResult => {
			if (sendSms) {
				return { sender: sendSms };
			}

			try {
				if (!twilioConfig) {
					twilioConfig = readTwilioConfig();
				}
				const twilioClient = createTwilioClient(twilioConfig);
				sendSms = createSmsSender(twilioClient, twilioConfig.phoneNumber);
				return { sender: sendSms };
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error("Failed to initialize Twilio client:", errorMsg);
				return { sender: null, error: errorMsg };
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
			let attemptedDeliveryMethod: DeliveryMethod | null = null;

			try {
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
						: userStocks
								.map((stock) => `${stock.symbol} - ${stock.name}`)
								.join(", ");

				// Process Email
				if (user.email_notifications_enabled) {
					attemptedDeliveryMethod = "email";
					const { sent, logged } = await processEmailUpdate(
						supabase,
						user,
						userStocks,
						stocksList,
						sendEmail,
					);

					if (sent) stats.emailsSent++;
					else stats.emailsFailed++;

					if (!logged) stats.logFailures++;
				}

				// Process SMS
				if (shouldSendSms(user)) {
					attemptedDeliveryMethod = "sms";
					const { sender: smsSender, error: smsError } = getSmsSender();
					if (!smsSender) {
						stats.smsFailed++;
						const logged = await recordNotification(supabase, {
							userId: user.id,
							type: "scheduled_update",
							deliveryMethod: "sms",
							messageDelivered: false,
							message: "SMS service unavailable",
							error: smsError || "Twilio client not initialized",
						});
						if (!logged) stats.logFailures++;
						return stats;
					}

					const { sent, logged } = await processSmsUpdate(
						supabase,
						user,
						userStocks,
						stocksList,
						smsSender,
					);

					if (sent) stats.smsSent++;
					else stats.smsFailed++;

					if (!logged) stats.logFailures++;
				}
				return stats;
			} catch (error) {
				stats.skipped++;
				console.error(`Error processing user ${user.id}:`, error);

				try {
					const deliveryMethod: DeliveryMethod =
						attemptedDeliveryMethod ??
						(user.email_notifications_enabled ? "email" : "sms");
					await recordNotification(supabase, {
						userId: user.id,
						type: "scheduled_update",
						deliveryMethod,
						messageDelivered: false,
						message: "Error processing notification",
						error: error instanceof Error ? error.message : String(error),
					});
				} catch (logError) {
					console.error(
						`Failed to record notification for user ${user.id}:`,
						logError,
					);
					stats.logFailures++;
				}

				return stats;
			}
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
