import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import type { TimeFormat } from "./timezones";

export type Hour = number & { readonly __brand: "Hour" };

export interface User {
	id: string;
	email: string;
	phone_country_code: string | null;
	phone_number: string | null;
	full_phone: string | null;
	phone_verified: boolean;
	sms_opted_out: boolean;
	timezone: string | null;
	time_format: TimeFormat;
	alert_start_hour: Hour;
	alert_end_hour: Hour;
	alert_via_email: boolean;
	alert_via_sms: boolean;
	created_at: string;
	updated_at: string;
}

type UserUpdateInput = Partial<
	Pick<
		User,
		| "phone_country_code"
		| "phone_number"
		| "phone_verified"
		| "sms_opted_out"
		| "timezone"
		| "time_format"
		| "alert_start_hour"
		| "alert_end_hour"
		| "alert_via_email"
		| "alert_via_sms"
	>
>;

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
				.maybeSingle();

			if (error) throw error;
			return data;
		},

		async update(id: string, updates: UserUpdateInput) {
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
