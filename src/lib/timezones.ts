export const US_TIMEZONES = [
	{ value: "America/New_York", label: "Eastern Time (ET)" },
	{ value: "America/Detroit", label: "Eastern Time - Detroit (ET)" },
	{
		value: "America/Kentucky/Louisville",
		label: "Eastern Time - Louisville, KY (ET)",
	},
	{
		value: "America/Kentucky/Monticello",
		label: "Eastern Time - Monticello, KY (ET)",
	},
	{
		value: "America/Indiana/Indianapolis",
		label: "Eastern Time - Indianapolis (ET)",
	},
	{
		value: "America/Indiana/Vincennes",
		label: "Eastern Time - Vincennes, IN (ET)",
	},
	{
		value: "America/Indiana/Winamac",
		label: "Eastern Time - Winamac, IN (ET)",
	},
	{
		value: "America/Indiana/Marengo",
		label: "Eastern Time - Marengo, IN (ET)",
	},
	{
		value: "America/Indiana/Petersburg",
		label: "Eastern Time - Petersburg, IN (ET)",
	},
	{ value: "America/Indiana/Vevay", label: "Eastern Time - Vevay, IN (ET)" },
	{ value: "America/Chicago", label: "Central Time (CT)" },
	{
		value: "America/Indiana/Tell_City",
		label: "Central Time - Tell City, IN (CT)",
	},
	{ value: "America/Indiana/Knox", label: "Central Time - Knox, IN (CT)" },
	{ value: "America/Menominee", label: "Central Time - Menominee, MI (CT)" },
	{
		value: "America/North_Dakota/Center",
		label: "Central Time - Center, ND (CT)",
	},
	{
		value: "America/North_Dakota/New_Salem",
		label: "Central Time - New Salem, ND (CT)",
	},
	{
		value: "America/North_Dakota/Beulah",
		label: "Central Time - Beulah, ND (CT)",
	},
	{ value: "America/Denver", label: "Mountain Time (MT)" },
	{ value: "America/Boise", label: "Mountain Time - Boise (MT)" },
	{ value: "America/Phoenix", label: "Mountain Time - Arizona (MT)" },
	{ value: "America/Los_Angeles", label: "Pacific Time (PT)" },
	{ value: "America/Anchorage", label: "Alaska Time (AKT)" },
	{ value: "America/Juneau", label: "Alaska Time - Juneau (AKT)" },
	{ value: "America/Sitka", label: "Alaska Time - Sitka (AKT)" },
	{ value: "America/Metlakatla", label: "Alaska Time - Metlakatla (AKT)" },
	{ value: "America/Yakutat", label: "Alaska Time - Yakutat (AKT)" },
	{ value: "America/Nome", label: "Alaska Time - Nome (AKT)" },
	{ value: "America/Adak", label: "Hawaii-Aleutian Time (HST)" },
	{ value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
] as const;

export type TimezoneValue = (typeof US_TIMEZONES)[number]["value"];
export type TimeFormat = "12h" | "24h";

const VALID_TIMEZONES = new Set<TimezoneValue>(
	US_TIMEZONES.map((tz) => tz.value),
);

const VALID_TIME_FORMATS = new Set<TimeFormat>(["12h", "24h"]);
const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

export function validateTimezone(
	timezone: string | undefined | null,
): TimezoneValue | null {
	if (!timezone || typeof timezone !== "string") {
		return null;
	}

	const trimmed = timezone.trim();

	if (!VALID_TIMEZONES.has(trimmed as TimezoneValue)) {
		console.warn(`Invalid timezone received: "${trimmed}", using null`);
		return null;
	}

	return trimmed as TimezoneValue;
}

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
