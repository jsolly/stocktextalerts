import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
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

	if (!email || !password) {
		return redirect("/auth/register?error=missing_fields");
	}

	const validatedTimezone = validateTimezone(timezoneHint);
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
		try {
			await supabase.from("users").upsert({
				id: data.user.id,
				email: data.user.email,
				timezone: validatedTimezone,
				time_format: validatedTimeFormat,
			});
		} catch (error) {
			console.error("Failed to create user profile:", error);
		}
	}

	return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
};
