import type { APIRoute } from "astro";
import { getSiteUrl } from "../../../../lib/env";
import {
	checkAndIncrementRateLimit,
	ONE_HOUR_SECONDS,
} from "../../../../lib/rate-limit";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../../lib/supabase";
import { resolveTimezone } from "../../../../lib/timezones";
import { parseWithSchema, redirect } from "../../form-utils";

export const POST: APIRoute = async ({ request }) => {
	const clientIp =
		request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

	// Rate limit: 10 attempts per hour
	const limitResult = await checkAndIncrementRateLimit(
		`register:${clientIp}`,
		ONE_HOUR_SECONDS,
		10,
	);

	if (!limitResult.allowed) {
		console.warn(
			`Rate limit exceeded for registration from IP: ${clientIp}. Reset at ${limitResult.resetTime}`,
		);
		const now = new Date();
		const durationSeconds = Math.ceil(
			(limitResult.resetTime.getTime() - now.getTime()) / 1000,
		);
		const resetTimeParams = new URLSearchParams({
			error: "rate_limit",
			reset_seconds: durationSeconds.toString(),
		});
		return redirect(`/auth/register?${resetTimeParams.toString()}`);
	}

	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true },
		timezone: { type: "timezone" },
		utc_offset_minutes: { type: "integer" },
	} as const);

	if (!parsed.ok) {
		console.error("Registration attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/auth/register?error=invalid_form");
	}

	const { email, password, timezone, utc_offset_minutes } = parsed.data;

	const resolvedTimezone = await resolveTimezone({
		supabase,
		detectedTimezone: timezone,
		utcOffsetMinutes: utc_offset_minutes,
	});

	const origin = getSiteUrl();
	const emailRedirectTo = `${origin}/auth/verified`;

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
		options: {
			emailRedirectTo,
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
			timezone: resolvedTimezone,
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
