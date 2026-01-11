import { createSupabaseAdminClient } from "./supabase";

export const ONE_HOUR_SECONDS = 3600;

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetTime: Date;
	error?: unknown;
}

export async function checkAndIncrementRateLimit(
	key: string,
	windowSeconds: number,
	limit: number,
): Promise<RateLimitResult> {
	const supabase = createSupabaseAdminClient();

	try {
		const { data, error } = await supabase.rpc("check_rate_limit", {
			p_key: key,
			p_window_seconds: windowSeconds,
			p_limit: limit,
		});

		if (error) {
			console.error("Rate limit check error:", error);
			// Fail open on error
			return {
				allowed: true,
				remaining: limit,
				resetTime: new Date(Date.now() + windowSeconds * 1000),
				error,
			};
		}

		// Parse the JSON result
		// Supabase RPC returns JSON as object directly if type matches
		const result = data as {
			allowed: boolean;
			remaining: number;
			reset_time: string;
		};

		return {
			allowed: result.allowed,
			remaining: result.remaining,
			resetTime: new Date(result.reset_time),
		};
	} catch (e) {
		console.error("Rate limit exception:", e);
		return {
			allowed: true,
			remaining: limit,
			resetTime: new Date(Date.now() + windowSeconds * 1000),
			error: e,
		};
	}
}
