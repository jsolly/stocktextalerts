import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "../../../lib/users";

export type DeliveryMethod = "email" | "sms";

export type DeliveryResult =
	| { success: true; messageSid?: string }
	| { success: false; error: string; errorCode?: string };

export interface NotificationLogEntry {
	userId: string;
	type: string;
	deliveryMethod: DeliveryMethod;
	messageDelivered: boolean;
	message?: string;
	error?: string;
	errorCode?: string;
}

export type UserRecord = Pick<
	User,
	| "id"
	| "email"
	| "phone_country_code"
	| "phone_number"
	| "phone_verified"
	| "sms_opted_out"
	| "timezone"
	| "daily_digest_enabled"
	| "daily_digest_notification_time"
	| "email_notifications_enabled"
	| "sms_notifications_enabled"
>;

export interface UserStockRow {
	symbol: string;
	name: string;
}

type UserStockQueryResult = {
	symbol: string;
	stocks: { name: string } | null;
};

export function shouldNotifyUser(
	user: UserRecord,
	getCurrentTime: () => Date,
): boolean {
	if (!user.daily_digest_enabled) {
		return false;
	}

	if (!user.timezone) {
		return false;
	}

	const storedTime = user.daily_digest_notification_time;

	const currentMinutes = getCurrentMinutesInTimezone(
		user.timezone,
		getCurrentTime,
	);

	if (currentMinutes === null) {
		console.error("Unable to determine current time for user timezone", {
			userId: user.id,
			timezone: user.timezone,
		});
		return false;
	}

	return currentMinutes === storedTime;
}

export function getCurrentMinutesInTimezone(
	timezone: string,
	getCurrentTime: () => Date,
): number | null {
	try {
		const date = getCurrentTime();
		const formatter = new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "numeric",
			hourCycle: "h23",
			timeZone: timezone,
		});
		const parts = formatter.formatToParts(date);
		const hourPart = parts.find((part) => part.type === "hour");
		const minutePart = parts.find((part) => part.type === "minute");

		if (!hourPart || !minutePart) {
			return null;
		}

		const hours = Number.parseInt(hourPart.value, 10);
		const minutes = Number.parseInt(minutePart.value, 10);

		if (Number.isNaN(hours) || Number.isNaN(minutes)) {
			return null;
		}

		return hours * 60 + minutes;
	} catch {
		console.error("Failed to parse time from timezone", { timezone });
		return null;
	}
}

export async function loadUserStocks(
	supabase: SupabaseClient,
	userId: string,
): Promise<UserStockRow[] | null> {
	const { data: stocks, error } = await supabase
		.from("user_stocks")
		.select("symbol, stocks(name)")
		.eq("user_id", userId);

	if (error) {
		console.error("Failed to load user stocks", {
			userId,
			error,
		});
		return null;
	}

	if (!stocks || stocks.length === 0) {
		return [];
	}

	// Transform the nested structure to flat UserStockRow[]
	// Type assertion needed because Supabase's inferred types for nested selects
	// are incorrect without generated Database types
	return (stocks as unknown as UserStockQueryResult[]).map((stock) => ({
		symbol: stock.symbol,
		name: stock.stocks?.name ?? stock.symbol,
	}));
}

export async function recordNotification(
	supabase: SupabaseClient,
	entry: NotificationLogEntry,
): Promise<boolean> {
	const { error } = await supabase.from("notification_log").insert({
		user_id: entry.userId,
		type: entry.type,
		delivery_method: entry.deliveryMethod,
		message_delivered: entry.messageDelivered,
		message: entry.message,
		error: entry.error,
		error_code: entry.errorCode,
	});

	if (error) {
		console.error("Failed to record notification:", error);
		return false;
	}

	return true;
}
