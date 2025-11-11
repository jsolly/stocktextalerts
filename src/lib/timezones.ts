import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimezoneOption {
	value: string;
	label: string;
	display_order: number;
}

export type TimeFormat = "12h" | "24h";

export interface TimezoneValidationResult {
	value: string | null;
	valid: boolean;
	reason?: string;
}

const SUPPORTED_TIMEZONES =
	typeof Intl.supportedValuesOf === "function"
		? new Set(Intl.supportedValuesOf("timeZone"))
		: null;

function isTimezoneValid(timezone: string): boolean {
	if (SUPPORTED_TIMEZONES) {
		return SUPPORTED_TIMEZONES.has(timezone);
	}

	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export async function getTimezoneOptions(
	supabase: SupabaseClient,
): Promise<TimezoneOption[]> {
	const { data, error } = await supabase
		.from("timezones")
		.select("value,label,display_order")
		.eq("active", true)
		.order("display_order", { ascending: true });

	if (error) {
		throw new Error(`Failed to load timezones: ${error.message}`);
	}

	return (data ?? []).map((timezone) => ({
		value: timezone.value,
		label: timezone.label,
		display_order: timezone.display_order,
	}));
}

const VALID_TIME_FORMATS = new Set<TimeFormat>(["12h", "24h"]);
const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

export function validateTimeFormat(
	timeFormat: string | undefined | null,
): TimeFormat {
	if (!timeFormat || typeof timeFormat !== "string") {
		console.warn(
			"Invalid time format received (empty or non-string), using default",
		);
		return DEFAULT_TIME_FORMAT;
	}

	const normalized = timeFormat.toLowerCase().trim();

	if (!VALID_TIME_FORMATS.has(normalized as TimeFormat)) {
		console.warn(
			`Invalid time format received: "${timeFormat}", using default`,
		);
		return DEFAULT_TIME_FORMAT;
	}

	return normalized as TimeFormat;
}

export function validateTimezone(
	timezone: string | undefined | null,
): TimezoneValidationResult {
	if (!timezone) {
		return { value: null, valid: true };
	}

	const candidate = timezone.trim();

	if (candidate === "") {
		return { value: null, valid: true };
	}

	if (!isTimezoneValid(candidate)) {
		return {
			value: null,
			valid: false,
			reason: `Unsupported timezone: ${candidate}`,
		};
	}

	return { value: candidate, valid: true };
}
