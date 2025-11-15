/* =============
Twilio SMS
============= */

import twilio from "twilio";

import type { DeliveryResult } from "./contracts";

export interface TwilioConfig {
	accountSid: string;
	authToken: string;
	phoneNumber: string;
}

export interface SmsRequest {
	to: string;
	body: string;
	from?: string;
}

export type SmsSender = (request: SmsRequest) => Promise<DeliveryResult>;

export type TwilioClient = ReturnType<typeof twilio>;

export function readTwilioConfig(): TwilioConfig {
	const accountSid = import.meta.env.TWILIO_ACCOUNT_SID;
	const authToken = import.meta.env.TWILIO_AUTH_TOKEN;
	const phoneNumber = import.meta.env.TWILIO_PHONE_NUMBER;

	if (!accountSid || !authToken || !phoneNumber) {
		throw new Error("Missing Twilio configuration in environment variables");
	}

	return { accountSid, authToken, phoneNumber };
}

export function createTwilioClient(config: TwilioConfig): TwilioClient {
	return twilio(config.accountSid, config.authToken);
}

export function createSmsSender(
	client: TwilioClient,
	defaultFromNumber: string,
): SmsSender {
	return async (request: SmsRequest): Promise<DeliveryResult> => {
		const from = request.from ?? defaultFromNumber;

		try {
			await client.messages.create({
				body: request.body,
				from,
				to: request.to,
			});

			return { success: true };
		} catch (error) {
			console.error("Twilio SMS send error:", error);

			const errorMessage =
				error instanceof Error ? error.message : "Failed to send SMS";
			return {
				success: false,
				error: errorMessage,
			};
		}
	};
}
