import type { APIRoute } from "astro";
import type { CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import twilio from "twilio";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";

/* =============
Inlined from lib/phone-validation.ts and lib/twilio.ts
============= */

const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
	throw new Error("Missing Twilio configuration in environment variables");
}

const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

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
			!validation.nationalNumber ||
			!validation.fullPhone
		) {
			return redirect("/alerts?error=invalid_phone");
		}

		await userService.update(user.id, {
			phone_country_code: validation.countryCode,
			phone_number: validation.nationalNumber,
			phone_verified: false,
		});

		const result = await sendVerification(validation.fullPhone);
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
