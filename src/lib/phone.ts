import {
	type CountryCode,
	parsePhoneNumberFromString,
} from "libphonenumber-js";
import twilio from "twilio";

export interface PhoneValidationResult {
	isValid: boolean;
	countryCode?: string;
	nationalNumber?: string;
	fullPhone?: string;
	error?: string;
}

export function buildFullPhone(
	countryCode: string,
	nationalNumber: string,
): string {
	return `${countryCode}${nationalNumber}`;
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
	// Assume trusted E.164 input from the front-end; do not validate or normalize.
	const digits = phone.startsWith("+") ? phone.slice(1) : phone;

	// Derive country calling code based on provided region hint only.
	const countryCallingCode = country === "GB" ? "44" : "1";

	const national = digits.startsWith(countryCallingCode)
		? digits.slice(countryCallingCode.length)
		: digits;

	const cc = `+${countryCallingCode}`;
	return {
		isValid: true,
		countryCode: cc,
		nationalNumber: national,
		fullPhone: `${cc}${national}`,
	};
}

export function formatPhoneForDisplay(
	phone: string | null | undefined,
	options?: {
		countryCode?: string | null | undefined;
		fallbackRegion?: CountryCode;
	},
): string | null {
	if (!phone) {
		return null;
	}

	const trimmed = phone.trim();

	if (!trimmed) {
		return null;
	}

	const digitsOnly = trimmed.replace(/\D/g, "");
	const fallbackRegion = options?.fallbackRegion ?? "US";

	const attempts: Array<() => string | null> = [];

	if (options?.countryCode) {
		attempts.push(() => {
			const combined = `${options.countryCode as string}${digitsOnly}`;
			const parsed = parsePhoneNumberFromString(combined);
			return parsed ? parsed.formatNational() : null;
		});
	}

	attempts.push(() => {
		const parsed = parsePhoneNumberFromString(digitsOnly, fallbackRegion);
		return parsed ? parsed.formatNational() : null;
	});

	for (const attempt of attempts) {
		try {
			const formatted = attempt();
			if (formatted) {
				return formatted;
			}
		} catch {
			// ignore and try next strategy
		}
	}

	return trimmed;
}

/* =============
Phone Verification
============= */

type VerificationClientResult =
	| { client: ReturnType<typeof twilio>; serviceSid: string; error?: never }
	| { client: null; serviceSid: null; error: string };

function createVerificationClient(): VerificationClientResult {
	const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
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
