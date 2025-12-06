import { afterEach, describe, expect, test, vi } from "vitest";
import { createRedirect } from "../../../../test-utils";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("forgot-password API [unit]", () => {
	test("sends password reset email and redirects to success page", async () => {
		const resetPasswordForEmailSpy = vi.fn(async () => ({ error: null }));

		vi.doMock("../../../../../src/lib/supabase", () => ({
			createSupabaseServerClient: () => ({
				auth: { resetPasswordForEmail: resetPasswordForEmailSpy },
			}),
		}));

		vi.doMock("../../../../../src/lib/env", () => ({
			getSiteUrl: () => "https://example.com",
		}));

		const { POST } = await import(
			"../../../../../src/pages/api/auth/email/forgot-password"
		);

		const form = new URLSearchParams({
			email: "test@example.com",
		});

		const request = new Request(
			"http://localhost/api/auth/email/forgot-password",
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: form,
			},
		);

		const response = await POST({
			request,
			redirect: createRedirect(),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/auth/forgot?success=true");

		expect(resetPasswordForEmailSpy).toHaveBeenCalledWith("test@example.com", {
			redirectTo: "https://example.com/auth/recover",
		});
	});
});
