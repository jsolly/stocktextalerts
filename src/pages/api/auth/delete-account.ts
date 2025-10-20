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
			return redirect("/profile?error=delete_failed");
		}

		await supabaseAdmin.from("users").delete().eq("id", authUser.id);

		cookies.delete("sb-access-token", { path: "/" });
		cookies.delete("sb-refresh-token", { path: "/" });

		return redirect("/?success=account_deleted");
	} catch {
		return redirect("/?error=delete_failed");
	}
};
