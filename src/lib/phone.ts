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

function normalizeCountryCode(countryCode: string): string {
	let normalized = countryCode.replace(/[^\d+]/g, "");
	const digitCount = (normalized.match(/\d/g) || []).length;
	if (digitCount === 0) {
		throw new Error("Country code must contain at least one digit");
	}
	const plusCount = (normalized.match(/\+/g) || []).length;
	if (plusCount > 1) {
		normalized = normalized.replace(/\+/g, "");
		normalized = `+${normalized}`;
	}
	if (normalized.startsWith("+")) {
		return normalized;
	}
	return `+${normalized}`;
}

function normalizePhoneNumber(phoneNumber: string): string {
	return phoneNumber.replace(/\D/g, "");
}

export function buildFullPhone(
	countryCode: string,
	nationalNumber: string,
): string {
	if (!countryCode?.trim() || !nationalNumber?.trim()) {
		throw new Error("Country code and national number are required");
	}
	const normalizedCountryCode = normalizeCountryCode(countryCode);
	const normalizedNationalNumber = normalizePhoneNumber(nationalNumber);
	return `${normalizedCountryCode}${normalizedNationalNumber}`;
}

interface TwilioError {
	code?: number;
	message?: string;
	more_info?: string;
	status?: number;
	details?: unknown;
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

		const rawCountryCode = `+${phoneNumber.countryCallingCode}`;
		const rawNationalNumber = phoneNumber.nationalNumber;
		const normalizedCountryCode = normalizeCountryCode(rawCountryCode);
		const normalizedNationalNumber = normalizePhoneNumber(rawNationalNumber);

		return {
			isValid: true,
			countryCode: normalizedCountryCode,
			nationalNumber: normalizedNationalNumber,
			fullPhone: `${normalizedCountryCode}${normalizedNationalNumber}`,
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

type VerificationClientResult =
	| { client: ReturnType<typeof twilio>; serviceSid: string; error?: never }
	| { client: null; serviceSid: null; error: string };

function createVerificationClient(): VerificationClientResult {
	const twilioAccountSid = import.meta.env.TWILIO_ORG_SID;
	const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
	const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

	if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
		return {
			client: null,
			serviceSid: null,
			error: "Missing Twilio configuration in environment variables",
		};
	}

	return {
		client: twilio(twilioAccountSid, twilioAuthToken),
		serviceSid: twilioVerifyServiceSid,
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
		const e = error as TwilioError;
		console.error("Verification send error:", {
			message: e.message,
			code: e.code,
			status: e.status,
			more_info: e.more_info,
		});
		return {
			success: false,
			error: e.message || "Failed to send verification",
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
		const e = error as TwilioError;
		console.error("Verification check error:", {
			message: e.message,
			code: e.code,
			status: e.status,
			more_info: e.more_info,
		});
		return {
			success: false,
			error: e.message || "Verification failed",
		};
	}
}
