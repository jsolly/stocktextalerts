import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

export type TimeFormat = "12h" | "24h";
export type Hour = number & { readonly __brand: "Hour" };

export function isValidHour(value: number): value is Hour {
	return Number.isInteger(value) && value >= 0 && value <= 23;
}

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
				time_format?: TimeFormat;
				alert_start_hour?: Hour;
				alert_end_hour?: Hour;
				alert_via_email?: boolean;
				alert_via_sms?: boolean;
			},
		) {
			const sanitized = { ...updates };

			if ("alert_start_hour" in sanitized) {
				const value = sanitized.alert_start_hour;
				if (value !== null && value !== undefined) {
					const numValue = typeof value === "string" ? Number(value) : value;
					if (!Number.isFinite(numValue) || !isValidHour(numValue)) {
						throw new Error(
							`alert_start_hour must be an integer between 0 and 23, got: ${value}`,
						);
					}
					sanitized.alert_start_hour = numValue as Hour;
				}
			}

			if ("alert_end_hour" in sanitized) {
				const value = sanitized.alert_end_hour;
				if (value !== null && value !== undefined) {
					const numValue = typeof value === "string" ? Number(value) : value;
					if (!Number.isFinite(numValue) || !isValidHour(numValue)) {
						throw new Error(
							`alert_end_hour must be an integer between 0 and 23, got: ${value}`,
						);
					}
					sanitized.alert_end_hour = numValue as Hour;
				}
			}

			const { data, error } = await supabase
				.from("users")
				.update(sanitized)
				.eq("id", id)
				.select()
				.single();

			if (error) throw error;
			return data;
		},
	};
}
