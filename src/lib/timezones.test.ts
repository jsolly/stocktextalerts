import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

function createSupabaseTimezoneValuesStub(options: {
	values: string[];
	delayMs?: number;
}) {
	let selectCount = 0;

	const delayMs = options.delayMs ?? 0;
	const rows = options.values.map((value) => ({ value }));

	const supabase = {
		from: (table: string) => {
			if (table !== "timezones") {
				throw new Error(`Unexpected table: ${table}`);
			}

			return {
				select: async (columns: string) => {
					selectCount += 1;
					if (columns !== "value") {
						throw new Error(`Unexpected columns: ${columns}`);
					}

					if (delayMs > 0) {
						await new Promise((resolve) => setTimeout(resolve, delayMs));
					}

					return { data: rows, error: null };
				},
			};
		},
	};

	return {
		supabase,
		getSelectCount: () => selectCount,
	};
}

describe("resolveTimezone caching", () => {
	it("reuses cached timezone values within TTL", async () => {
		vi.resetModules();
		const { resolveTimezone } = await import("./timezones");

		const stub = createSupabaseTimezoneValuesStub({ values: ["Etc/UTC"] });

		const first = await resolveTimezone({
			supabase: stub.supabase as unknown as SupabaseClient,
			detectedTimezone: "",
			utcOffsetMinutes: 0,
		});
		const second = await resolveTimezone({
			supabase: stub.supabase as unknown as SupabaseClient,
			detectedTimezone: "",
			utcOffsetMinutes: 0,
		});

		expect(first).toBe("Etc/UTC");
		expect(second).toBe("Etc/UTC");
		expect(stub.getSelectCount()).toBe(1);
	});

	it("dedupes concurrent loads (single in-flight query)", async () => {
		vi.resetModules();
		const { resolveTimezone } = await import("./timezones");

		const stub = createSupabaseTimezoneValuesStub({
			values: ["Etc/UTC"],
			delayMs: 20,
		});

		const [first, second] = await Promise.all([
			resolveTimezone({
				supabase: stub.supabase as unknown as SupabaseClient,
				detectedTimezone: "",
				utcOffsetMinutes: 0,
			}),
			resolveTimezone({
				supabase: stub.supabase as unknown as SupabaseClient,
				detectedTimezone: "",
				utcOffsetMinutes: 0,
			}),
		]);

		expect(first).toBe("Etc/UTC");
		expect(second).toBe("Etc/UTC");
		expect(stub.getSelectCount()).toBe(1);
	});
});
