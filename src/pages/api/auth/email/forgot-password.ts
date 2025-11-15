import type { APIRoute } from "astro";
import { getSiteUrl } from "../../../../lib/env";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { parseWithSchema } from "../../form-utils";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	try {
		const formData = await request.formData();
		const parsed = parseWithSchema(formData, {
			email: { type: "string", required: true },
		} as const);

		if (!parsed.ok) {
			const errors = parsed.allErrors;
			console.error("Password reset request rejected due to invalid form", {
				errors,
			});
			return redirect("/auth/forgot?error=invalid_form");
		}

		const email = parsed.data.email;

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
