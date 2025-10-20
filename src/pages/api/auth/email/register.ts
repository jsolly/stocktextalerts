import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const email = formData.get("email")?.toString();
	const password = formData.get("password")?.toString();
	const timezone = formData.get("timezone")?.toString();
	const timeFormat = formData.get("time_format")?.toString();

	if (!email || !password) {
		return redirect("/auth/register?error=missing_fields");
	}

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
				timezone: timezone || null,
				time_format: timeFormat || "24h",
			});
		} catch (error) {
			console.error("Failed to create user profile:", error);
		}
	}

	return redirect(`/auth/unconfirmed?email=${encodeURIComponent(email)}`);
};
