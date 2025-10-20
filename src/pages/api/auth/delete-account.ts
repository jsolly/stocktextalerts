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
		Two-Phase Deletion Strategy
		=============
		Delete DB record first, then auth user. This ordering prevents orphaned
		DB rows (the original issue). If DB deletion fails, we abort before
		touching auth. If auth deletion fails after DB deletion, we attempt a
		compensating transaction to restore the DB record and maintain consistency.
		
		Note: For true atomicity, consider moving this to a Supabase Edge Function
		with explicit transaction boundaries or implementing a saga pattern with
		a retry queue for failed auth deletions.
		*/

		// Phase 1: Delete from database (users table, tracked_stocks cascade via FK)
		const { data: deletedUser, error: dbError } = await supabaseAdmin
			.from("users")
			.delete()
			.eq("id", authUser.id)
			.select()
			.single();

		if (dbError) {
			console.error("Database user deletion failed:", {
				userId: authUser.id,
				error: dbError,
			});
			return redirect("/profile?error=delete_failed");
		}

		console.log("DB record deleted successfully:", { userId: authUser.id });

		// Phase 2: Delete from auth with compensating action on failure
		const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
			authUser.id,
		);

		if (authError) {
			console.error(
				"Auth deletion failed after DB deletion - attempting compensating action:",
				{
					userId: authUser.id,
					error: authError,
				},
			);

			// Compensating action: restore the DB record
			const { error: restoreError } = await supabaseAdmin.from("users").insert({
				id: deletedUser.id,
				email: deletedUser.email,
				phone_country_code: deletedUser.phone_country_code,
				phone_number: deletedUser.phone_number,
				phone_verified: deletedUser.phone_verified,
				sms_opted_out: deletedUser.sms_opted_out,
				timezone: deletedUser.timezone,
				time_format: deletedUser.time_format,
				alert_start_hour: deletedUser.alert_start_hour,
				alert_end_hour: deletedUser.alert_end_hour,
				alert_via_email: deletedUser.alert_via_email,
				alert_via_sms: deletedUser.alert_via_sms,
				created_at: deletedUser.created_at,
				updated_at: deletedUser.updated_at,
			});

			if (restoreError) {
				console.error(
					"CRITICAL: Failed to restore DB record after auth deletion failure - manual intervention required:",
					{
						userId: authUser.id,
						authError,
						restoreError,
						deletedUserData: deletedUser,
					},
				);
				// User is in inconsistent state but auth still exists, so they can retry
				return redirect("/profile?error=delete_partial");
			}

			console.log("Compensating action successful - DB record restored:", {
				userId: authUser.id,
			});
			return redirect("/profile?error=delete_failed");
		}

		console.log("Account deletion completed successfully:", {
			userId: authUser.id,
		});

		cookies.delete("sb-access-token", { path: "/" });
		cookies.delete("sb-refresh-token", { path: "/" });

		return redirect("/");
	} catch (error) {
		console.error("Account deletion failed with exception:", {
			userId: authUser.id,
			error,
		});
		return redirect("/profile?error=delete_failed");
	}
};
