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

		/* =============
		Auth-First Deletion Strategy
		=============
		Delete auth user first, then DB record. This ordering prioritizes data
		safety over preventing orphaned DB rows:
		
		- If auth deletion fails: Nothing is deleted. User can retry safely.
		- If DB deletion fails: Auth is gone but DB record remains (orphaned).
		  This is safe because RLS policies prevent access without auth.
		  Orphaned records can be cleaned up with a periodic maintenance job.
		
		This approach is simpler and prevents data loss compared to DB-first
		deletion with compensating transactions (which can't restore cascade-
		deleted child records like user_stocks and alerts_log).
		*/

		// Phase 1: Delete from auth
		const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
			authUser.id,
		);

		if (authError) {
			console.error("Auth user deletion failed:", {
				userId: authUser.id,
				error: authError,
			});
			return redirect("/profile?error=delete_failed");
		}

		console.log("Auth user deleted successfully:", { userId: authUser.id });

		// Phase 2: Delete from database (users table, user_stocks and alerts_log cascade via FK)
		const { error: dbError } = await supabaseAdmin
			.from("users")
			.delete()
			.eq("id", authUser.id);

		cookies.delete("sb-access-token", { path: "/" });
		cookies.delete("sb-refresh-token", { path: "/" });

		if (dbError) {
			console.error(
				"DB deletion failed after auth deletion - orphaned record created:",
				{
					userId: authUser.id,
					error: dbError,
				},
			);
			// Auth is deleted but DB records remain. User should be informed.
			return redirect("/?warning=partial_deletion");
		}

		console.log("Account deletion completed successfully:", {
			userId: authUser.id,
		});

		return redirect("/?success=account_deleted");
	} catch (error) {
		console.error("Account deletion failed with exception:", {
			userId: authUser.id,
			error,
		});
		return redirect("/profile?error=delete_failed");
	}
};
