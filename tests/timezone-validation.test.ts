import { describe, expect, it } from "vitest";
import { validateTimeFormat, validateTimezone } from "../src/lib/timezones";

describe("validateTimezone", () => {
	it("accepts valid US timezones", () => {
		expect(validateTimezone("America/New_York")).toBe("America/New_York");
		expect(validateTimezone("America/Chicago")).toBe("America/Chicago");
		expect(validateTimezone("America/Denver")).toBe("America/Denver");
		expect(validateTimezone("America/Los_Angeles")).toBe("America/Los_Angeles");
		expect(validateTimezone("Pacific/Honolulu")).toBe("Pacific/Honolulu");
	});

	it("rejects invalid timezones and returns default", () => {
		expect(validateTimezone("Invalid/Timezone")).toBe("America/New_York");
		expect(validateTimezone("Europe/London")).toBe("America/New_York");
		expect(validateTimezone("")).toBe("America/New_York");
	});

	it("handles null and undefined by returning default", () => {
		expect(validateTimezone(null)).toBe("America/New_York");
		expect(validateTimezone(undefined)).toBe("America/New_York");
	});

	it("trims whitespace from valid timezones", () => {
		expect(validateTimezone("  America/Chicago  ")).toBe("America/Chicago");
	});

	it("rejects non-string input", () => {
		expect(validateTimezone(123 as unknown as string)).toBe("America/New_York");
		expect(validateTimezone({} as unknown as string)).toBe("America/New_York");
		expect(validateTimezone([] as unknown as string)).toBe("America/New_York");
	});
});

describe("validateTimeFormat", () => {
	it("accepts valid time formats", () => {
		expect(validateTimeFormat("12h")).toBe("12h");
		expect(validateTimeFormat("24h")).toBe("24h");
	});

	it("normalizes to lowercase", () => {
		expect(validateTimeFormat("12H")).toBe("12h");
		expect(validateTimeFormat("24H")).toBe("24h");
		expect(validateTimeFormat("12h")).toBe("12h");
	});

	it("rejects invalid formats and returns default", () => {
		expect(validateTimeFormat("invalid")).toBe("24h");
		expect(validateTimeFormat("12")).toBe("24h");
		expect(validateTimeFormat("24")).toBe("24h");
		expect(validateTimeFormat("")).toBe("24h");
	});

	it("handles null and undefined by returning default", () => {
		expect(validateTimeFormat(null)).toBe("24h");
		expect(validateTimeFormat(undefined)).toBe("24h");
	});

	it("trims whitespace", () => {
		expect(validateTimeFormat("  12h  ")).toBe("12h");
		expect(validateTimeFormat("  24h  ")).toBe("24h");
	});

	it("rejects non-string input", () => {
		expect(validateTimeFormat(123 as unknown as string)).toBe("24h");
		expect(validateTimeFormat({} as unknown as string)).toBe("24h");
		expect(validateTimeFormat([] as unknown as string)).toBe("24h");
	});
});
