import type { AstroCookies } from "astro";
import { afterEach, describe, expect, test, vi } from "vitest";

function createCookiesStub(): AstroCookies {
	const values = new Map<string, string>();
	const setCookieHeaders = new Map<string, string>();

	function wrap(value: string) {
		return {
			value,
			json() {
				try {
					return JSON.parse(value);
				} catch {
					return {};
				}
			},
			number() {
				return Number(value);
			},
			boolean() {
				return value !== "" && value.toLowerCase() !== "false";
			},
		};
	}

	return {
		get(key: string) {
			const stored = values.get(key);
			if (!stored) {
				return undefined;
			}
			return wrap(stored);
		},
		has(key: string) {
			return values.has(key);
		},
		set(
			key: string,
			value: string | number | boolean | Record<string, unknown>,
		) {
			const serialized =
				typeof value === "object" ? JSON.stringify(value) : String(value);

			values.set(key, serialized);
			setCookieHeaders.set(key, `${key}=${serialized}`);
		},
		delete(key: string) {
			values.delete(key);
			setCookieHeaders.delete(key);
		},
		headers() {
			function* headerStream() {
				for (const header of setCookieHeaders.values()) {
					yield header;
				}
			}
			return headerStream();
		},
		merge(cookies: AstroCookies) {
			for (const header of cookies.headers()) {
				const [key] = header.split("=", 1);
				if (key) {
					setCookieHeaders.set(key, header);
				}
			}
		},
	};
}

function createRedirect() {
	return (location: string) =>
		new Response(null, {
			status: 303,
			headers: { Location: location },
		});
}

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
	vi.unmock("../../src/lib/db-client");
	vi.unmock("../../src/lib/users");
	vi.unmock("../../src/lib/stocks");
});

describe("user preferences API [unit]", () => {
	test("updates notification preferences when form data is provided", async () => {
		const updateSpy = vi.fn(async () => ({}));
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
			update: updateSpy,
		};

		await vi.doMock("../../src/lib/db-client", () => ({
			createSupabaseServerClient: vi.fn(() => ({
				from: vi.fn(),
			})),
		}));

		await vi.doMock("../../src/lib/users", () => ({
			createUserService: vi.fn(() => userServiceStub),
		}));

		await vi.doMock("../../src/lib/stocks", () => ({
			replaceUserStocks: vi.fn(async () => {}),
		}));

		const { POST } = await import("../../src/pages/api/preferences");

		const form = new URLSearchParams({
			email_notifications_enabled: "on",
			timezone: "America/New_York",
			notification_start_hour: "9",
			notification_end_hour: "17",
			time_format: "24h",
		});

		const request = new Request("http://localhost/api/preferences", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form,
		});

		const response = await POST({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		});

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		expect(updateSpy).toHaveBeenCalledWith("user-1", {
			email_notifications_enabled: true,
			timezone: "America/New_York",
			notification_start_hour: 9,
			notification_end_hour: 17,
			time_format: "24h",
		});
	});
});

describe("tracked stocks via preferences API [unit]", () => {
	test("replaces tracked stocks when provided", async () => {
		const supabaseStub = { marker: "supabase" };
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
			update: vi.fn(),
		};

		await vi.doMock("../../src/lib/db-client", () => ({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
		}));

		await vi.doMock("../../src/lib/users", () => ({
			createUserService: vi.fn(() => userServiceStub),
		}));

		const replaceUserStocks = vi.fn(async () => {});
		await vi.doMock("../../src/lib/stocks", () => ({
			replaceUserStocks,
		}));

		const { POST } = await import("../../src/pages/api/preferences");

		const form = new URLSearchParams({
			tracked_stocks: JSON.stringify(["aapl", "MSFT", ""]),
		});

		const request = new Request("http://localhost/api/preferences", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form,
		});

		const response = await POST({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		});

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		expect(replaceUserStocks).toHaveBeenCalledWith(supabaseStub, "user-1", [
			"aapl",
			"MSFT",
		]);
	});
});
