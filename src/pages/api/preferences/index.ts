import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
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

		const parsed = parseWithSchema(formData, shape, (body) => ({
			preferenceUpdates: omitUndefined({
				email_notifications_enabled: body.email_notifications_enabled,
				sms_notifications_enabled: body.sms_notifications_enabled,
				timezone: body.timezone,
				daily_digest_enabled: body.daily_digest_enabled,
				daily_digest_notification_time: body.daily_digest_notification_time,
				breaking_news_enabled: body.breaking_news_enabled,
				stock_trends_enabled:
					body.price_threshold_alerts_enabled ||
					body.volume_spike_alerts_enabled,
				price_threshold_alerts_enabled: body.price_threshold_alerts_enabled,
				volume_spike_alerts_enabled: body.volume_spike_alerts_enabled,
			}),
		}));

		if (!parsed.ok) {
			console.error("Preferences update rejected due to invalid form", {
				errors: parsed.allErrors,
			});
			return redirect("/dashboard?error=invalid_form");
		}

		const { preferenceUpdates } = parsed.data;

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
			await userService.update(user.id, safePreferenceUpdates);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			console.error("Failed to update user preferences", {
				userId: user.id,
				preferences: safePreferenceUpdates,
				error: errorMessage,
			});

			throw error;
		}

		return redirect("/dashboard?success=settings_updated");
	};
}

export const POST = createPreferencesHandler();
