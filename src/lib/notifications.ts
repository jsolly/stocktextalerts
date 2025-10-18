import { createSupabaseAdminClient } from "./supabase";

export type DeliveryMethod = "email" | "sms";
export type DeliveryStatus = "sent" | "failed";

export interface NotificationLog {
	user_id: string;
	type: string;
	delivery_method: DeliveryMethod;
	status: DeliveryStatus;
	message?: string;
}

export async function logNotification(
	log: NotificationLog,
): Promise<{ success: boolean; error?: string }> {
	const supabase = createSupabaseAdminClient();

	const { error } = await supabase.from("notifications_log").insert({
		user_id: log.user_id,
		type: log.type,
		delivery_method: log.delivery_method,
		status: log.status,
		message: log.message,
	});

	if (error) {
		console.error("Failed to log notification:", error);
		return {
			success: false,
			error: error.message || "Failed to log notification",
		};
	}

	return { success: true };
}

export async function getRecentNotifications(
	userId: string,
	limit = 50,
): Promise<NotificationLog[]> {
	const supabase = createSupabaseAdminClient();

	const { data, error } = await supabase
		.from("notifications_log")
		.select("*")
		.eq("user_id", userId)
		.order("sent_at", { ascending: false })
		.limit(limit);

	if (error) {
		console.error("Error fetching notifications:", error);
		return [];
	}

	return data || [];
}
