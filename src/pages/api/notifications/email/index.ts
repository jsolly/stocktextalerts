import type { DeliveryResult, UserRecord } from "../shared";
import type { EmailSender } from "./utils";

export async function sendUserEmail(
	user: UserRecord,
	subject: string,
	body: string,
	sendEmail: EmailSender,
): Promise<DeliveryResult> {
	try {
		return await sendEmail({
			to: user.email,
			subject,
			body,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("Failed to send email", {
			userId: user.id,
			error,
		});
		return { success: false, error: errorMessage };
	}
}

export function shouldSendEmail(user: UserRecord): boolean {
	return user.email_notifications_enabled;
}
