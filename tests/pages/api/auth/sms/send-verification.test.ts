import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCookiesStub, createRedirect } from "../../../../test-utils";

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
			getCurrentUser: vi.fn(
				async () =>
					({
						id: "user-1",
						email: "user@example.com",
					}) as unknown as User,
			),
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
		} as unknown as APIContext);

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
