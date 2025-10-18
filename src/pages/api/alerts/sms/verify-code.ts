import type { APIRoute } from "astro";
import twilio from "twilio";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";

/* =============
Inlined from lib/rate-limiting.ts and lib/twilio.ts
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

async function checkVerificationRateLimit(
	phoneCountryCode: string,
	phoneNumber: string,
): Promise<{ allowed: boolean; error?: string }> {
	const supabase = createSupabaseServerClient();

	const oneHourAgo = new Date();
	oneHourAgo.setHours(oneHourAgo.getHours() - WINDOW_HOURS);

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
		const unit = WINDOW_HOURS === 1 ? "hour" : "hours";
		return {
			allowed: false,
			error: `Too many verification attempts. Please try again in ${WINDOW_HOURS} ${unit}`,
		};
	}

	return { allowed: true };
}

async function checkVerification(
	fullPhone: string,
	code: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const verificationCheck = await twilioClient.verify.v2
			.services(twilioVerifyServiceSid)
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

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/auth/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();
		const code = formData.get("code") as string;

		if (!code) {
			return redirect("/alerts?error=code_required");
		}

		const userData = await userService.getById(user.id);
		if (!userData.phone_country_code || !userData.phone_number) {
			return redirect("/alerts?error=phone_not_set");
		}

		const rateLimit = await checkVerificationRateLimit(
			userData.phone_country_code,
			userData.phone_number,
		);
		if (!rateLimit.allowed) {
			return redirect(
				`/alerts?error=${encodeURIComponent(rateLimit.error || "rate_limit_exceeded")}`,
			);
		}

		const fullPhone = `${userData.phone_country_code}${userData.phone_number}`;
		const result = await checkVerification(fullPhone, code);

		if (!result.success) {
			return redirect(
				`/alerts?error=${encodeURIComponent(result.error || "invalid_code")}`,
			);
		}

		await userService.update(user.id, {
			phone_verified: true,
		});

		return redirect("/alerts?success=phone_verified");
	} catch (error) {
		console.error("Verify code error:", error);
		return redirect("/alerts?error=server_error");
	}
};
