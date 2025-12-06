import type { SupabaseClient } from "@supabase/supabase-js";
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
});

describe("SMS send verification API [unit]", () => {
	test("updates user before sending verification when form data is valid", async () => {
		const { createSendVerificationHandler } = await import(
			"../../../../../src/pages/api/auth/sms/send-verification"
		);

		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const updateSpy = vi.fn(async () => ({}));
		const userServiceStub = {
			getCurrentUser: vi.fn(async () => ({
				id: "user-1",
				email: "user@example.com",
			})),
			getById: vi.fn(async () => ({
				id: "user-1",
				sms_opted_out: false,
			})),
			update: updateSpy,
		};
		const sendVerification = vi.fn(async () => ({ success: true as const }));

		const handler = createSendVerificationHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			sendVerification,
		});

		const form = new URLSearchParams({
			phone_country_code: "+1",
			phone_national_number: "5555550123",
		});

		const request = new Request(
			"http://localhost/api/auth/sms/send-verification",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: form,
			},
		);

		const response = await handler({
			request,
			cookies: createCookiesStub(),
			redirect: createRedirect(),
		});

		expect(updateSpy).toHaveBeenCalledWith("user-1", {
			sms_notifications_enabled: true,
			phone_country_code: "+1",
			phone_number: "5555550123",
			phone_verified: false,
		});

		expect(sendVerification).toHaveBeenCalledWith("+15555550123");

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=verification_sent",
		);
	});
});
