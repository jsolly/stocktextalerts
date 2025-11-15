import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";
import { parseWithSchema } from "../../form-utils";
import { checkVerification } from "./verify-utils";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		console.error("SMS verification attempt without authenticated user");
		return redirect("/?error=unauthorized&returnTo=/dashboard");
	}

	try {
		const formData = await request.formData();
		const parsed = parseWithSchema(formData, {
			code: { type: "string", required: true },
		} as const);

		if (!parsed.ok) {
			console.error(
				"SMS verification code form rejected due to invalid fields",
				{
					errors: parsed.allErrors,
				},
			);
			return redirect("/dashboard?error=invalid_form");
		}

		const code = parsed.data.code;

		const userData = await userService.getById(user.id);
		if (!userData) {
			console.error(
				`Auth user exists but database user record missing - ID: ${user.id}, email: ${user.email}, endpoint: sms/verify-code`,
			);
			return redirect("/dashboard?error=user_not_found");
		}
		if (!userData.phone_country_code || !userData.phone_number) {
			console.error("SMS verification requested but phone details missing", {
				userId: user.id,
			});
			return redirect("/dashboard?error=phone_not_set");
		}

		const fullPhone = `${userData.phone_country_code}${userData.phone_number}`;
		const result = await checkVerification(fullPhone, code);

		if (!result.success) {
			console.error("Verification failed:", result.error);
			return redirect("/dashboard?error=invalid_code");
		}

		await userService.update(user.id, {
			phone_verified: true,
		});

		return redirect("/dashboard?success=phone_verified");
	} catch (error) {
		console.error(
			"Verify code error:",
			error instanceof Error ? error.message : "Unknown error",
		);
		return redirect("/dashboard?error=server_error");
	}
};
