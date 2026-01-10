import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/auth/email/register";
import { adminClient } from "../../../setup";

function createRegisterRequest(email: string, ip: string): APIContext {
	const payload = {
		email,
		password: "TestPassword123!",
		timezone: "America/New_York",
		time_format: "12h",
	};

	const request = new Request("http://localhost/api/auth/email/register", {
		method: "POST",
		headers: {
			"x-forwarded-for": ip,
		},
		body: new URLSearchParams(payload),
	});

	return { request } as APIContext;
}

describe("POST /api/auth/email/register", () => {
	it("can register a user", async () => {
		const payload = {
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
			timezone: "America/New_York",
			time_format: "12h",
		};

		const request = new Request("http://localhost/api/auth/email/register", {
			method: "POST",
			body: new URLSearchParams(payload),
		});

		const response = await POST({
			request,
		} as APIContext);

		// Verify redirect to unconfirmed email page
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("/auth/unconfirmed");
		expect(response.headers.get("Location")).toContain(
			encodeURIComponent(payload.email),
		);

		// Verify only one user was created
		const { data: users, error: usersError } = await adminClient
			.from("users")
			.select("*")
			.eq("email", payload.email);
		expect(usersError).toBeNull();

		if (!users) throw new Error("No users found");
		expect(users).toHaveLength(1);

		// Verify user data matches payload
		const user = users[0];
		expect(user.email).toBe(payload.email);
		expect(user.timezone).toBe(payload.timezone);
		expect(user.time_format).toBe(payload.time_format);

		// Verify user was created in auth
		const { data: authUserData, error: authError } =
			await adminClient.auth.admin.getUserById(user.id);
		expect(authError).toBeNull();
		if (!authUserData || !authUserData.user)
			throw new Error("No auth user found");
		expect(authUserData.user.email).toBe(payload.email);
	});

	it("rate limits after 10 attempts from the same IP", async () => {
		const testIp = `192.168.1.${Date.now()}`;
		const baseTimestamp = Date.now();

		// Make 10 registration attempts (rate limit is 10 per hour)
		for (let i = 0; i < 10; i++) {
			const context = createRegisterRequest(
				`test-rate-limit-${baseTimestamp}-${i}@example.com`,
				testIp,
			);

			const response = await POST(context);

			// First 10 attempts should not be rate limited
			expect(response.status).toBe(302);
			const location = response.headers.get("Location");
			expect(location).not.toContain("error=rate_limit");
		}

		// 11th attempt should be rate limited
		const context = createRegisterRequest(
			`test-rate-limit-${baseTimestamp}-10@example.com`,
			testIp,
		);

		const response = await POST(context);

		expect(response.status).toBe(302);
		const location = response.headers.get("Location");
		expect(location).toContain("/auth/register");
		expect(location).toContain("error=rate_limit");
	});

	it("verifies email after registration", async () => {
		const payload = {
			email: `test-verify-${Date.now()}@example.com`,
			password: "TestPassword123!",
			timezone: "America/New_York",
			time_format: "12h",
		};

		const request = new Request("http://localhost/api/auth/email/register", {
			method: "POST",
			body: new URLSearchParams(payload),
		});

		const response = await POST({
			request,
		} as APIContext);

		// Verify registration succeeded
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("/auth/unconfirmed");

		// Get the user from the database
		const { data: users, error: usersError } = await adminClient
			.from("users")
			.select("*")
			.eq("email", payload.email);
		expect(usersError).toBeNull();
		if (!users || users.length === 0) throw new Error("No users found");
		const user = users[0];

		// Verify user was created in auth
		const { data: authUserData, error: authError } =
			await adminClient.auth.admin.getUserById(user.id);
		expect(authError).toBeNull();
		if (!authUserData || !authUserData.user)
			throw new Error("No auth user found");

		// Verify email is NOT confirmed initially
		expect(authUserData.user.email_confirmed_at).toBeUndefined();

		// Simulate email verification by updating the user's email_confirmed_at
		const { data: updatedUserData, error: updateError } =
			await adminClient.auth.admin.updateUserById(user.id, {
				email_confirm: true,
			});
		expect(updateError).toBeNull();
		if (!updatedUserData || !updatedUserData.user)
			throw new Error("Failed to update user");

		// Verify email is now confirmed
		expect(updatedUserData.user.email_confirmed_at).not.toBeNull();
		expect(typeof updatedUserData.user.email_confirmed_at).toBe("string");
		expect(
			new Date(updatedUserData.user.email_confirmed_at).getTime(),
		).not.toBeNaN();
	});
});
