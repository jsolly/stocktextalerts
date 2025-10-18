import twilio from "twilio";
import { validatePhone } from "./phone-validation";

const accountSid = import.meta.env.TWILIO_ACCOUNT_SID;
const authToken = import.meta.env.TWILIO_AUTH_TOKEN;
const phoneNumber = import.meta.env.TWILIO_PHONE_NUMBER;
const verifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken || !phoneNumber || !verifyServiceSid) {
	throw new Error("Missing Twilio configuration in environment variables");
}

const client = twilio(accountSid, authToken);

/* =============
Verification
============= */

export async function sendVerification(
	fullPhone: string,
): Promise<{ success: boolean; error?: string }> {
	const validation = validatePhone(fullPhone);
	if (!validation.isValid) {
		return { success: false, error: validation.error };
	}

	try {
		await client.verify.v2
			.services(verifyServiceSid)
			.verifications.create({ to: fullPhone, channel: "sms" });

		return { success: true };
	} catch (error) {
		console.error("Twilio verification send error:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to send verification",
		};
	}
}

export async function checkVerification(
	fullPhone: string,
	code: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const verificationCheck = await client.verify.v2
			.services(verifyServiceSid)
			.verificationChecks.create({ to: fullPhone, code });

		if (verificationCheck.status === "approved") {
			return { success: true };
		}

		return { success: false, error: "Invalid verification code" };
	} catch (error) {
		console.error("Twilio verification check error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

/* =============
SMS Sending
============= */

export async function sendSMS(
	to: string,
	message: string,
): Promise<{ success: boolean; error?: string }> {
	const validation = validatePhone(to);
	if (!validation.isValid) {
		return { success: false, error: validation.error };
	}

	try {
		await client.messages.create({
			body: message,
			from: phoneNumber,
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
