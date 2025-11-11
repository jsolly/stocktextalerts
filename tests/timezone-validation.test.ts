import { describe, expect, it } from "vitest";
import { validateTimeFormat } from "../src/lib/timezones";

describe("validateTimeFormat [unit]", () => {
	it("accepts valid time formats", () => {
		expect(validateTimeFormat("12h")).toBe("12h");
		expect(validateTimeFormat("24h")).toBe("24h");
	});

	it("normalizes to lowercase", () => {
		expect(validateTimeFormat("12H")).toBe("12h");
		expect(validateTimeFormat("24H")).toBe("24h");
		expect(validateTimeFormat("12h")).toBe("12h");
	});

	it("trims whitespace", () => {
		expect(validateTimeFormat("  12h  ")).toBe("12h");
		expect(validateTimeFormat("  24h  ")).toBe("24h");
	});
});
