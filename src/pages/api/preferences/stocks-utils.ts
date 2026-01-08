import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserPreferencesUpdatePayload {
	timezone?: string | null;
	notification_start_hour?: number | null;
	notification_end_hour?: number | null;
	notification_frequency?: "hourly" | "daily";
	daily_notification_hour?: number | null;
	breaking_news_enabled?: boolean;
	breaking_news_threshold_percent?: number | null;
	breaking_news_outside_window?: boolean;
	time_format?: string | null;
	email_notifications_enabled: boolean;
	sms_notifications_enabled: boolean;
}

export async function updateUserPreferencesAndStocks(
	supabase: SupabaseClient,
	userId: string,
	preferenceUpdates: UserPreferencesUpdatePayload,
	symbols: readonly string[],
): Promise<void> {
	const { error } = await supabase.rpc("update_user_preferences_and_stocks", {
		user_id: userId,
		timezone: preferenceUpdates.timezone ?? null,
		notification_start_hour: preferenceUpdates.notification_start_hour ?? null,
		notification_end_hour: preferenceUpdates.notification_end_hour ?? null,
		time_format: preferenceUpdates.time_format ?? null,
		email_notifications_enabled: preferenceUpdates.email_notifications_enabled,
		sms_notifications_enabled: preferenceUpdates.sms_notifications_enabled,
		notification_frequency: preferenceUpdates.notification_frequency ?? null,
		daily_notification_hour: preferenceUpdates.daily_notification_hour ?? null,
		breaking_news_enabled: preferenceUpdates.breaking_news_enabled ?? null,
		breaking_news_threshold_percent:
			preferenceUpdates.breaking_news_threshold_percent ?? null,
		breaking_news_outside_window:
			preferenceUpdates.breaking_news_outside_window ?? null,
		symbols,
	});

	if (error) {
		throw new Error(
			`Failed to update user preferences and stocks for user ${userId}: ${error.message}`,
		);
	}
}
