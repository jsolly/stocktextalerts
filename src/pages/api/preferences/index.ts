import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { type FormSchema, omitUndefined, parseWithSchema } from "../form-utils";
import { updateUserPreferencesAndStocks } from "./stocks-utils";

interface PreferencesDependencies {
	createSupabaseServerClient: typeof createSupabaseServerClient;
	createUserService: typeof createUserService;
	updateUserPreferencesAndStocks: typeof updateUserPreferencesAndStocks;
}

const defaultDependencies: PreferencesDependencies = {
	createSupabaseServerClient,
	createUserService,
	updateUserPreferencesAndStocks,
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

		const safePreferenceUpdates = {
			...preferenceUpdates,
			email_notifications_enabled:
				preferenceUpdates.email_notifications_enabled ?? false,
			sms_notifications_enabled:
				preferenceUpdates.sms_notifications_enabled ?? false,
		};

		if (safePreferenceUpdates.sms_notifications_enabled) {
			const dbUser = await userService.getById(user.id);

			if (!dbUser || !dbUser.phone_country_code || !dbUser.phone_number) {
				console.error(
					"Preferences update rejected: SMS enabled without phone number",
					{
						userId: user.id,
					},
				);
				return redirect("/dashboard?error=phone_not_set");
			}
		}

		try {
			if (Array.isArray(trackedSymbols)) {
				await dependencies.updateUserPreferencesAndStocks(
					supabase,
					user.id,
					safePreferenceUpdates,
					trackedSymbols,
				);
			} else {
				await userService.update(user.id, safePreferenceUpdates);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			console.error("Failed to update user preferences", {
				userId: user.id,
				preferences: safePreferenceUpdates,
				symbols: Array.isArray(trackedSymbols) ? trackedSymbols : undefined,
				error: errorMessage,
			});

			throw error;
		}

		return redirect("/dashboard?success=settings_updated");
	};
}

export const POST = createPreferencesHandler();
