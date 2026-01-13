import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { type FormSchema, omitUndefined, parseWithSchema } from "../form-utils";
import { calculateNextSendAt } from "../notifications/shared";

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
			return redirect("/signin?error=unauthorized");
		}

		const formData = await request.formData();

		const shape = {
			email_notifications_enabled: { type: "boolean" },
			sms_notifications_enabled: { type: "boolean" },
			timezone: { type: "timezone" },
			daily_digest_enabled: { type: "boolean" },
			daily_digest_notification_time: { type: "time" },
		} as const satisfies FormSchema;

		const parsed = parseWithSchema(formData, shape);

		if (!parsed.ok) {
			console.error("Preferences update rejected due to invalid form", {
				errors: parsed.allErrors,
			});
			return redirect("/dashboard?error=invalid_form");
		}

		const baseUpdates = omitUndefined({
			...parsed.data,
			timezone:
				parsed.data.timezone === null ? undefined : parsed.data.timezone,
		});

		const safePreferenceUpdates: Parameters<typeof userService.update>[1] = {
			...baseUpdates,
			email_notifications_enabled:
				baseUpdates.email_notifications_enabled ?? false,
			sms_notifications_enabled: baseUpdates.sms_notifications_enabled ?? false,
		};

		const dbUser = await userService.getById(user.id);
		if (!dbUser) {
			console.error("User not found", { userId: user.id });
			return redirect("/signin?error=user_not_found");
		}

		if (safePreferenceUpdates.sms_notifications_enabled) {
			if (!dbUser.phone_country_code || !dbUser.phone_number) {
				console.error(
					"Preferences update rejected: SMS enabled without phone number",
					{
						userId: user.id,
					},
				);
				return redirect("/dashboard?error=phone_not_set");
			}
		}

		const timezoneChanged =
			safePreferenceUpdates.timezone !== undefined &&
			safePreferenceUpdates.timezone !== dbUser.timezone;
		const timeChanged =
			safePreferenceUpdates.daily_digest_notification_time !== undefined &&
			safePreferenceUpdates.daily_digest_notification_time !==
				dbUser.daily_digest_notification_time;
		const enabledChanged =
			safePreferenceUpdates.daily_digest_enabled !== undefined &&
			safePreferenceUpdates.daily_digest_enabled !==
				dbUser.daily_digest_enabled;

		const finalTimezone = safePreferenceUpdates.timezone ?? dbUser.timezone;
		const finalTime =
			safePreferenceUpdates.daily_digest_notification_time ??
			dbUser.daily_digest_notification_time;
		const finalEnabled =
			safePreferenceUpdates.daily_digest_enabled ?? dbUser.daily_digest_enabled;

		if (
			(timezoneChanged || timeChanged || enabledChanged) &&
			finalEnabled &&
			finalTimezone &&
			typeof finalTime === "number"
		) {
			const nextSendAt = calculateNextSendAt(
				finalTime,
				finalTimezone,
				() => new Date(),
			);
			if (nextSendAt) {
				safePreferenceUpdates.next_send_at = nextSendAt.toISOString();
			} else {
				console.warn("calculateNextSendAt returned null for valid inputs", {
					userId: user.id,
					finalTime,
					finalTimezone,
				});
				safePreferenceUpdates.next_send_at = null;
			}
		} else if (enabledChanged && !finalEnabled) {
			safePreferenceUpdates.next_send_at = null;
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
