import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();

		const timezone = formData.get("timezone") as string | null;
		const notificationStartHour = formData.get("notification_start_hour");
		const notificationEndHour = formData.get("notification_end_hour");
		const notifyViaEmail = formData.get("notify_via_email") === "on";
		const notifyViaSms = formData.get("notify_via_sms") === "on";

		if (!notifyViaEmail && !notifyViaSms) {
			return redirect("/alerts?error=at_least_one_notification_method");
		}

		if (!timezone) {
			return redirect("/alerts?error=timezone_required");
		}

		const updates: Parameters<typeof userService.update>[1] = {
			timezone,
			notify_via_email: notifyViaEmail,
			notify_via_sms: notifyViaSms,
		};

		if (notificationStartHour !== null) {
			const startHour = Number.parseInt(notificationStartHour.toString(), 10);
			if (!Number.isNaN(startHour) && startHour >= 0 && startHour <= 23) {
				updates.notification_start_hour = startHour;
			}
		}

		if (notificationEndHour !== null) {
			const endHour = Number.parseInt(notificationEndHour.toString(), 10);
			if (!Number.isNaN(endHour) && endHour >= 0 && endHour <= 23) {
				updates.notification_end_hour = endHour;
			}
		}

		await userService.update(user.id, updates);

		return redirect("/alerts?success=preferences_updated");
	} catch (error) {
		console.error("Update preferences error:", error);
		return redirect("/alerts?error=server_error");
	}
};
