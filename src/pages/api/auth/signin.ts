import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { parseWithSchema } from "../form-utils";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true },
		captcha_token: { type: "string" },
	} as const);

	if (!parsed.ok) {
		console.error("Sign-in attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/signin?error=invalid_form");
	}

	const email = parsed.data.email;
	const password = parsed.data.password;
	const captchaToken = parsed.data.captcha_token;

	if (!captchaToken) {
		console.error("Sign-in attempt rejected due to missing captcha token", {
			email,
		});
		return redirect(
			`/signin?error=captcha_required&email=${encodeURIComponent(email)}`,
		);
	}

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
		options: {
			captchaToken,
		},
	});

	if (error) {
		if (error.code === "email_not_confirmed") {
			console.error("Sign-in blocked due to unconfirmed email", {
				email,
			});
			return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
		}

		console.error("Sign-in failed", {
			email,
			message: error.message,
		});

		return redirect(
			`/signin?error=invalid_credentials&email=${encodeURIComponent(email)}`,
		);
	}

	const { access_token, refresh_token } = data.session;
	cookies.set("sb-access-token", access_token, {
		path: "/",
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
	});
	cookies.set("sb-refresh-token", refresh_token, {
		path: "/",
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
	});
	return redirect("/dashboard");
};
