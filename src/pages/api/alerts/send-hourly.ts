import type { APIRoute } from "astro";
import twilio from "twilio";
import { createSupabaseAdminClient } from "../../../lib/db-client";

/* =============
Inlined from lib/alerts.ts, lib/email.ts, and lib/twilio.ts
============= */

const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = import.meta.env.TWILIO_PHONE_NUMBER;

if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
	throw new Error("Missing Twilio configuration in environment variables");
}

const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

async function sendSMS(
	to: string,
	message: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		await twilioClient.messages.create({
			body: message,
			from: twilioPhoneNumber,
			to,
		});

		return { success: true };
	} catch (error) {
		console.error("Twilio SMS send error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to send SMS",
		};
	}
}

type DeliveryMethod = "email" | "sms";
type DeliveryStatus = "sent" | "failed";

interface AlertLog {
	user_id: string;
	type: string;
	delivery_method: DeliveryMethod;
	status: DeliveryStatus;
	message?: string;
	sent_at?: string;
}

async function logAlert(
	supabase: ReturnType<typeof createSupabaseAdminClient>,
	log: AlertLog,
): Promise<{ success: boolean; error?: string }> {
	const { error } = await supabase.from("alerts_log").insert({
		user_id: log.user_id,
		type: log.type,
		delivery_method: log.delivery_method,
		status: log.status,
		message: log.message,
	});

	if (error) {
		console.error("Failed to log alert:", error);
		return {
			success: false,
			error: error.message || "Failed to log alert",
		};
	}

	return { success: true };
}

async function sendEmail(
	to: string,
	subject: string,
	body: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		console.log(`[EMAIL] To: ${to}`);
		console.log(`[EMAIL] Subject: ${subject}`);
		console.log(`[EMAIL] Body: ${body}`);

		return { success: true };
	} catch (error) {
		console.error("Email send error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to send email",
		};
	}
}

export const POST: APIRoute = async ({ request }) => {
	const cronSecret = request.headers.get("x-vercel-cron-secret");

	if (cronSecret !== import.meta.env.CRON_SECRET) {
		return new Response("Unauthorized", { status: 401 });
	}

	const supabase = createSupabaseAdminClient();

	try {
		const currentHour = new Date().getUTCHours();

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
				alert_start_hour,
				alert_end_hour,
				alert_via_email,
				alert_via_sms
			`,
			)
			.or("alert_via_email.eq.true,alert_via_sms.eq.true");

		if (usersError) {
			console.error("Error fetching users:", usersError);
			return new Response("Error fetching users", { status: 500 });
		}

		let sentCount = 0;
		let skippedCount = 0;

		for (const user of users || []) {
			if (!user.timezone) {
				skippedCount++;
				continue;
			}

			const userLocalHour = getUserLocalHour(currentHour, user.timezone);

			// determine if current hour falls within user's alert window, including windows that wrap past midnight
			let withinWindow = false;
			if (user.alert_start_hour <= user.alert_end_hour) {
				withinWindow =
					userLocalHour >= user.alert_start_hour &&
					userLocalHour <= user.alert_end_hour;
			} else {
				// window wraps midnight, e.g., 22 -> 6
				withinWindow =
					userLocalHour >= user.alert_start_hour ||
					userLocalHour <= user.alert_end_hour;
			}

			if (!withinWindow) {
				skippedCount++;
				continue;
			}

			const { data: userStocks, error: stocksError } = await supabase
				.from("user_stocks")
				.select("symbol")
				.eq("user_id", user.id);

			if (stocksError || !userStocks || userStocks.length === 0) {
				skippedCount++;
				continue;
			}

			const symbols = userStocks.map((s) => s.symbol);
			const stocksList = symbols.join(", ");

			if (user.alert_via_email) {
				const emailResult = await sendEmail(
					user.email,
					"Your Hourly Stock Alert",
					`Your tracked stocks: ${stocksList}`,
				);

				await logAlert(supabase, {
					user_id: user.id,
					type: "hourly_update",
					delivery_method: "email",
					status: emailResult.success ? "sent" : "failed",
					message: `Stocks: ${stocksList}`,
				});

				if (emailResult.success) {
					sentCount++;
				}
			}

			if (
				user.alert_via_sms &&
				user.phone_verified &&
				!user.sms_opted_out &&
				user.phone_country_code &&
				user.phone_number
			) {
				const fullPhone = `${user.phone_country_code}${user.phone_number}`;
				const smsMessage = truncateSMS(
					`Tracked: ${stocksList}. Reply STOP to opt out.`,
				);

				const smsResult = await sendSMS(fullPhone, smsMessage);

				await logAlert(supabase, {
					user_id: user.id,
					type: "hourly_update",
					delivery_method: "sms",
					status: smsResult.success ? "sent" : "failed",
					message: smsMessage,
				});

				if (smsResult.success) {
					sentCount++;
				}
			}
		}

		return new Response(
			JSON.stringify({
				success: true,
				sent: sentCount,
				skipped: skippedCount,
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

function getUserLocalHour(utcHour: number, timezone: string): number {
	const now = new Date();
	const utcDate = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate(),
			utcHour,
			0,
			0,
		),
	);

	const localTimeStr = utcDate.toLocaleString("en-US", {
		timeZone: timezone,
		hour12: false,
		hour: "2-digit",
	});

	return Number.parseInt(localTimeStr, 10);
}

function truncateSMS(message: string, maxLength = 160): string {
	if (message.length <= maxLength) {
		return message;
	}
	return `${message.substring(0, maxLength - 3)}...`;
}
