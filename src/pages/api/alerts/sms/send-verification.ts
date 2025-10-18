import type { APIRoute } from "astro";
import type { CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import twilio from "twilio";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";

/* =============
Inlined from lib/phone-validation.ts, lib/rate-limiting.ts, and lib/twilio.ts
============= */

const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
	throw new Error("Missing Twilio configuration in environment variables");
}

const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

const MAX_ATTEMPTS = 3;
const WINDOW_HOURS = 1;

interface PhoneValidationResult {
	isValid: boolean;
	countryCode?: string;
	nationalNumber?: string;
	fullPhone?: string;
	error?: string;
}

function validatePhone(
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

async function checkVerificationRateLimit(
	phoneCountryCode: string,
	phoneNumber: string,
): Promise<{ allowed: boolean; error?: string }> {
	const supabase = createSupabaseServerClient();

	const oneHourAgo = new Date();
	oneHourAgo.setHours(oneHourAgo.getHours() - WINDOW_HOURS);

	const cleanupResult = await supabase
		.from("verification_attempts")
		.delete()
		.lt("attempted_at", oneHourAgo.toISOString());

	if (cleanupResult.error) {
		console.error(
			"Non-blocking cleanup error: failed to delete old verification_attempts",
			{
				table: "verification_attempts",
				filter: `attempted_at < ${oneHourAgo.toISOString()}`,
				error: cleanupResult.error,
			},
		);
	}

	const { data, error } = await supabase
		.from("verification_attempts")
		.select("id")
		.eq("phone_country_code", phoneCountryCode)
		.eq("phone_number", phoneNumber)
		.gte("attempted_at", oneHourAgo.toISOString());

	if (error) {
		console.error("Rate limit check error:", error);
		return { allowed: false, error: "Failed to check rate limit" };
	}

	if (data && data.length >= MAX_ATTEMPTS) {
		return {
			allowed: false,
			error: `Too many verification attempts. Please try again in ${WINDOW_HOURS} hour`,
		};
	}

	return { allowed: true };
}

async function logVerificationAttempt(
	phoneCountryCode: string,
	phoneNumber: string,
): Promise<void> {
	const supabase = createSupabaseServerClient();

	const { error } = await supabase.from("verification_attempts").insert({
		phone_country_code: phoneCountryCode,
		phone_number: phoneNumber,
	});

	if (error) {
		console.error("Failed to log verification attempt:", error);
	}
}

async function sendVerification(
	fullPhone: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		await twilioClient.verify.v2
			.services(twilioVerifyServiceSid)
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

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/auth/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();
		const phoneInput = formData.get("phone") as string;

		if (!phoneInput) {
			return redirect("/alerts?error=phone_required");
		}

		const validation = validatePhone(phoneInput);
		if (
			!validation.isValid ||
			!validation.countryCode ||
			!validation.nationalNumber
		) {
			return redirect("/alerts?error=invalid_phone");
		}

		const rateLimit = await checkVerificationRateLimit(
			validation.countryCode,
			validation.nationalNumber,
		);

		if (!rateLimit.allowed) {
			return redirect(
				`/alerts?error=${encodeURIComponent(rateLimit.error || "rate_limit")}`,
			);
		}

		await logVerificationAttempt(
			validation.countryCode,
			validation.nationalNumber,
		);

		const fullPhone = validation.fullPhone;
		if (!fullPhone) {
			throw new Error(
				"Unexpected: fullPhone missing after successful validation",
			);
		}

		await userService.update(user.id, {
			phone_country_code: validation.countryCode,
			phone_number: validation.nationalNumber,
			phone_verified: false,
		});

		const result = await sendVerification(fullPhone);
		if (!result.success) {
			await userService.update(user.id, {
				phone_country_code: null,
				phone_number: null,
				phone_verified: false,
			});
			return redirect(
				`/alerts?error=${encodeURIComponent(result.error || "verification_failed")}`,
			);
		}

		return redirect("/alerts?success=verification_sent");
	} catch (error) {
		console.error("Send verification error:", error);
		return redirect("/alerts?error=server_error");
	}
};
