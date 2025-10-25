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

	console.log("Registration API - Received form data:");
	console.log("Email:", email);
	console.log("Timezone hint:", timezoneHint);
	console.log("Time format hint:", timeFormatHint);

	if (!email || !password) {
		return redirect("/auth/register?error=missing_fields");
	}

	const validatedTimezone = validateTimezone(timezoneHint);
	const validatedTimeFormat = validateTimeFormat(timeFormatHint);

	console.log("Validated timezone:", validatedTimezone);
	console.log("Validated time format:", validatedTimeFormat);

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
			email: data.user.email,
			timezone: validatedTimezone,
			time_format: validatedTimeFormat,
		};

		console.log("Creating user profile with data:", userProfileData);

		const { data: insertedData, error: profileError } = await adminSupabase
			.from("users")
			.upsert(userProfileData, {
				onConflict: "id",
			})
			.select();

		if (profileError) {
			console.error("Failed to create user profile:", profileError);
			return redirect("/auth/register?error=profile_creation_failed");
		} else {
			console.log("User profile created successfully");
			console.log("Inserted data:", insertedData);
		}
	}

	return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
};
