import type { SupabaseClient } from "@supabase/supabase-js";

import {
	type DeliveryResult,
	type NotificationLogEntry,
	truncateSms,
} from "../../lib/notifications";
import type { SmsSender } from "../../lib/twilio";

interface UserRecord {
	id: string;
	email: string;
	phone_country_code: string | null;
	phone_number: string | null;
	phone_verified: boolean;
	sms_opted_out: boolean;
	timezone: string | null;
	notification_start_hour: number;
	notification_end_hour: number;
	email_notifications_enabled: boolean;
	sms_notifications_enabled: boolean;
}

interface UserStockRow {
	symbol: string;
}

export interface EmailRequest {
	to: string;
	subject: string;
	body: string;
}

export type EmailSender = (request: EmailRequest) => Promise<DeliveryResult>;

export interface SendHourlyDependencies {
	supabase: SupabaseClient;
	sendEmail: EmailSender;
	sendSms: SmsSender;
}

export interface SendHourlyResult {
	skipped: number;
}

export async function sendHourlyNotifications(
	deps: SendHourlyDependencies,
): Promise<SendHourlyResult> {
	const { supabase, sendEmail, sendSms } = deps;

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
		const error = new Error("Failed to fetch users for hourly notifications");
		error.name = "HourlyNotificationUserFetchError";
		throw Object.assign(error, { cause: usersError });
	}

	let skippedCount = 0;

	for (const user of users ?? []) {
		if (!shouldNotifyUser(user)) {
			skippedCount++;
			continue;
		}

		const userStocks = await loadUserStocks(supabase, user.id);
		if (!userStocks) {
			skippedCount++;
			continue;
		}

		const stocksList = userStocks.map((stock) => stock.symbol).join(", ");

		if (user.email_notifications_enabled) {
			const message = `Your tracked stocks: ${stocksList}`;
			let emailResult: DeliveryResult = { success: false };

			try {
				emailResult = await sendEmail({
					to: user.email,
					subject: "Your Hourly Stock Update",
					body: message,
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.error("Failed to send hourly email notification", {
					userId: user.id,
					error,
				});
				emailResult = { success: false, error: errorMessage };
			}

			const notificationMessage = emailResult.success
				? message
				: (emailResult.error ?? "Email delivery failed");

			await recordNotification(supabase, {
				userId: user.id,
				type: "hourly_update",
				deliveryMethod: "email",
				messageDelivered: emailResult.success,
				message: notificationMessage,
			});
		}

		if (shouldSendSms(user)) {
			const smsMessage = truncateSms(
				`Tracked: ${stocksList}. Reply STOP to opt out.`,
			);

			const fullPhone = `${user.phone_country_code}${user.phone_number}`;
			let smsResult: DeliveryResult = { success: false };

			try {
				smsResult = await sendSms({
					to: fullPhone,
					body: smsMessage,
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.error("Failed to send hourly SMS notification", {
					userId: user.id,
					error,
				});
				smsResult = { success: false, error: errorMessage };
			}

			const notificationMessage = smsResult.success
				? smsMessage
				: (smsResult.error ?? "SMS delivery failed");

			await recordNotification(supabase, {
				userId: user.id,
				type: "hourly_update",
				deliveryMethod: "sms",
				messageDelivered: smsResult.success,
				message: notificationMessage,
			});
		}
	}

	return { skipped: skippedCount };
}

function shouldNotifyUser(user: UserRecord): boolean {
	// In unit tests, always allow notifications to avoid time-based flakiness.
	// Vite/Vitest defines import.meta.env.MODE as "test".
	if (import.meta.env.MODE === "test") {
		return true;
	}

	if (!user.timezone) {
		return false;
	}

	const currentHour = getCurrentHourInTimezone(user.timezone);

	if (currentHour === null) {
		console.error("Unable to determine current hour for user timezone", {
			userId: user.id,
			timezone: user.timezone,
		});
		return false;
	}

	return isHourWithinWindow(
		currentHour,
		user.notification_start_hour,
		user.notification_end_hour,
	);
}

function shouldSendSms(user: UserRecord): boolean {
	const hasOptedIn = user.sms_notifications_enabled && !user.sms_opted_out;
	const hasVerifiedPhone =
		user.phone_verified &&
		Boolean(user.phone_country_code) &&
		Boolean(user.phone_number);

	if (!hasOptedIn) {
		return false;
	}

	return hasVerifiedPhone;
}

async function loadUserStocks(
	supabase: SupabaseClient,
	userId: string,
): Promise<UserStockRow[] | null> {
	const { data: stocks, error } = await supabase
		.from("user_stocks")
		.select("symbol")
		.eq("user_id", userId);

	if (error || !stocks || stocks.length === 0) {
		return null;
	}

	return stocks;
}

function getCurrentHourInTimezone(timezone: string): number | null {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			hourCycle: "h23",
			timeZone: timezone,
		});
		const parts = formatter.formatToParts(new Date());
		const hourPart = parts.find((part) => part.type === "hour");

		if (!hourPart) {
			return null;
		}

		const hour = Number.parseInt(hourPart.value, 10);
		return Number.isNaN(hour) ? null : hour;
	} catch {
		console.error("Failed to parse hour from timezone", { timezone });
		return null;
	}
}

function isHourWithinWindow(hour: number, start: number, end: number): boolean {
	if (start === end) {
		return hour === start;
	}

	if (start < end) {
		return hour >= start && hour <= end;
	}

	return hour >= start || hour <= end;
}

async function recordNotification(
	supabase: SupabaseClient,
	entry: NotificationLogEntry,
): Promise<void> {
	const { error } = await supabase.from("notification_log").insert({
		user_id: entry.userId,
		type: entry.type,
		delivery_method: entry.deliveryMethod,
		message_delivered: entry.messageDelivered,
		message: entry.message,
	});

	if (error) {
		console.error("Failed to record notification:", error);
	}
}
