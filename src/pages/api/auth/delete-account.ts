import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/db-client";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const users = createUserService(supabase, cookies);
	const authUser = await users.getCurrentUser();

	if (!authUser) {
		return redirect("/");
	}

	try {
		const supabaseAdmin = createSupabaseAdminClient();

		const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
			authUser.id,
		);

		if (authError) {
			console.error("Auth user deletion failed:", authError);
			return redirect("/profile?error=delete_failed");
		}

		const { error: dbError } = await supabaseAdmin
			.from("users")
			.delete()
			.eq("id", authUser.id);

		if (dbError) {
			console.error(
				"Database user deletion failed after successful auth deletion:",
				dbError,
			);
			cookies.delete("sb-access-token", { path: "/" });
			cookies.delete("sb-refresh-token", { path: "/" });
			return redirect("/?warning=partial_delete");
		}

		cookies.delete("sb-access-token", { path: "/" });
		cookies.delete("sb-refresh-token", { path: "/" });

		return redirect("/");
	} catch (error) {
		console.error("Account deletion failed:", error);
		return redirect("/profile?error=delete_failed");
	}
};
