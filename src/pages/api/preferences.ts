import type { APIRoute } from "astro";

import { createSupabaseServerClient } from "../../lib/db-client";
import { replaceUserStocks } from "../../lib/stocks";
import { createUserService, type Hour } from "../../lib/users";

type RedirectFn = (location: string) => Response;

const UNAUTHORIZED_REDIRECT = "/?error=unauthorized&returnTo=/dashboard";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect(UNAUTHORIZED_REDIRECT);
	}

	let formData: FormData;

	try {
		formData = await request.formData();
	} catch {
		return redirect("/dashboard?error=invalid_request");
	}

	return handleUpdatePreferences(
		formData,
		userService,
		supabase,
		user.id,
		redirect,
	);
};

async function handleUpdatePreferences(
	formData: FormData,
	userService: ReturnType<typeof createUserService>,
	supabase: ReturnType<typeof createSupabaseServerClient>,
	userId: string,
	redirect: RedirectFn,
) {
	const fieldParsers = {
		email_notifications_enabled: (value: FormDataEntryValue) => value === "on",
		sms_notifications_enabled: (value: FormDataEntryValue) => value === "on",
		timezone: (value: FormDataEntryValue) => value.toString().trim(),
		time_format: (value: FormDataEntryValue) => {
			const formatted = value.toString().trim();
			return formatted === "24h" ? "24h" : "12h";
		},
		notification_start_hour: (value: FormDataEntryValue) =>
			parseHourField(value, "notification_start_hour"),
		notification_end_hour: (value: FormDataEntryValue) =>
			parseHourField(value, "notification_end_hour"),
	} as const;

	let updates: Parameters<typeof userService.update>[1];

	try {
		updates = Object.fromEntries(
			Array.from(formData.entries()).reduce(
				(entries, [key, value]) => {
					const parse = fieldParsers[key as keyof typeof fieldParsers];
					if (!parse) {
						return entries;
					}

					entries.push([key, parse(value)]);
					return entries;
				},
				[] as Array<[string, unknown]>,
			),
		) as Parameters<typeof userService.update>[1];
	} catch (parseError) {
		const message =
			parseError instanceof Error && parseError.message.startsWith("invalid_")
				? parseError.message
				: "invalid_preferences";

		return redirect(`/dashboard?error=${encodeURIComponent(message)}`);
	}

	let trackedStocks: string[] | null;
	try {
		trackedStocks = parseTrackedStocks(formData.get("tracked_stocks"));
	} catch {
		return redirect("/dashboard?error=invalid_tracked_stocks");
	}

	if (Object.keys(updates).length === 0 && trackedStocks === null) {
		return redirect("/dashboard?error=no_updates");
	}

	try {
		if (Object.keys(updates).length > 0) {
			await userService.update(userId, updates);
		}

		if (trackedStocks !== null) {
			await replaceUserStocks(supabase, userId, trackedStocks);
		}

		return redirect("/dashboard?success=settings_updated");
	} catch (error) {
		console.error("Update preferences error:", error);
		return redirect("/dashboard?error=server_error");
	}
}

function parseTrackedStocks(value: FormDataEntryValue | null): string[] | null {
	if (value === null) {
		return null;
	}

	const raw = value.toString().trim();
	if (raw === "") {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error("invalid");
		}

		return parsed
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter((item) => item !== "");
	} catch {
		throw new Error("invalid");
	}
}

function parseHourField(
	value: FormDataEntryValue,
	field: "notification_start_hour" | "notification_end_hour",
): Hour {
	const raw = value.toString().trim();

	if (!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(raw)) {
		throw new Error(`invalid_${field}`);
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
		throw new Error(`invalid_${field}`);
	}

	return parsed as Hour;
}
