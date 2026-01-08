import type { SupabaseClient } from "@supabase/supabase-js";

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

export interface UserRecord {
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
	notification_frequency: "hourly" | "daily";
	daily_notification_hour: number | null;
	breaking_news_enabled: boolean;
	breaking_news_threshold_percent: number | null;
	breaking_news_outside_window: boolean;
}

export interface UserStockRow {
	symbol: string;
	name: string;
}

export function shouldNotifyUser(
	user: UserRecord,
	getCurrentTime: () => Date,
): boolean {
	if (!user.timezone) {
		return false;
	}

	const currentHour = getCurrentHourInTimezone(user.timezone, getCurrentTime);

	if (currentHour === null) {
		console.error("Unable to determine current hour for user timezone", {
			userId: user.id,
			timezone: user.timezone,
		});
		return false;
	}

	const withinWindow: boolean = isHourWithinWindow(
		currentHour,
		user.notification_start_hour,
		user.notification_end_hour,
	);

	if (!withinWindow) {
		return false;
	}

	if (user.notification_frequency === "daily") {
		const targetHour =
			user.daily_notification_hour ?? user.notification_start_hour;
		return currentHour === targetHour;
	}

	return true;
}

export function shouldNotifyBreakingNews(
	user: UserRecord,
	getCurrentTime: () => Date,
): boolean {
	if (!user.breaking_news_enabled) {
		return false;
	}

	if (user.breaking_news_outside_window) {
		return true;
	}

	if (!user.timezone) {
		return false;
	}

	const currentHour = getCurrentHourInTimezone(user.timezone, getCurrentTime);

	if (currentHour === null) {
		return false;
	}

	return isHourWithinWindow(
		currentHour,
		user.notification_start_hour,
		user.notification_end_hour,
	);
}

export function getCurrentHourInTimezone(
	timezone: string,
	getCurrentTime: () => Date,
): number | null {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			hourCycle: "h23",
			timeZone: timezone,
		});
		const parts = formatter.formatToParts(getCurrentTime());
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

export function isHourWithinWindow(
	hour: number,
	start: number,
	end: number,
): boolean {
	if (start === end) {
		return hour === start;
	}

	if (start < end) {
		return hour >= start && hour <= end;
	}

	return hour >= start || hour <= end;
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
	return stocks.map((stock) => {
		const stocksData = stock.stocks as unknown as { name: string } | null;
		return {
			symbol: stock.symbol,
			name: stocksData?.name ?? stock.symbol,
		};
	});
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
