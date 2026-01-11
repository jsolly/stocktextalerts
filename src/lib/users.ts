import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

export interface User {
	id: string;
	email: string;
	phone_country_code: string | null;
	phone_number: string | null;
	full_phone: string | null;
	phone_verified: boolean;
	sms_opted_out: boolean;
	timezone: string;
	daily_digest_enabled: boolean;
	daily_digest_notification_time: number;
	breaking_news_enabled: boolean;
	stock_trends_enabled: boolean;
	price_threshold_alerts_enabled: boolean;
	volume_spike_alerts_enabled: boolean;
	email_notifications_enabled: boolean;
	sms_notifications_enabled: boolean;
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
		| "daily_digest_enabled"
		| "daily_digest_notification_time"
		| "breaking_news_enabled"
		| "stock_trends_enabled"
		| "price_threshold_alerts_enabled"
		| "volume_spike_alerts_enabled"
		| "email_notifications_enabled"
		| "sms_notifications_enabled"
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
