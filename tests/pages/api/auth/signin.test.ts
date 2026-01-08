import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/auth/signin";
import { adminClient } from "../../../setup";
import { createTestUser } from "../../../utils";

describe("POST /api/auth/signin", () => {
	it("should successfully sign in with correct email and password", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const request = new Request("http://localhost/api/auth/signin", {
			method: "POST",
			body: new URLSearchParams({
				email: testUser.email,
				password: "TestPassword123!",
			}),
		});

		const cookies = new Map<string, string>();
		const response = await POST({
			request,
			cookies: {
				set: (name: string, value: string) => {
					cookies.set(name, value);
				},
			},
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/dashboard");
		expect(cookies.get("sb-access-token")).toBeDefined();
		expect(cookies.get("sb-refresh-token")).toBeDefined();
	});

	it("should return user_not_found error when email does not exist", async () => {
		const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

		const request = new Request("http://localhost/api/auth/signin", {
			method: "POST",
			body: new URLSearchParams({
				email: nonExistentEmail,
				password: "AnyPassword123!",
			}),
		});

		const response = await POST({
			request,
			cookies: {
				set: () => {},
			},
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		const location = response.headers.get("Location");
		expect(location).toContain("/signin?error=user_not_found");
		expect(location).toContain(encodeURIComponent(nonExistentEmail));
	});

	it("should return invalid_password error when password is incorrect", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "CorrectPassword123!",
		});

		const request = new Request("http://localhost/api/auth/signin", {
			method: "POST",
			body: new URLSearchParams({
				email: testUser.email,
				password: "WrongPassword123!",
			}),
		});

		const response = await POST({
			request,
			cookies: {
				set: () => {},
			},
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		const location = response.headers.get("Location");
		expect(location).toContain("/signin?error=invalid_password");
		expect(location).toContain(encodeURIComponent(testUser.email));
	});
});
