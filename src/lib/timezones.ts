import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimezoneOption {
	value: string;
	label: string;
	display_order: number;
}

export const DEFAULT_TIMEZONE = "America/New_York";

const ALL_TIMEZONES_TTL_MS = 24 * 60 * 60 * 1000;

interface DbTimezoneRow {
	value: string;
	label: string;
	display_order: number;
	active: boolean;
}

let allTimezonesCache: {
	rows: DbTimezoneRow[];
	expiresAtMs: number;
	cacheBuster: string;
} | null = null;
let allTimezonesInFlight: Promise<DbTimezoneRow[]> | null = null;

function getTimezoneCacheBuster(): string {
	if (typeof process !== "undefined" && typeof process.env === "object") {
		const fromProcess = process.env.TIMEZONE_CACHE_BUSTER;
		if (typeof fromProcess === "string" && fromProcess.trim() !== "") {
			return fromProcess.trim();
		}
	}

	return (import.meta.env.TIMEZONE_CACHE_BUSTER ?? "").trim();
}

async function loadAllTimezones(
	supabase: SupabaseClient,
): Promise<DbTimezoneRow[]> {
	const pageSize = 1000;
	const rows: unknown[] = [];

	for (let from = 0; ; from += pageSize) {
		const { data, error } = await supabase
			.from("timezones")
			.select("value,label,display_order,active")
			.range(from, from + pageSize - 1);

		if (error) {
			throw new Error(`Failed to load timezones: ${error.message}`);
		}

		const page = data ?? [];
		rows.push(...page);

		if (page.length < pageSize) {
			break;
		}
	}

	return rows
		.map((row) => {
			if (!row || typeof row !== "object") {
				return null;
			}

			const record = row as Record<string, unknown>;

			const value = typeof record.value === "string" ? record.value.trim() : "";
			const label = typeof record.label === "string" ? record.label : value;

			const displayOrder =
				typeof record.display_order === "number"
					? record.display_order
					: Number(record.display_order);

			const active =
				typeof record.active === "boolean"
					? record.active
					: String(record.active).toLowerCase() === "true";

			return value === ""
				? null
				: {
						value,
						label,
						display_order: displayOrder,
						active,
					};
		})
		.filter(
			(row): row is DbTimezoneRow =>
				row !== null &&
				typeof row.value === "string" &&
				row.value !== "" &&
				typeof row.label === "string" &&
				Number.isFinite(row.display_order) &&
				typeof row.active === "boolean",
		);
}

async function getAllTimezonesCached(
	supabase: SupabaseClient,
): Promise<DbTimezoneRow[]> {
	const cacheBuster = getTimezoneCacheBuster();
	const nowMs = Date.now();

	if (
		allTimezonesCache &&
		allTimezonesCache.cacheBuster === cacheBuster &&
		allTimezonesCache.expiresAtMs > nowMs
	) {
		return allTimezonesCache.rows;
	}

	if (allTimezonesInFlight) {
		return allTimezonesInFlight;
	}

	allTimezonesInFlight = loadAllTimezones(supabase)
		.then((rows) => {
			allTimezonesCache = {
				rows,
				expiresAtMs: Date.now() + ALL_TIMEZONES_TTL_MS,
				cacheBuster,
			};
			return rows;
		})
		.finally(() => {
			allTimezonesInFlight = null;
		});

	return allTimezonesInFlight;
}

export async function getTimezoneOptions(
	supabase: SupabaseClient,
	options?: { includeValues?: string[] },
): Promise<TimezoneOption[]> {
	const includeValues = (options?.includeValues ?? [])
		.map((value) => value.trim())
		.filter((value) => value !== "");
	const uniqueIncludeValues = [...new Set(includeValues)];

	const rows = await getAllTimezonesCached(supabase);

	const activeTimezones = rows
		.filter((timezone) => timezone.active)
		.map((timezone) => ({
			value: timezone.value,
			label: timezone.label,
			display_order: timezone.display_order,
		}))
		.sort((left, right) => left.display_order - right.display_order);

	if (uniqueIncludeValues.length === 0) {
		return activeTimezones;
	}

	const byValue = new Map(rows.map((timezone) => [timezone.value, timezone]));

	const activeValueSet = new Set(
		activeTimezones.map((timezone) => timezone.value),
	);

	const extras = uniqueIncludeValues
		.map((value) => byValue.get(value))
		.filter((timezone): timezone is DbTimezoneRow => Boolean(timezone))
		.filter((timezone) => !activeValueSet.has(timezone.value))
		.map((timezone) => ({
			value: timezone.value,
			label: timezone.label,
			display_order: timezone.display_order,
		}))
		.sort((left, right) => left.value.localeCompare(right.value));

	return [...extras, ...activeTimezones];
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

export async function resolveTimezone(options: {
	supabase: SupabaseClient;
	detectedTimezone: string | null | undefined;
	utcOffsetMinutes: number | null | undefined;
	allTimezoneValues?: string[];
}): Promise<string> {
	const { supabase, detectedTimezone, utcOffsetMinutes, allTimezoneValues } =
		options;
	const detectedTrimmed = (detectedTimezone ?? "").trim();

	const rows = allTimezoneValues ? null : await getAllTimezonesCached(supabase);
	const values =
		allTimezoneValues ?? rows?.map((timezone) => timezone.value) ?? [];

	if (detectedTrimmed !== "") {
		const byValue = new Set(values);
		if (byValue.has(detectedTrimmed)) {
			return detectedTrimmed;
		}
	}

	if (!Number.isInteger(utcOffsetMinutes)) {
		console.warn("timezone_resolve_invalid_offset", {
			detected_timezone: detectedTrimmed !== "" ? detectedTrimmed : null,
			utc_offset_minutes: utcOffsetMinutes ?? null,
			chosen_timezone: DEFAULT_TIMEZONE,
		});
		return DEFAULT_TIMEZONE;
	}

	console.warn("timezone_resolve_fallback_to_offset", {
		detected_timezone: detectedTrimmed !== "" ? detectedTrimmed : null,
		utc_offset_minutes: utcOffsetMinutes ?? null,
	});

	const now = new Date();

	let offsetParseFailures = 0;
	const matches: DbTimezoneRow[] = [];

	if (rows) {
		for (const timezone of rows) {
			const offsetFromUtcMinutes = getTimezoneOffsetFromUtcMinutes(
				timezone.value,
				now,
			);
			if (offsetFromUtcMinutes === null) {
				offsetParseFailures += 1;
				continue;
			}

			const jsStyleOffsetMinutes = -offsetFromUtcMinutes;
			if (jsStyleOffsetMinutes === utcOffsetMinutes) {
				matches.push(timezone);
			}
		}
	} else {
		for (const value of values) {
			const offsetFromUtcMinutes = getTimezoneOffsetFromUtcMinutes(value, now);
			if (offsetFromUtcMinutes === null) {
				offsetParseFailures += 1;
				continue;
			}

			const jsStyleOffsetMinutes = -offsetFromUtcMinutes;
			if (jsStyleOffsetMinutes === utcOffsetMinutes) {
				matches.push({
					value,
					label: value,
					display_order: 0,
					active: false,
				});
			}
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
			detected_timezone: detectedTrimmed !== "" ? detectedTrimmed : null,
			utc_offset_minutes: utcOffsetMinutes,
			chosen_timezone: DEFAULT_TIMEZONE,
		});
		return DEFAULT_TIMEZONE;
	}

	if (matches.length === 1) {
		return matches[0]?.value ?? DEFAULT_TIMEZONE;
	}

	/* =============
	Tiebreaker Behavior
	============= */
	// When using allTimezoneValues, synthetic rows have active: false and
	// display_order: 0, causing the tiebreaker to rely solely on canonical
	// rank and lexical order. This is an intentional limitation when
	// database rows are not available.
	const chosen = [...matches].sort((left, right) => {
		if (left.active !== right.active) {
			return left.active ? -1 : 1;
		}

		if (
			left.active &&
			right.active &&
			left.display_order !== right.display_order
		) {
			return left.display_order - right.display_order;
		}

		const leftRank = getCanonicalRank(left.value);
		const rightRank = getCanonicalRank(right.value);
		if (leftRank !== rightRank) {
			return leftRank - rightRank;
		}
		return left.value.localeCompare(right.value);
	})[0];

	console.warn("timezone_resolve_tiebreak", {
		detected_timezone: detectedTrimmed !== "" ? detectedTrimmed : null,
		utc_offset_minutes: utcOffsetMinutes,
		match_count: matches.length,
		chosen_timezone: chosen?.value ?? DEFAULT_TIMEZONE,
	});

	return chosen?.value ?? DEFAULT_TIMEZONE;
}
