import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { truncateEmailForLogging } from "../../../../lib/format";
import { sendVerification, validatePhone } from "../../../../lib/phone";
import { createUserService } from "../../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/?error=unauthorized&returnTo=/dashboard");
	}

	try {
		const formData = await request.formData();
		const rawPhone = formData.get("phone");
		const phoneInput =
			typeof rawPhone === "string" ? rawPhone.trim() : undefined;

		if (!phoneInput) {
			throw new Error("Missing phone input");
		}

		const validation = validatePhone(phoneInput);
		if (
			!validation.isValid ||
			!validation.countryCode ||
			!validation.nationalNumber ||
			!validation.fullPhone
		) {
			throw new Error(validation.error ?? "Invalid phone number");
		}

		const dbUser = await userService.getById(user.id);
		if (!dbUser) {
			console.error(
				`Auth user exists but database user record missing - ID: ${user.id}, email: ${user.email ? truncateEmailForLogging(user.email) : "none"}, endpoint: sms/send-verification`,
			);
			return redirect("/dashboard?error=user_not_found");
		}
		if (dbUser.sms_opted_out) {
			return redirect("/dashboard?error=sms_opted_out");
		}

		const result = await sendVerification(validation.fullPhone);
		if (!result.success) {
			console.error("SMS verification failed:", result.error);
			return redirect(
				`/dashboard?error=${encodeURIComponent("verification_failed")}`,
			);
		}

		await userService.update(user.id, {
			phone_country_code: validation.countryCode,
			phone_number: validation.nationalNumber,
			phone_verified: false,
		});

		return redirect("/dashboard?success=verification_sent");
	} catch (error) {
		console.error("Send verification error:", error);
		return redirect("/dashboard?error=server_error");
	}
};
