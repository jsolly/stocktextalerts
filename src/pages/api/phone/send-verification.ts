import type { APIRoute } from "astro";
import { validatePhone } from "../../../lib/phone-validation";
import {
	checkVerificationRateLimit,
	logVerificationAttempt,
} from "../../../lib/rate-limiting";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { sendVerification } from "../../../lib/twilio";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/register?error=unauthorized");
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

		const result = await sendVerification(validation.fullPhone || "");
		if (!result.success) {
			return redirect(
				`/alerts?error=${encodeURIComponent(result.error || "verification_failed")}`,
			);
		}

		await userService.update(user.id, {
			phone_country_code: validation.countryCode,
			phone_number: validation.nationalNumber,
			phone_verified: false,
		});

		return redirect("/alerts?success=verification_sent");
	} catch (error) {
		console.error("Send verification error:", error);
		return redirect("/alerts?error=server_error");
	}
};
