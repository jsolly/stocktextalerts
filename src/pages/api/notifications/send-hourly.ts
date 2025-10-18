import type { APIRoute } from "astro";
import { sendEmail } from "../../../lib/email";
import { logNotification } from "../../../lib/notifications";
import { createSupabaseAdminClient } from "../../../lib/supabase";
import { sendSMS } from "../../../lib/twilio";

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
				notification_start_hour,
				notification_end_hour,
				notify_via_email,
				notify_via_sms
			`,
			)
			.or("notify_via_email.eq.true,notify_via_sms.eq.true");

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

			if (
				userLocalHour < user.notification_start_hour ||
				userLocalHour > user.notification_end_hour
			) {
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

			if (user.notify_via_email) {
				const emailResult = await sendEmail(
					user.email,
					"Your Daily Stock Alert",
					`Your tracked stocks: ${stocksList}`,
				);

				await logNotification({
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
				user.notify_via_sms &&
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

				await logNotification({
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
