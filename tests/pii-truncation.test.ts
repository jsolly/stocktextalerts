import { expect, test } from "vitest";
import {
	truncateEmailForLogging,
	truncatePhoneForLogging,
} from "../src/lib/format";

test("basic addition [unit]", () => {
	expect(2 + 2).toBe(4);
});

test("truncateEmailForLogging handles normal emails [unit]", () => {
	expect(truncateEmailForLogging("john.doe@example.com")).toBe("jo***@ex***");
});

test("truncateEmailForLogging handles short local part [unit]", () => {
	expect(truncateEmailForLogging("ab@example.com")).toBe("ab***@ex***");
});

test("truncateEmailForLogging handles single character local part [unit]", () => {
	expect(truncateEmailForLogging("a@example.com")).toBe("a***@***");
});

test("truncateEmailForLogging handles empty email [unit]", () => {
	expect(truncateEmailForLogging("")).toBe("none");
});

test("truncateEmailForLogging handles long domain names [unit]", () => {
	expect(truncateEmailForLogging("test@verylongdomainname.com")).toBe(
		"te***@ve***",
	);
});

test("truncatePhoneForLogging handles normal phone numbers [unit]", () => {
	expect(truncatePhoneForLogging("+1234567890")).toBe("12******90");
});

test("truncatePhoneForLogging handles short phone numbers [unit]", () => {
	expect(truncatePhoneForLogging("1234")).toBe("1***");
});

test("truncatePhoneForLogging handles empty phone [unit]", () => {
	expect(truncatePhoneForLogging("")).toBe("none");
});

test("truncatePhoneForLogging strips formatting [unit]", () => {
	expect(truncatePhoneForLogging("+1 (234) 567-890")).toBe("12******90");
});
