import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateSms } from "../../../../lib/format";
import type {
	DeliveryMethod,
	DeliveryResult,
	NotificationLogEntry,
} from "../contracts";
import type { SmsSender } from "../twilio-utils";

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

export interface SendScheduledDependencies {
	supabase: SupabaseClient;
	sendEmail: EmailSender;
	sendSms: SmsSender;
	getCurrentTime?: () => Date;
}

export interface SendScheduledResult {
	skipped: number;
	logFailures: number;
	emailsSent: number;
	emailsFailed: number;
	smsSent: number;
	smsFailed: number;
}

async function sendAndRecord(
	supabase: SupabaseClient,
	user: UserRecord,
	deliveryMethod: DeliveryMethod,
	message: string,
	sendFn: () => Promise<DeliveryResult>,
): Promise<{ deliverySuccess: boolean; logRecorded: boolean }> {
	let result: DeliveryResult;

	try {
		result = await sendFn();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Failed to send scheduled ${deliveryMethod} notification`, {
			userId: user.id,
			error,
		});
		result = { success: false, error: errorMessage };
	}

	const notificationMessage = result.success ? message : result.error;

	const logEntry: NotificationLogEntry = {
		userId: user.id,
		type: "scheduled_update",
		deliveryMethod,
		messageDelivered: result.success,
		message: notificationMessage,
		error: result.success ? undefined : result.error,
		errorCode: result.success ? undefined : result.errorCode,
	};

	const logRecorded = await recordNotification(supabase, logEntry);
	return { deliverySuccess: result.success, logRecorded };
}

export async function sendScheduledNotifications(
	deps: SendScheduledDependencies,
): Promise<SendScheduledResult> {
	const {
		supabase,
		sendEmail,
		sendSms,
		getCurrentTime = () => new Date(),
	} = deps;

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
		const error = new Error(
			"Failed to fetch users for scheduled notifications",
		);
		error.name = "ScheduledNotificationUserFetchError";
		throw Object.assign(error, { cause: usersError });
	}

	let skippedCount = 0;
	let logFailureCount = 0;
	let emailsSent = 0;
	let emailsFailed = 0;
	let smsSent = 0;
	let smsFailed = 0;

	for (const user of users ?? []) {
		if (!shouldNotifyUser(user, getCurrentTime)) {
			skippedCount++;
			continue;
		}

		const userStocks = await loadUserStocks(supabase, user.id);
		if (userStocks === null) {
			skippedCount++;
			continue;
		}

		const stocksList =
			userStocks.length === 0
				? "You don't have any tracked stocks"
				: userStocks.map((stock) => stock.symbol).join(", ");

		if (user.email_notifications_enabled) {
			const message = formatEmailMessage(userStocks, stocksList);

			const { deliverySuccess, logRecorded } = await sendAndRecord(
				supabase,
				user,
				"email",
				message,
				() =>
					sendEmail({
						to: user.email,
						subject: "Your Stock Update",
						body: message,
					}),
			);

			if (deliverySuccess) {
				emailsSent++;
			} else {
				emailsFailed++;
			}

			if (!logRecorded) {
				logFailureCount++;
			}
		}

		if (shouldSendSms(user)) {
			const smsMessage = truncateSms(
				userStocks.length === 0
					? `${stocksList}. Reply STOP to opt out.`
					: `Tracked: ${stocksList}. Reply STOP to opt out.`,
			);

			const fullPhone = `${user.phone_country_code}${user.phone_number}`;

			const { deliverySuccess, logRecorded } = await sendAndRecord(
				supabase,
				user,
				"sms",
				smsMessage,
				() =>
					sendSms({
						to: fullPhone,
						body: smsMessage,
					}),
			);

			if (deliverySuccess) {
				smsSent++;
			} else {
				smsFailed++;
			}

			if (!logRecorded) {
				logFailureCount++;
			}
		}
	}

	return {
		skipped: skippedCount,
		logFailures: logFailureCount,
		emailsSent,
		emailsFailed,
		smsSent,
		smsFailed,
	};
}

function shouldNotifyUser(
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

	return stocks;
}

function formatEmailMessage(
	userStocks: UserStockRow[],
	stocksList: string,
): string {
	if (userStocks.length === 0) {
		return stocksList;
	}
	return `Your tracked stocks: ${stocksList}`;
}

function getCurrentHourInTimezone(
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
