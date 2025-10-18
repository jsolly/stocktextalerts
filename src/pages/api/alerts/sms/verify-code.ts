import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { checkVerification } from "../../../../lib/phone";
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
		const code = formData.get("code") as string;

		if (!code) {
			return redirect("/alerts?error=code_required");
		}

		const userData = await userService.getById(user.id);
		if (!userData.phone_country_code || !userData.phone_number) {
			return redirect("/alerts?error=phone_not_set");
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
