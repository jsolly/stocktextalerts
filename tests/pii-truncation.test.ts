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

test("truncateEmailForLogging handles long domain names [unit]", () => {
	expect(truncateEmailForLogging("test@verylongdomainname.com")).toBe(
		"te***@ve***",
	);
});

test("truncatePhoneForLogging handles normal phone numbers [unit]", () => {
	expect(truncatePhoneForLogging("+1234567890")).toBe("12******90");
});
