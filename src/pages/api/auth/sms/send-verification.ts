import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";
import { parseWithSchema } from "../../form-utils";
import { sendVerification } from "./verify-utils";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		console.error("SMS verification send attempt without authenticated user");
		return redirect("/?error=unauthorized&returnTo=/dashboard");
	}

	try {
		const formData = await request.formData();
		const parsed = parseWithSchema(formData, {
			phone_country_code: { type: "string", required: true },
			phone_national_number: { type: "string", required: true },
		} as const);

		if (!parsed.ok) {
			console.error("SMS verification form rejected due to invalid fields", {
				errors: parsed.allErrors,
			});
			return redirect("/dashboard?error=invalid_form");
		}

		const phoneCountryCode = parsed.data.phone_country_code;
		const phoneNationalNumber = parsed.data.phone_national_number;

		const fullPhone = `${phoneCountryCode}${phoneNationalNumber}`;

		const dbUser = await userService.getById(user.id);
		if (!dbUser) {
			console.error(
				`Auth user exists but database user record missing - ID: ${user.id}, email: ${user.email}, endpoint: sms/send-verification`,
			);
			return redirect("/dashboard?error=user_not_found");
		}
		if (dbUser.sms_opted_out) {
			console.error("SMS verification send blocked due to opt-out", {
				userId: user.id,
			});
			return redirect("/dashboard?error=sms_opted_out");
		}

		const result = await sendVerification(fullPhone);
		if (!result.success) {
			console.error("SMS verification failed:", result.error);
			return redirect(
				`/dashboard?error=${encodeURIComponent("verification_failed")}`,
			);
		}

		await userService.update(user.id, {
			phone_country_code: phoneCountryCode,
			phone_number: phoneNationalNumber,
			phone_verified: false,
		});

		return redirect("/dashboard?success=verification_sent");
	} catch (error) {
		console.error("Send verification error:", error);
		return redirect("/dashboard?error=server_error");
	}
};
