import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCookiesStub, createRedirect } from "../../../../test-utils";

afterEach(() => {
	vi.resetAllMocks();
});

describe("SMS verify code API [unit]", () => {
	test("verifies code and marks phone as verified when valid", async () => {
		const { createVerifyCodeHandler } = await import(
			"../../../../../src/pages/api/auth/sms/verify-code"
		);

		const supabaseStub = { marker: "supabase" } as unknown as SupabaseClient;
		const updateSpy = vi.fn(async () => ({}));
		const userServiceStub = {
			getCurrentUser: vi.fn(
				async () =>
					({
						id: "user-1",
						email: "user@example.com",
					}) as unknown as User,
			),
			getById: vi.fn(async () => ({
				id: "user-1",
				phone_country_code: "+1",
				phone_number: "5555550123",
			})),
			update: updateSpy,
		};
		const checkVerification = vi.fn(async () => ({ success: true as const }));

		const handler = createVerifyCodeHandler({
			createSupabaseServerClient: vi.fn(() => supabaseStub),
			createUserService: vi.fn(() => userServiceStub),
			checkVerification,
		});

		const form = new URLSearchParams({
			code: "123456",
		});

		const request = new Request("http://localhost/api/auth/sms/verify-code", {
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

		expect(checkVerification).toHaveBeenCalledWith("+15555550123", "123456");

		expect(updateSpy).toHaveBeenCalledWith("user-1", {
			phone_verified: true,
		});

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=phone_verified",
		);
	});
});
