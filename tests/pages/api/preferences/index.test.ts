import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { APIContext, AstroCookies } from "astro";
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
});

describe("user preferences API [unit]", () => {
	test("updates notification preferences when form data is provided", async () => {
		const { createPreferencesHandler } = await import(
			"../../../../src/pages/api/preferences"
		);
		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const updateSpy = vi.fn(async () => ({}));
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" }) as unknown as User),
			getById: vi.fn(async () => null),
			update: updateSpy,
		};
		const handler = createPreferencesHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			updateUserPreferencesAndStocks: vi.fn(async () => {}),
		});

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

		const response = await handler({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		} as unknown as APIContext);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		expect(updateSpy).toHaveBeenCalledWith("user-1", {
			email_notifications_enabled: true,
			sms_notifications_enabled: false,
			timezone: "America/New_York",
			notification_start_hour: 9,
			notification_end_hour: 17,
			time_format: "24h",
		});
	});
});

describe("user preferences API boolean handling [unit]", () => {
	test("turns off notification preferences when checkboxes are unchecked", async () => {
		const { createPreferencesHandler } = await import(
			"../../../../src/pages/api/preferences"
		);
		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const updateSpy = vi.fn(async () => ({}));
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" }) as unknown as User),
			getById: vi.fn(async () => null),
			update: updateSpy,
		};
		const handler = createPreferencesHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			updateUserPreferencesAndStocks: vi.fn(async () => {}),
		});

		const form = new URLSearchParams({
			// No email_notifications_enabled or sms_notifications_enabled fields,
			// which simulates both checkboxes being unchecked in a standard HTML form.
			timezone: "America/Los_Angeles",
			notification_start_hour: "8",
			notification_end_hour: "18",
			time_format: "12h",
		});

		const request = new Request("http://localhost/api/preferences", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form,
		});

		const response = await handler({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		} as unknown as APIContext);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		expect(updateSpy).toHaveBeenCalledWith("user-1", {
			email_notifications_enabled: false,
			sms_notifications_enabled: false,
			timezone: "America/Los_Angeles",
			notification_start_hour: 8,
			notification_end_hour: 18,
			time_format: "12h",
		});
	});
});

describe("tracked stocks via preferences API [unit]", () => {
	test("replaces tracked stocks when provided", async () => {
		const { createPreferencesHandler } = await import(
			"../../../../src/pages/api/preferences"
		);
		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" }) as unknown as User),
			getById: vi.fn(async () => ({
				id: "user-1",
				phone_country_code: "+1",
				phone_number: "5555550123",
			})),
			update: vi.fn(),
		};
		const updateUserPreferencesAndStocks = vi.fn(async () => {});
		const handler = createPreferencesHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			updateUserPreferencesAndStocks,
		});

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

		const response = await handler({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		} as unknown as APIContext);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		expect(updateUserPreferencesAndStocks).toHaveBeenCalledWith(
			supabaseStub,
			"user-1",
			{
				email_notifications_enabled: false,
				sms_notifications_enabled: false,
			},
			["aapl", "MSFT", ""],
		);
	});
});

describe("user preferences API SMS + phone guard [unit]", () => {
	test("rejects enabling SMS when phone number is not set", async () => {
		const { createPreferencesHandler } = await import(
			"../../../../src/pages/api/preferences"
		);
		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({ id: "user-1" }) as unknown as User),
			getById: vi.fn(async () => ({
				id: "user-1",
				phone_country_code: null,
				phone_number: null,
			})),
			update: vi.fn(),
		};

		const updateUserPreferencesAndStocks = vi.fn(async () => {});

		const handler = createPreferencesHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			updateUserPreferencesAndStocks,
		});

		const form = new URLSearchParams({
			sms_notifications_enabled: "on",
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

		const response = await handler({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		} as unknown as APIContext);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?error=phone_not_set",
		);
		expect(userServiceStub.update).not.toHaveBeenCalled();
		expect(updateUserPreferencesAndStocks).not.toHaveBeenCalled();
	});
});
