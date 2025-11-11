import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../../lib/db-client";
import {
	validateTimeFormat,
	validateTimezone,
} from "../../../../lib/timezones";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const email = formData.get("email")?.toString();
	const password = formData.get("password")?.toString();
	const timezoneHint = formData.get("timezone")?.toString();
	const timeFormatHint = formData.get("time_format")?.toString();
	const trimmedTimezone = timezoneHint?.trim();
	const timezoneValidation = validateTimezone(trimmedTimezone);

	if (!timezoneValidation.valid) {
		const message =
			timezoneValidation.reason ?? "Unsupported timezone provided.";
		console.warn("Invalid timezone during registration:", {
			timezoneHint: trimmedTimezone,
			message,
		});

		const redirectUrl = `/auth/register?error=invalid_timezone&message=${encodeURIComponent(
			message,
		)}`;

		return redirect(redirectUrl);
	}

	const normalizedTimezone = timezoneValidation.value;

	if (!email || !password) {
		return redirect("/auth/register?error=missing_fields");
	}

	const validatedTimeFormat = validateTimeFormat(timeFormatHint);

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
	});

	if (error) {
		console.error("User registration failed:", error);
		return redirect("/auth/register?error=failed");
	}

	if (data.user) {
		// Use admin client to bypass RLS for user profile creation
		const adminSupabase = createSupabaseAdminClient();

		const userProfileData = {
			id: data.user.id,
			email,
			timezone: normalizedTimezone,
			time_format: validatedTimeFormat,
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
