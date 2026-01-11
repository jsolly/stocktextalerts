import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimezoneOption {
	value: string;
	label: string;
	display_order: number;
}

export interface TimezoneValidationResult {
	value: string | null;
	valid: boolean;
	reason?: string;
}

export const DEFAULT_TIMEZONE = "America/New_York";

const ALL_TIMEZONE_VALUES_TTL_MS = 5 * 60 * 1000;

let allTimezoneValuesCache: { values: string[]; expiresAtMs: number } | null =
	null;
let allTimezoneValuesInFlight: Promise<string[]> | null = null;

export async function getTimezoneOptions(
	supabase: SupabaseClient,
	options?: { includeValues?: string[] },
): Promise<TimezoneOption[]> {
	const includeValues = (options?.includeValues ?? [])
		.map((value) => value.trim())
		.filter((value) => value !== "");
	const uniqueIncludeValues = [...new Set(includeValues)];

	const { data: activeTimezones, error: activeError } = await supabase
		.from("timezones")
		.select("value,label,display_order")
		.eq("active", true)
		.order("display_order", { ascending: true });

	if (activeError) {
		throw new Error(`Failed to load timezones: ${activeError.message}`);
	}

	const normalizedActive = (activeTimezones ?? []).map((timezone) => ({
		value: timezone.value,
		label: timezone.label,
		display_order: timezone.display_order,
	}));

	if (uniqueIncludeValues.length === 0) {
		return normalizedActive;
	}

	const { data: includedTimezones, error: includedError } = await supabase
		.from("timezones")
		.select("value,label,display_order")
		.in("value", uniqueIncludeValues);

	if (includedError) {
		throw new Error(`Failed to load timezones: ${includedError.message}`);
	}

	const activeValueSet = new Set(
		normalizedActive.map((timezone) => timezone.value),
	);
	const extras = (includedTimezones ?? [])
		.filter((timezone) => !activeValueSet.has(timezone.value))
		.map((timezone) => ({
			value: timezone.value,
			label: timezone.label,
			display_order: timezone.display_order,
		}))
		.sort((left, right) => left.value.localeCompare(right.value));

	return [...extras, ...normalizedActive];
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

	return { value: candidate, valid: true };
}

function parseShortOffsetToMinutes(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === "GMT" || trimmed === "UTC") {
		return 0;
	}

	const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(trimmed);
	if (!match) {
		return null;
	}

	const sign = match[1] === "-" ? -1 : 1;
	const hours = Number.parseInt(match[2] ?? "", 10);
	const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;

	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
		return null;
	}

	return sign * (hours * 60 + minutes);
}

function getTimezoneOffsetFromUtcMinutes(
	timezone: string,
	date: Date,
): number | null {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			timeZoneName: "shortOffset",
		});

		const parts = formatter.formatToParts(date);
		const tzPart = parts.find((part) => part.type === "timeZoneName")?.value;
		if (!tzPart) {
			return null;
		}

		return parseShortOffsetToMinutes(tzPart);
	} catch {
		return null;
	}
}

function getCanonicalRank(timezone: string): number {
	if (timezone.startsWith("America/")) return 0;
	if (timezone.startsWith("Europe/")) return 1;
	if (timezone.startsWith("Asia/")) return 2;
	return 3;
}

async function timezoneExistsInDb(
	supabase: SupabaseClient,
	timezone: string,
): Promise<boolean> {
	const { data, error } = await supabase
		.from("timezones")
		.select("value")
		.eq("value", timezone)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to check timezone: ${error.message}`);
	}

	return Boolean(data?.value);
}

async function loadAllTimezoneValues(
	supabase: SupabaseClient,
): Promise<string[]> {
	const { data, error } = await supabase.from("timezones").select("value");

	if (error) {
		throw new Error(`Failed to load timezones: ${error.message}`);
	}

	return (data ?? [])
		.map((row) => row.value)
		.filter(
			(value): value is string =>
				typeof value === "string" && value.trim() !== "",
		);
}

async function getAllTimezoneValues(
	supabase: SupabaseClient,
): Promise<string[]> {
	const nowMs = Date.now();
	if (allTimezoneValuesCache && allTimezoneValuesCache.expiresAtMs > nowMs) {
		return allTimezoneValuesCache.values;
	}

	if (allTimezoneValuesInFlight) {
		return allTimezoneValuesInFlight;
	}

	allTimezoneValuesInFlight = loadAllTimezoneValues(supabase)
		.then((values) => {
			allTimezoneValuesCache = {
				values,
				expiresAtMs: Date.now() + ALL_TIMEZONE_VALUES_TTL_MS,
			};
			return values;
		})
		.finally(() => {
			allTimezoneValuesInFlight = null;
		});

	return allTimezoneValuesInFlight;
}

export async function resolveTimezone(options: {
	supabase: SupabaseClient;
	detectedTimezone: string | null | undefined;
	utcOffsetMinutes: number | null | undefined;
	allTimezoneValues?: string[];
}): Promise<string> {
	const { supabase, detectedTimezone, utcOffsetMinutes, allTimezoneValues } =
		options;
	const detectedTrimmed = (detectedTimezone ?? "").trim();

	if (detectedTrimmed !== "") {
		const exists = await timezoneExistsInDb(supabase, detectedTrimmed);
		if (exists) {
			return detectedTrimmed;
		}
	}

	const hasDetected = detectedTrimmed !== "";
	console.warn("timezone_resolve_missing", {
		detected_timezone: hasDetected ? detectedTrimmed : null,
		utc_offset_minutes: utcOffsetMinutes ?? null,
	});

	if (!Number.isInteger(utcOffsetMinutes)) {
		console.warn("timezone_resolve_invalid_offset", {
			detected_timezone: hasDetected ? detectedTrimmed : null,
			utc_offset_minutes: utcOffsetMinutes ?? null,
			chosen_timezone: DEFAULT_TIMEZONE,
		});
		return DEFAULT_TIMEZONE;
	}

	const now = new Date();
	const values = allTimezoneValues ?? (await getAllTimezoneValues(supabase));

	let offsetParseFailures = 0;
	const matches: string[] = [];

	for (const value of values) {
		const offsetFromUtcMinutes = getTimezoneOffsetFromUtcMinutes(value, now);
		if (offsetFromUtcMinutes === null) {
			offsetParseFailures += 1;
			continue;
		}

		const jsStyleOffsetMinutes = -offsetFromUtcMinutes;
		if (jsStyleOffsetMinutes === utcOffsetMinutes) {
			matches.push(value);
		}
	}

	if (offsetParseFailures > 0) {
		console.warn("timezone_resolve_offset_parse_failures", {
			failures: offsetParseFailures,
			total: values.length,
		});
	}

	if (matches.length === 0) {
		console.warn("timezone_resolve_no_offset_match", {
			detected_timezone: hasDetected ? detectedTrimmed : null,
			utc_offset_minutes: utcOffsetMinutes,
			chosen_timezone: DEFAULT_TIMEZONE,
		});
		return DEFAULT_TIMEZONE;
	}

	if (matches.length === 1) {
		return matches[0];
	}

	const chosen = [...matches].sort((left, right) => {
		const leftRank = getCanonicalRank(left);
		const rightRank = getCanonicalRank(right);
		if (leftRank !== rightRank) {
			return leftRank - rightRank;
		}
		return left.localeCompare(right);
	})[0];

	console.warn("timezone_resolve_tiebreak", {
		detected_timezone: hasDetected ? detectedTrimmed : null,
		utc_offset_minutes: utcOffsetMinutes,
		match_count: matches.length,
		chosen_timezone: chosen ?? DEFAULT_TIMEZONE,
	});

	return chosen ?? DEFAULT_TIMEZONE;
}
