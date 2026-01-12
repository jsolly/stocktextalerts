import type { APIRoute } from "astro";
import { getSiteUrl } from "../../../../lib/env";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { parseWithSchema } from "../../form-utils";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		captcha_token: { type: "string", required: true },
	} as const);

	if (!parsed.ok) {
		console.error("Resend verification request rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/auth/unconfirmed?error=invalid_form");
	}

	const email = parsed.data.email.trim();
	const captchaToken = parsed.data.captcha_token.trim();
	if (!captchaToken) {
		return redirect(
			`/auth/unconfirmed?email=${encodeURIComponent(email)}&error=captcha_required`,
		);
	}

	const origin = getSiteUrl();
	const emailRedirectTo = `${origin}/auth/verified`;

	const { error } = await supabase.auth.resend({
		type: "signup",
		email,
		options: {
			captchaToken,
			emailRedirectTo,
		},
	});

	if (error) {
		console.error("Resend verification email failed:", error);
		return redirect(
			`/auth/unconfirmed?email=${encodeURIComponent(email)}&error=failed`,
		);
	}

	return redirect(
		`/auth/unconfirmed?email=${encodeURIComponent(email)}&success=true`,
	);
};
