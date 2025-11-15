import type { SupabaseClient } from "@supabase/supabase-js";

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
		throw new Error(
			`Failed to replace user stocks for user ${userId}: ${error.message}`,
		);
	}
}
