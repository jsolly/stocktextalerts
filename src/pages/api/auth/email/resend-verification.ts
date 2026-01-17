import type { APIRoute } from "astro";
import { getSiteUrl } from "../../../../lib/env";
import { getRequestIp, verifyHCaptchaToken } from "../../../../lib/hcaptcha";
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

	const email = parsed.data.email;
	const captchaToken = parsed.data.captcha_token;

	if (/\s/.test(email)) {
		return redirect("/auth/unconfirmed?error=invalid_form");
	}

	try {
		const verification = await verifyHCaptchaToken({
			token: captchaToken,
			remoteIp: getRequestIp(request),
		});

		if (!verification.success) {
			console.error("Resend verification rejected due to captcha failure", {
				email,
				errorCodes: verification.errorCodes,
			});
			return redirect(
				`/auth/unconfirmed?email=${encodeURIComponent(email)}&error=captcha_required`,
			);
		}
	} catch (error) {
		console.error("Resend verification rejected due to captcha error", {
			email,
			error,
		});
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
			emailRedirectTo,
			captchaToken,
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
