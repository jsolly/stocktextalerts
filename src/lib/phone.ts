import type { CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import twilio from "twilio";

export interface PhoneValidationResult {
	isValid: boolean;
	countryCode?: string;
	nationalNumber?: string;
	fullPhone?: string;
	error?: string;
}

export function validatePhone(
	phone: string,
	country: CountryCode = "US",
): PhoneValidationResult {
	try {
		const phoneNumber = parsePhoneNumberFromString(phone, country);

		if (!phoneNumber || !phoneNumber.isValid()) {
			return {
				isValid: false,
				error: "Invalid phone number format",
			};
		}

		return {
			isValid: true,
			countryCode: `+${phoneNumber.countryCallingCode}`,
			nationalNumber: phoneNumber.nationalNumber,
			fullPhone: phoneNumber.number,
		};
	} catch (error) {
		return {
			isValid: false,
			error: error instanceof Error ? error.message : "Phone validation failed",
		};
	}
}

/* =============
Phone Verification
============= */

function createVerificationClient() {
	const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
	const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
	const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

	if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
		return {
			client: null,
			serviceSid: null,
			error: "Missing Twilio configuration in environment variables" as const,
		};
	}

	return {
		client: twilio(twilioAccountSid, twilioAuthToken),
		serviceSid: twilioVerifyServiceSid,
		error: undefined,
	};
}

export async function sendVerification(
	fullPhone: string,
): Promise<{ success: boolean; error?: string }> {
	const { client, serviceSid, error } = createVerificationClient();

	if (!client || !serviceSid || error) {
		console.error("Verification client creation failed:", error);
		return { success: false, error };
	}

	try {
		await client.verify.v2
			.services(serviceSid)
			.verifications.create({ to: fullPhone, channel: "sms" });

		return { success: true };
	} catch (error) {
		const e = error as any;
		console.error("Verification send error:", {
			message: e?.message,
			code: e?.code,
			status: e?.status,
			moreInfo: e?.moreInfo,
		});
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
	const { client, serviceSid, error } = createVerificationClient();

	if (!client || !serviceSid || error) {
		console.error("Verification client creation failed:", error);
		return { success: false, error };
	}

	try {
		const verificationCheck = await client.verify.v2
			.services(serviceSid)
			.verificationChecks.create({ to: fullPhone, code });

		if (verificationCheck.status === "approved") {
			return { success: true };
		}

		return { success: false, error: "Invalid verification code" };
	} catch (error) {
		const e = error as any;
		console.error("Verification check error:", {
			message: e?.message,
			code: e?.code,
			status: e?.status,
			moreInfo: e?.moreInfo,
		});
		return {
			success: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}
