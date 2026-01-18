import type { APIRoute } from "astro";
import { redirect } from "../../../../lib/api-utils";
import { getSiteUrl } from "../../../../lib/env";
import { parseWithSchema } from "../../../../lib/forms/parsing";
import { getRequestIp, verifyHCaptchaToken } from "../../../../lib/hcaptcha";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../../lib/supabase";
import { resolveTimezone } from "../../../../lib/timezones/timezones";

export const POST: APIRoute = async ({ request }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true, trim: false },
		captcha_token: { type: "string", required: true },
		timezone: { type: "timezone" },
	} as const);

	if (!parsed.ok) {
		console.error("Registration attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/auth/register?error=invalid_form");
	}

	const {
		email,
		password,
		timezone,
		captcha_token: captchaToken,
	} = parsed.data;

	try {
		const verification = await verifyHCaptchaToken({
			token: captchaToken,
			remoteIp: getRequestIp(request),
		});

		if (!verification.success) {
			console.error("Registration rejected due to captcha failure", {
				email,
				errorCodes: verification.errorCodes,
			});
			return redirect("/auth/register?error=captcha_required");
		}
	} catch (error) {
		console.error("Registration rejected due to captcha error", {
			email,
			error,
		});
		return redirect("/auth/register?error=captcha_required");
	}

	const userTimezone = await resolveTimezone({
		supabase,
		detectedTimezone: timezone,
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
