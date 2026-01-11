import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { resolveTimezone } from "../../../lib/timezones";
import { createUserService } from "../../../lib/users";
import { type FormSchema, omitUndefined, parseWithSchema } from "../form-utils";

interface PreferencesDependencies {
	createSupabaseServerClient: typeof createSupabaseServerClient;
	createUserService: typeof createUserService;
}

const defaultDependencies: PreferencesDependencies = {
	createSupabaseServerClient,
	createUserService,
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
		const priceThresholdPresent = formData.has(
			"price_threshold_alerts_enabled",
		);
		const volumeSpikePresent = formData.has("volume_spike_alerts_enabled");

		const shape = {
			email_notifications_enabled: { type: "boolean" },
			sms_notifications_enabled: { type: "boolean" },
			timezone: { type: "timezone" },
			daily_digest_enabled: { type: "boolean" },
			daily_digest_notification_time: { type: "time" },
			breaking_news_enabled: { type: "boolean" },
			price_threshold_alerts_enabled: { type: "boolean" },
			volume_spike_alerts_enabled: { type: "boolean" },
		} as const satisfies FormSchema;

		const parsed = parseWithSchema(formData, shape);

		if (!parsed.ok) {
			console.error("Preferences update rejected due to invalid form", {
				errors: parsed.allErrors,
			});
			return redirect("/dashboard?error=invalid_form");
		}

		const {
			price_threshold_alerts_enabled,
			volume_spike_alerts_enabled,
			...otherFields
		} = parsed.data;

		const baseUpdates = omitUndefined({
			...otherFields,
			timezone: otherFields.timezone ?? undefined,
			price_threshold_alerts_enabled,
			volume_spike_alerts_enabled,
		});

		const preferenceUpdates =
			priceThresholdPresent || volumeSpikePresent
				? {
						...baseUpdates,
						stock_trends_enabled:
							Boolean(price_threshold_alerts_enabled) ||
							Boolean(volume_spike_alerts_enabled),
					}
				: baseUpdates;

		const safePreferenceUpdates = {
			...preferenceUpdates,
			email_notifications_enabled:
				preferenceUpdates.email_notifications_enabled ?? false,
			sms_notifications_enabled:
				preferenceUpdates.sms_notifications_enabled ?? false,
		};

		const resolvedTimezone =
			typeof safePreferenceUpdates.timezone === "string" &&
			safePreferenceUpdates.timezone.trim() !== ""
				? await resolveTimezone({
						supabase,
						detectedTimezone: safePreferenceUpdates.timezone,
						utcOffsetMinutes: null,
					})
				: null;

		const safePreferenceUpdatesWithTimezone =
			resolvedTimezone === null
				? safePreferenceUpdates
				: {
						...safePreferenceUpdates,
						timezone: resolvedTimezone,
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
			await userService.update(user.id, safePreferenceUpdatesWithTimezone);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			console.error("Failed to update user preferences", {
				userId: user.id,
				preferences: safePreferenceUpdatesWithTimezone,
				error: errorMessage,
			});

			throw error;
		}

		return redirect("/dashboard?success=settings_updated");
	};
}

export const POST = createPreferencesHandler();
