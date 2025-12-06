import { describe, expect, test } from "vitest";

import { parseWithSchema } from "../../../src/pages/api/form-utils";

describe("parseWithSchema [unit]", () => {
	test("parses mixed schema with string, boolean, enum, hour, and integer fields", () => {
		const schema = {
			name: { type: "string", required: true },
			email: { type: "string", required: true, trim: true },
			notifications_enabled: { type: "boolean" },
			theme: { type: "enum", values: ["light", "dark", "system"] as const },
			start_hour: { type: "hour" },
			max_items: { type: "integer", min: 1, max: 100 },
		} as const;

		const formData = new FormData();
		formData.append("name", "John Doe");
		formData.append("email", "  john@example.com  ");
		formData.append("notifications_enabled", "on");
		formData.append("theme", "dark");
		formData.append("start_hour", "9");
		formData.append("max_items", "50");

		const result = parseWithSchema(formData, schema);

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.data.name).toBe("John Doe");
			expect(result.data.email).toBe("john@example.com");
			expect(result.data.notifications_enabled).toBe(true);
			expect(result.data.theme).toBe("dark");
			expect(result.data.start_hour).toBe(9);
			expect(result.data.max_items).toBe(50);
		}
	});

	test("defaults missing optional boolean to false", () => {
		const schema = {
			name: { type: "string", required: true },
			is_active: { type: "boolean" },
		} as const;

		const formData = new FormData();
		formData.append("name", "Test");

		const result = parseWithSchema(formData, schema);

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.data.name).toBe("Test");
			expect(result.data.is_active).toBe(false);
		}
	});

	test("parses json_string_array field", () => {
		const schema = {
			tags: { type: "json_string_array" },
		} as const;

		const formData = new FormData();
		formData.append("tags", JSON.stringify(["alpha", "beta", "gamma"]));

		const result = parseWithSchema(formData, schema);

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.data.tags).toEqual(["alpha", "beta", "gamma"]);
		}
	});

	test("applies transform function when provided", () => {
		const schema = {
			value: { type: "integer", required: true },
		} as const;

		const formData = new FormData();
		formData.append("value", "10");

		const result = parseWithSchema(formData, schema, (data) => ({
			doubled: data.value * 2,
		}));

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.data).toEqual({ doubled: 20 });
		}
	});
});
