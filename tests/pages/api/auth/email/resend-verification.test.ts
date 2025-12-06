import { afterEach, describe, expect, test, vi } from "vitest";
import { createRedirect } from "../../../../test-utils";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("resend-verification API [unit]", () => {
	test("resends verification email and redirects to success page", async () => {
		const resendSpy = vi.fn(async () => ({ error: null }));

		vi.doMock("../../../../../src/lib/supabase", () => ({
			createSupabaseServerClient: () => ({
				auth: { resend: resendSpy },
			}),
		}));

		const { POST } = await import(
			"../../../../../src/pages/api/auth/email/resend-verification"
		);

		const form = new URLSearchParams({
			email: "test@example.com",
		});

		const request = new Request(
			"http://localhost/api/auth/email/resend-verification",
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
		expect(response.headers.get("Location")).toBe(
			"/auth/unconfirmed?email=test%40example.com&success=true",
		);

		expect(resendSpy).toHaveBeenCalledWith({
			type: "signup",
			email: "test@example.com",
		});
	});
});
