import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { getSiteUrl } from "../../../../lib/env";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	try {
		const formData = await request.formData();
		const email = formData.get("email")?.toString();

		if (!email) {
			return redirect("/auth/forgot?error=email_required");
		}

		const redirectTo = new URL("/auth/recover", getSiteUrl()).toString();

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo,
		});

		if (error) {
			console.error("Password reset request failed:", error);

			if (error.status === 429) {
				const seconds = error.message?.match(/(\d+)\s+seconds?/)?.[1];
				if (seconds) {
					return redirect(`/auth/forgot?error=rate_limit&seconds=${seconds}`);
				}
				return redirect("/auth/forgot?error=rate_limit");
			}

			return redirect("/auth/forgot?error=failed");
		}

		return redirect("/auth/forgot?success=true");
	} catch (error) {
		console.error("Password reset request failed:", error);
		return redirect("/auth/forgot?error=failed");
	}
};
