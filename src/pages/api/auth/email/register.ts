import type { APIRoute } from "astro";
import { getSiteUrl } from "../../../../lib/env";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../../lib/supabase";
import { resolveTimezone } from "../../../../lib/timezones/timezones";
import { parseWithSchema, redirect } from "../../form-utils";

export const POST: APIRoute = async ({ request }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true },
		captcha_token: { type: "string", required: true },
		timezone: { type: "timezone" },
	} as const);

	if (!parsed.ok) {
		console.error("Registration attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/auth/register?error=invalid_form");
	}

	const { email, password, timezone, captcha_token } = parsed.data;
	const captchaToken = captcha_token;

	const userTimezone = await resolveTimezone({
		supabase,
		detectedTimezone: timezone ?? null,
	});

	const origin = getSiteUrl();
	const emailRedirectTo = `${origin}/auth/verified`;

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
		options: {
			emailRedirectTo,
			captchaToken,
		},
	});

	if (error) {
		if (error.code === "user_already_exists") {
			return redirect("/auth/register?error=user_already_exists");
		}
		console.error("User registration failed:", error);
		return redirect("/auth/register?error=failed");
	}

	if (data.user) {
		// Use admin client to bypass RLS for user profile creation
		const adminSupabase = createSupabaseAdminClient();

		const userProfileData = {
			id: data.user.id,
			email,
			timezone: userTimezone,
		};

		const { data: profile, error: profileError } = await adminSupabase
			.from("users")
			.upsert(userProfileData, {
				onConflict: "id",
			})
			.select()
			.single();

		if (profileError) {
			console.error("Failed to create user profile:", profileError);
			return redirect("/auth/register?error=profile_creation_failed");
		}

		if (!profile) {
			console.error("Profile creation returned no data");
			return redirect("/auth/register?error=profile_creation_failed");
		}
	}

	return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
};
