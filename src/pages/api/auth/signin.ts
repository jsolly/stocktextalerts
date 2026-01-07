import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { parseWithSchema } from "../form-utils";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true },
	} as const);

	if (!parsed.ok) {
		console.error("Sign-in attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/signin?error=invalid_form");
	}

	const email = parsed.data.email;
	const password = parsed.data.password;

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});

	if (error) {
		if (error.code === "email_not_confirmed") {
			console.error("Sign-in blocked due to unconfirmed email", {
				email,
			});
			return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
		}

		// Redirect back to the home page with a generic invalid credentials error
		console.error("Sign-in failed due to invalid credentials", {
			email,
			message: error.message,
		});
		return redirect(
			`/signin?error=invalid_credentials${email ? `&email=${encodeURIComponent(email)}` : ""}`,
		);
	}

	const { access_token, refresh_token } = data.session;
	cookies.set("sb-access-token", access_token, {
		path: "/",
	});
	cookies.set("sb-refresh-token", refresh_token, {
		path: "/",
	});
	return redirect("/dashboard");
};
