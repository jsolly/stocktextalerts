import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";

export const POST: APIRoute = async ({ request, redirect }) => {
	const supabase = createSupabaseServerClient();

	const formData = await request.formData();
	const email = formData.get("email")?.toString();

	if (!email) {
		return redirect("/auth/unconfirmed?error=email_required");
	}

	const { error } = await supabase.auth.resend({
		type: "signup",
		email,
	});

	if (error) {
		console.error("Resend verification email failed:", error);
		return redirect(
			`/auth/unconfirmed?email=${encodeURIComponent(email)}&error=failed`,
		);
	}

	return redirect(
		`/auth/unconfirmed?email=${encodeURIComponent(email)}&success=true`,
	);
};
