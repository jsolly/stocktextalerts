import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { type FormSchema, omitUndefined, parseWithSchema } from "../form-utils";
import { replaceUserStocks } from "./stocks-utils";

interface PreferencesDependencies {
	createSupabaseServerClient: typeof createSupabaseServerClient;
	createUserService: typeof createUserService;
	replaceUserStocks: typeof replaceUserStocks;
}

const defaultDependencies: PreferencesDependencies = {
	createSupabaseServerClient,
	createUserService,
	replaceUserStocks,
};

export function createPreferencesHandler(
	overrides: Partial<PreferencesDependencies> = {},
): APIRoute {
	const dependencies = { ...defaultDependencies, ...overrides };

	return async ({ request, cookies, redirect }) => {
		const supabase = dependencies.createSupabaseServerClient();
		const userService = dependencies.createUserService(supabase, cookies);

		const user = await userService.getCurrentUser();
		if (!user) {
			console.error("Preferences update attempt without authenticated user");
			return redirect("/?error=unauthorized&returnTo=/dashboard");
		}

		const formData = await request.formData();
		const shape = {
			email_notifications_enabled: { type: "boolean" },
			sms_notifications_enabled: { type: "boolean" },
			timezone: { type: "timezone" },
			notification_start_hour: { type: "hour" },
			notification_end_hour: { type: "hour" },
			time_format: { type: "enum", values: ["12h", "24h"] as const },
			tracked_stocks: { type: "json_string_array" },
			country: { type: "string" },
			phone: { type: "string" },
			phone_country_code: { type: "string" },
			phone_national_number: { type: "string" },
			code: { type: "string" },
		} as const satisfies FormSchema;

		const parsed = parseWithSchema(formData, shape, (body) => ({
			preferenceUpdates: omitUndefined({
				email_notifications_enabled: body.email_notifications_enabled,
				sms_notifications_enabled: body.sms_notifications_enabled,
				timezone: body.timezone,
				notification_start_hour: body.notification_start_hour,
				notification_end_hour: body.notification_end_hour,
				time_format: body.time_format,
			}),
			trackedSymbols: body.tracked_stocks,
		}));

		if (!parsed.ok) {
			console.error("Preferences update rejected due to invalid form", {
				errors: parsed.allErrors,
			});
			return redirect("/dashboard?error=invalid_form");
		}

		const { preferenceUpdates, trackedSymbols } = parsed.data;

		await userService.update(user.id, preferenceUpdates);

		if (Array.isArray(trackedSymbols)) {
			try {
				await dependencies.replaceUserStocks(supabase, user.id, trackedSymbols);
			} catch (error) {
				console.error("Failed to update tracked stocks", {
					userId: user.id,
					symbols: trackedSymbols,
					error: error instanceof Error ? error.message : String(error),
				});
				return redirect("/dashboard?error=failed_to_update_stocks");
			}
		}

		return redirect("/dashboard?success=settings_updated");
	};
}

export const POST = createPreferencesHandler();
