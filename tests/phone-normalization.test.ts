import { describe, expect, it } from "vitest";
import { buildFullPhone, validatePhone } from "../src/lib/phone";

describe("Phone Normalization unit", () => {
	describe("buildFullPhone", () => {
		it("handles clean country code and phone number", () => {
			const result = buildFullPhone("+1", "5551234567");
			expect(result).toBe("+15551234567");
		});
	});

	describe("validatePhone", () => {
		it("normalizes valid US phone number", () => {
			const result = validatePhone("+12025551234");
			expect(result.isValid).toBe(true);
			expect(result.countryCode).toBe("+1");
			expect(result.nationalNumber).toMatch(/^\d+$/);
			expect(result.fullPhone).toMatch(/^\+1\d+$/);
		});

		it("normalizes valid UK phone number", () => {
			const result = validatePhone("+447911123456", "GB");
			expect(result.isValid).toBe(true);
			expect(result.countryCode).toBe("+44");
			expect(result.nationalNumber).toMatch(/^\d+$/);
			expect(result.fullPhone).toMatch(/^\+44\d+$/);
		});

		it("ensures no non-digit characters in national number", () => {
			const result = validatePhone("+12025551234");
			expect(result.isValid).toBe(true);
			expect(result.nationalNumber).not.toContain("-");
			expect(result.nationalNumber).not.toContain(" ");
			expect(result.nationalNumber).not.toContain("(");
			expect(result.nationalNumber).not.toContain(")");
		});

		it("ensures country code has exactly one + at the start", () => {
			const result = validatePhone("+12025551234");
			expect(result.isValid).toBe(true);
			expect(result.countryCode).toBe("+1");
			expect(result.countryCode?.match(/\+/g)?.length).toBe(1);
		});
	});
});
