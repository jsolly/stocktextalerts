import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

export function createUserService(
	supabase: SupabaseClient,
	cookies: AstroCookies,
) {
	return {
		async getCurrentUser() {
			const accessToken = cookies.get("sb-access-token");
			const refreshToken = cookies.get("sb-refresh-token");

			if (!accessToken || !refreshToken) {
				return null;
			}

			try {
				const { data, error } = await supabase.auth.setSession({
					refresh_token: refreshToken.value,
					access_token: accessToken.value,
				});

				if (error || !data.user) {
					return null;
				}

				return data.user;
			} catch {
				return null;
			}
		},

		async getById(id: string) {
			const { data, error } = await supabase
				.from("users")
				.select("*")
				.eq("id", id)
				.single();

			if (error) throw error;
			return data;
		},

		async update(
			id: string,
			updates: {
				phone_country_code?: string | null;
				phone_number?: string | null;
				phone_verified?: boolean;
				sms_opted_out?: boolean;
				timezone?: string | null;
				alert_start_hour?: number;
				alert_end_hour?: number;
				alert_via_email?: boolean;
				alert_via_sms?: boolean;
			},
		) {
			const { data, error } = await supabase
				.from("users")
				.update(updates)
				.eq("id", id)
				.select()
				.single();

			if (error) throw error;
			return data;
		},
	};
}
