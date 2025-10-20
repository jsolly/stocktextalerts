import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { createUserService } from "../../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/auth/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();
		const symbol = formData.get("symbol") as string;

		if (!symbol) {
			return redirect("/alerts?error=symbol_required");
		}

		const { error } = await supabase
			.from("user_stocks")
			.delete()
			.eq("user_id", user.id)
			.eq("symbol", symbol.toUpperCase());

		if (error) {
			console.error("Error removing user stock:", error);
			return redirect(
				`/alerts?error=${encodeURIComponent(error.message || "failed_to_remove_stock")}`,
			);
		}

		return redirect("/alerts?success=stock_removed");
	} catch (error) {
		console.error("Remove stock error:", error);
		return redirect("/alerts?error=server_error");
	}
};
