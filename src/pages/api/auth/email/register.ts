import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../../lib/supabase";
import { parseWithSchema, redirect } from "../../form-utils";

export const POST: APIRoute = async ({ request }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		email: { type: "string", required: true },
		password: { type: "string", required: true },
		timezone: { type: "timezone", required: true },
		time_format: {
			type: "enum",
			required: true,
			values: ["12h", "24h"] as const,
		},
	} as const);

	if (!parsed.ok) {
		console.error("Registration attempt rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/auth/register?error=invalid_form");
	}

	const { email, password, timezone, time_format } = parsed.data;

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
			timezone,
			time_format,
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
