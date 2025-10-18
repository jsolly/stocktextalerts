import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/db-client";
import { createUserService } from "../../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/?error=unauthorized&returnTo=/alerts");
	}

	try {
		const formData = await request.formData();

		const timezone = formData.get("timezone") as string | null;
		const alertStartHour = formData.get("alert_start_hour");
		const alertEndHour = formData.get("alert_end_hour");
		const alertViaEmail = formData.get("alert_via_email") === "on";
		const alertViaSms = formData.get("alert_via_sms") === "on";

		if (!alertViaEmail && !alertViaSms) {
			return redirect("/alerts?error=at_least_one_alert_method");
		}

		if (!timezone) {
			return redirect("/alerts?error=timezone_required");
		}

		const updates: Parameters<typeof userService.update>[1] = {
			timezone,
			alert_via_email: alertViaEmail,
			alert_via_sms: alertViaSms,
		};

		if (alertStartHour !== null) {
			const startHour = Number.parseInt(alertStartHour.toString(), 10);
			if (!Number.isNaN(startHour) && startHour >= 0 && startHour <= 23) {
				updates.alert_start_hour = startHour;
			}
		}

		if (alertEndHour !== null) {
			const endHour = Number.parseInt(alertEndHour.toString(), 10);
			if (!Number.isNaN(endHour) && endHour >= 0 && endHour <= 23) {
				updates.alert_end_hour = endHour;
			}
		}

		await userService.update(user.id, updates);

		return redirect("/alerts?success=settings_updated");
	} catch (error) {
		console.error("Update alert settings error:", error);
		return redirect("/alerts?error=server_error");
	}
};
