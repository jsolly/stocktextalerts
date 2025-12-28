import { Resend } from "resend";
import type { DeliveryResult, UserStockRow } from "../shared";

export interface EmailRequest {
	to: string;
	subject: string;
	body: string;
}

export type EmailSender = (request: EmailRequest) => Promise<DeliveryResult>;

export function createEmailSender(): EmailSender {
	const apiKey = import.meta.env.RESEND_API_KEY;
	const fromEmail = import.meta.env.EMAIL_FROM;

	if (!apiKey) {
		console.warn("RESEND_API_KEY is not set. Emails will not be sent.");
		return async () => ({ success: false, error: "RESEND_API_KEY missing" });
	}

	if (!apiKey.startsWith("re_")) {
		console.warn(
			"RESEND_API_KEY has invalid format. Expected key starting with 're_'.",
		);
		return async () => ({
			success: false,
			error: "RESEND_API_KEY has invalid format",
		});
	}

	const resend = new Resend(apiKey);

	return async ({ to, subject, body }) => {
		try {
			const { data, error } = await resend.emails.send({
				from: fromEmail || "notifications@updates.stocktextalerts.com",
				to,
				subject,
				text: body,
			});

			if (error) {
				console.error("Resend error:", error);
				return { success: false, error: error.message };
			}

			return { success: true, messageSid: data?.id };
		} catch (error) {
			console.error("Unexpected error sending email:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
}

export function formatEmailMessage(
	userStocks: UserStockRow[],
	stocksList: string,
): string {
	if (userStocks.length === 0) {
		return stocksList;
	}
	return `Your tracked stocks: ${stocksList}`;
}
