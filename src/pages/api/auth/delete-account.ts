import type { APIRoute } from "astro";
import {
	createSupabaseAdminClient,
	createSupabaseServerClient,
} from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const users = createUserService(supabase, cookies);
	const authUser = await users.getCurrentUser();

	if (!authUser) {
		console.error("Delete account requested without authenticated user");
		return redirect("/");
	}

	try {
		const supabaseAdmin = createSupabaseAdminClient();

		// Delete application user data first to avoid orphaned rows if auth deletion fails
		const { error: dbError } = await supabaseAdmin
			.from("users")
			.delete()
			.eq("id", authUser.id);

		if (dbError) {
			console.error("Failed to delete user row before auth deletion", {
				userId: authUser.id,
				error: dbError,
			});
			return redirect("/profile?error=delete_failed");
		}

		const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
			authUser.id,
		);

		if (authError) {
			console.error("Failed to delete auth user", {
				userId: authUser.id,
				error: authError,
			});
			return redirect("/profile?error=delete_failed");
		}

		cookies.delete("sb-access-token", { path: "/" });
		cookies.delete("sb-refresh-token", { path: "/" });

		return redirect("/?success=account_deleted");
	} catch (err) {
		console.error("Failed to delete user account", {
			userId: authUser.id,
			error: err,
		});
		return redirect("/profile?error=delete_failed");
	}
};
