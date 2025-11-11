import type { SupabaseClient } from "@supabase/supabase-js";

export interface Stock {
	symbol: string;
	name: string;
	exchange: string;
}

export interface UserStock {
	symbol: string;
	created_at: string;
}

export async function getUserStocks(
	supabase: SupabaseClient,
	userId: string,
): Promise<UserStock[]> {
	const { data, error } = await supabase
		.from("user_stocks")
		.select("symbol, created_at")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (error) throw error;

	return data || [];
}

export async function replaceUserStocks(
	supabase: SupabaseClient,
	userId: string,
	symbols: readonly string[],
): Promise<void> {
	const { error } = await supabase.rpc("replace_user_stocks", {
		user_id: userId,
		symbols,
	});

	if (error) {
		throw error;
	}
}
