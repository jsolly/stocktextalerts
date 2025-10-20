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

export async function getAllStocks(supabase: SupabaseClient): Promise<Stock[]> {
	const { data, error } = await supabase
		.from("stocks")
		.select("symbol, name, exchange")
		.order("symbol");

	if (error) throw error;

	return data || [];
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

export function validateTickerSymbol(symbol: string): boolean {
	const tickerRegex = /^[A-Z][A-Z0-9.-]{0,9}$/;
	return tickerRegex.test(symbol);
}
