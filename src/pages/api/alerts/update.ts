import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/db-client";
import { validateTimezone } from "../../../lib/timezones";
import { createUserService, type Hour } from "../../../lib/users";

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
		const alertViaEmailRaw = formData.get("alert_via_email");
		const alertViaSmsRaw = formData.get("alert_via_sms");

		const updates: Parameters<typeof userService.update>[1] = {};

		// Handle delivery methods independently
		if (alertViaEmailRaw !== null && alertViaEmailRaw !== "preserve") {
			updates.alert_via_email = alertViaEmailRaw === "on";
		}
		if (alertViaSmsRaw !== null && alertViaSmsRaw !== "preserve") {
			updates.alert_via_sms = alertViaSmsRaw === "on";
		}

		// Handle timezone updates
		if (timezone !== null) {
			const trimmedTimezone = timezone.trim();

			if (!trimmedTimezone) {
				return redirect("/alerts?error=timezone_required");
			}

			const validatedTimezone = validateTimezone(trimmedTimezone);
			if (!validatedTimezone) {
				console.error("Invalid timezone provided:", trimmedTimezone);
				return redirect("/alerts?error=invalid_timezone");
			}
			updates.timezone = validatedTimezone;
		}

		// Handle alert start hour
		if (alertStartHour !== null) {
			const startHour = Number.parseInt(alertStartHour.toString(), 10);

			if (Number.isNaN(startHour) || startHour < 0 || startHour > 23) {
				return redirect("/alerts?error=invalid_start_hour");
			}

			updates.alert_start_hour = startHour as Hour;
		}

		// Handle alert end hour
		if (alertEndHour !== null) {
			const endHour = Number.parseInt(alertEndHour.toString(), 10);

			if (Number.isNaN(endHour) || endHour < 0 || endHour > 23) {
				return redirect("/alerts?error=invalid_end_hour");
			}

			updates.alert_end_hour = endHour as Hour;
		}

		if (Object.keys(updates).length === 0) {
			return redirect("/alerts?error=no_updates");
		}

		await userService.update(user.id, updates);

		return redirect("/alerts?success=settings_updated");
	} catch (error) {
		console.error("Update alert settings error:", error);
		return redirect("/alerts?error=server_error");
	}
};
