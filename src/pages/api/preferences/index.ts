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
			notification_frequency: {
				type: "enum",
				values: ["hourly", "daily"] as const,
			},
			daily_notification_hour: { type: "hour" },
			breaking_news_enabled: { type: "boolean" },
			breaking_news_threshold_percent: { type: "number", min: 0.1, max: 100 },
			breaking_news_outside_window: { type: "boolean" },
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
				notification_frequency: body.notification_frequency,
				daily_notification_hour: body.daily_notification_hour,
				breaking_news_enabled: body.breaking_news_enabled,
				breaking_news_threshold_percent: body.breaking_news_threshold_percent,
				breaking_news_outside_window: body.breaking_news_outside_window,
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

		// Validate daily hour is within window
		if (
			preferenceUpdates.notification_frequency === "daily" &&
			preferenceUpdates.daily_notification_hour !== undefined
		) {
			const dbUser = await userService.getById(user.id);
			if (!dbUser) {
				return redirect("/dashboard?error=user_not_found");
			}
			const start =
				preferenceUpdates.notification_start_hour ??
				dbUser.notification_start_hour;
			const end =
				preferenceUpdates.notification_end_hour ?? dbUser.notification_end_hour;
			const daily = preferenceUpdates.daily_notification_hour;

			if (daily !== null) {
				const isInWindow =
					start <= end
						? daily >= start && daily <= end // Linear window
						: daily >= start || daily <= end; // Wraparound window

				if (!isInWindow) {
					console.error(
						"Preferences update rejected: daily hour outside window",
						{
							daily,
							start,
							end,
						},
					);
					return redirect("/dashboard?error=invalid_form");
				}
			}
		}

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
