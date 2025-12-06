import { afterEach, describe, expect, test, vi } from "vitest";
import { createRedirect, createTestCookiesStub } from "../../../test-utils";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("signin API [unit]", () => {
	test("sets session cookies and redirects to dashboard on success", async () => {
		const signInWithPasswordSpy = vi.fn(async () => ({
			data: {
				session: {
					access_token: "access-token-123",
					refresh_token: "refresh-token-456",
				},
			},
			error: null,
		}));

		vi.doMock("../../../../src/lib/supabase", () => ({
			createSupabaseServerClient: () => ({
				auth: { signInWithPassword: signInWithPasswordSpy },
			}),
		}));

		const { POST } = await import("../../../../src/pages/api/auth/signin");

		const form = new URLSearchParams({
			email: "test@example.com",
			password: "securepassword123",
		});

		const request = new Request("http://localhost/api/auth/signin", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form,
		});

		const cookiesStub = createTestCookiesStub();

		const response = await POST({
			request,
			cookies: cookiesStub.stub,
			redirect: createRedirect(),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/dashboard");

		expect(signInWithPasswordSpy).toHaveBeenCalledWith({
			email: "test@example.com",
			password: "securepassword123",
		});

		expect(cookiesStub.values.get("sb-access-token")).toBe("access-token-123");
		expect(cookiesStub.values.get("sb-refresh-token")).toBe(
			"refresh-token-456",
		);
	});
});
