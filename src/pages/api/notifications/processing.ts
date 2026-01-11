import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateSms } from "../../../lib/format";
import { sendUserEmail } from "./email";
import { type EmailSender, formatEmailMessage } from "./email/utils";
import {
	recordNotification,
	type UserRecord,
	type UserStockRow,
} from "./shared";
import { sendUserSms } from "./sms";
import type { SmsSender } from "./sms/twilio-utils";

interface ProcessingStats {
	sent: boolean;
	logged: boolean;
}

export async function processEmailUpdate(
	supabase: SupabaseClient,
	user: UserRecord,
	userStocks: UserStockRow[],
	stocksList: string,
	sendEmail: EmailSender,
): Promise<ProcessingStats> {
	const message = formatEmailMessage(userStocks, stocksList);
	const result = await sendUserEmail(
		user,
		"Your Stock Update",
		message,
		sendEmail,
	);

	const logged = await recordNotification(supabase, {
		userId: user.id,
		type: "scheduled_update",
		deliveryMethod: "email",
		messageDelivered: result.success,
		message: message.text,
		error: result.success ? undefined : result.error,
		errorCode: result.success ? undefined : result.errorCode,
	});

	return {
		sent: result.success,
		logged,
	};
}

export async function processSmsUpdate(
	supabase: SupabaseClient,
	user: UserRecord,
	userStocks: UserStockRow[],
	stocksList: string,
	sendSms: SmsSender,
): Promise<ProcessingStats> {
	const messagePrefix = userStocks.length > 0 ? "Tracked: " : "";
	const fullMessage = `${messagePrefix}${stocksList}. Reply STOP to opt out.`;
	const smsMessage = truncateSms(fullMessage);

	const result = await sendUserSms(user, smsMessage, sendSms);

	const logged = await recordNotification(supabase, {
		userId: user.id,
		type: "scheduled_update",
		deliveryMethod: "sms",
		messageDelivered: result.success,
		message: smsMessage,
		error: result.success ? undefined : result.error,
		errorCode: result.success ? undefined : result.errorCode,
	});

	return {
		sent: result.success,
		logged,
	};
}
