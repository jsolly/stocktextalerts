import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/db-client";
import { createUserService } from "../../../lib/users";

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

		const normalizedSymbol = symbol.toUpperCase();

		const { data: existing, error: checkError } = await supabase
			.from("user_stocks")
			.select("symbol")
			.eq("user_id", user.id)
			.eq("symbol", normalizedSymbol)
			.maybeSingle();

		if (checkError) {
			console.error("Error checking existing stock:", checkError);
			return redirect("/alerts?error=failed_to_add_stock");
		}

		if (existing) {
			return redirect("/alerts?info=stock_already_exists");
		}

		const { error: insertError } = await supabase
			.from("user_stocks")
			.insert([{ user_id: user.id, symbol: normalizedSymbol }]);

		if (insertError) {
			console.error("Error adding user stock:", insertError);
			return redirect("/alerts?error=failed_to_add_stock");
		}

		return redirect("/alerts?success=stock_added");
	} catch (error) {
		console.error("Add stock error:", error);
		return redirect("/alerts?error=server_error");
	}
};
