import { createSupabaseAdminClient } from "./supabase";

const MAX_ATTEMPTS = 3;
const WINDOW_HOURS = 1;

export async function checkVerificationRateLimit(
	phoneCountryCode: string,
	phoneNumber: string,
): Promise<{ allowed: boolean; error?: string }> {
	const supabase = createSupabaseAdminClient();

	const oneHourAgo = new Date();
	oneHourAgo.setHours(oneHourAgo.getHours() - WINDOW_HOURS);

	const { data, error } = await supabase
		.from("verification_attempts")
		.select("id")
		.eq("phone_country_code", phoneCountryCode)
		.eq("phone_number", phoneNumber)
		.gte("attempted_at", oneHourAgo.toISOString());

	if (error) {
		console.error("Rate limit check error:", error);
		return { allowed: false, error: "Failed to check rate limit" };
	}

	if (data && data.length >= MAX_ATTEMPTS) {
		return {
			allowed: false,
			error: `Too many verification attempts. Please try again in ${WINDOW_HOURS} hour(s)`,
		};
	}

	return { allowed: true };
}

export async function logVerificationAttempt(
	phoneCountryCode: string,
	phoneNumber: string,
): Promise<void> {
	const supabase = createSupabaseAdminClient();

	const { error } = await supabase.from("verification_attempts").insert({
		phone_country_code: phoneCountryCode,
		phone_number: phoneNumber,
	});

	if (error) {
		console.error("Failed to log verification attempt:", error);
	}
}
