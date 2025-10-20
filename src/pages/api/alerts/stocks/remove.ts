import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/db-client";
import { validateTickerSymbol } from "../../../../lib/stocks";
import { createUserService } from "../../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/?error=unauthorized&returnTo=/alerts");
	}

	try {
		const formData = await request.formData();
		const rawSymbol = formData.get("symbol");

		if (!rawSymbol || typeof rawSymbol !== "string") {
			return redirect("/alerts?error=symbol_required");
		}

		const symbol = rawSymbol.trim().toUpperCase();

		if (!symbol) {
			return redirect("/alerts?error=symbol_required");
		}

		if (!validateTickerSymbol(symbol)) {
			return redirect("/alerts?error=invalid_symbol");
		}

		const { error } = await supabase
			.from("user_stocks")
			.delete()
			.eq("user_id", user.id)
			.eq("symbol", symbol);

		if (error) {
			console.error("Error removing user stock:", error);
			return redirect("/alerts?error=failed_to_remove_stock");
		}

		return redirect("/alerts?success=stock_removed");
	} catch (error) {
		console.error("Remove stock error:", error);
		return redirect("/alerts?error=server_error");
	}
};
