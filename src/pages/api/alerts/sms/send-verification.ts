import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { sendVerification, validatePhone } from "../../../../lib/phone";
import { createUserService } from "../../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/?error=unauthorized&returnTo=/alerts");
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
			console.error("SMS verification failed:", result.error);
			await userService.update(user.id, {
				phone_country_code: null,
				phone_number: null,
				phone_verified: false,
			});
			return redirect(
				`/alerts?error=${encodeURIComponent("verification_failed")}`,
			);
		}

		return redirect("/alerts?success=verification_sent");
	} catch (error) {
		console.error("Send verification error:", error);
		return redirect("/alerts?error=server_error");
	}
};
