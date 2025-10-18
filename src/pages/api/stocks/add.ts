import type { APIRoute } from "astro";
import { addUserStock } from "../../../lib/stocks";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();
		const symbol = formData.get("symbol") as string;

		if (!symbol) {
			return redirect("/alerts?error=symbol_required");
		}

		const result = await addUserStock(supabase, user.id, symbol.toUpperCase());

		if (!result.success) {
			return redirect(
				`/alerts?error=${encodeURIComponent(result.error || "failed_to_add_stock")}`,
			);
		}

		return redirect("/alerts?success=stock_added");
	} catch (error) {
		console.error("Add stock error:", error);
		return redirect("/alerts?error=server_error");
	}
};
