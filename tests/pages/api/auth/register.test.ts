import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/auth/email/register";
import { adminClient } from "../../../setup";

describe("POST /api/auth/email/register", () => {
	it("can register a user", async () => {
		const payload = {
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
			captcha_token: "test-captcha-token",
			timezone: "America/New_York",
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

		// Verify user was created in auth
		const { data: authUserData, error: authError } =
			await adminClient.auth.admin.getUserById(user.id);
		expect(authError).toBeNull();
		if (!authUserData || !authUserData.user)
			throw new Error("No auth user found");
		expect(authUserData.user.email).toBe(payload.email);
	});

	it("correctly matches a timezone based on user's current time offset when browser timezone isn't in the database", async () => {
		// Pacific Time is typically UTC-8, which is -480 minutes from UTC
		// JavaScript-style offset (opposite) is +480 minutes
		const pacificOffsetMinutes = 480;
		const payload = {
			email: `test-offset-match-${Date.now()}@example.com`,
			password: "TestPassword123!",
			captcha_token: "test-captcha-token",
			timezone: "Fake/Pacific_Zone",
			utc_offset_minutes: String(pacificOffsetMinutes),
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

		// Verify user was created with a matching timezone from the database
		// (should match a Pacific timezone like America/Los_Angeles based on offset)
		const { data: users, error: usersError } = await adminClient
			.from("users")
			.select("*")
			.eq("email", payload.email);
		expect(usersError).toBeNull();
		if (!users) throw new Error("No users found");
		expect(users).toHaveLength(1);

		const user = users[0];
		expect(user.email).toBe(payload.email);
		// Should have matched a Pacific timezone, not the fake one or default
		expect(user.timezone).not.toBe(payload.timezone);
		expect(user.timezone).not.toBe("America/New_York");
		// Should match a Pacific timezone in the database (UTC-8 offset)
		const pacificTimezones = [
			"America/Los_Angeles",
			"America/Vancouver",
			"America/Tijuana",
		];
		expect(pacificTimezones).toContain(user.timezone);
	});

	it("fallback timezone is used if a detected timezone does not exist in the database and no valid offset is provided", async () => {
		const payload = {
			email: `test-fallback-${Date.now()}@example.com`,
			password: "TestPassword123!",
			captcha_token: "test-captcha-token",
			timezone: "Fake/Zone",
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

		// Verify user was created with fallback timezone
		const { data: users, error: usersError } = await adminClient
			.from("users")
			.select("*")
			.eq("email", payload.email);
		expect(usersError).toBeNull();
		if (!users) throw new Error("No users found");
		expect(users).toHaveLength(1);

		const user = users[0];
		expect(user.email).toBe(payload.email);
		expect(user.timezone).toBe("America/New_York");
	});

	it("correctly matches a user with a timezone in the database", async () => {
		const payload = {
			email: `test-match-${Date.now()}@example.com`,
			password: "TestPassword123!",
			captcha_token: "test-captcha-token",
			timezone: "America/Los_Angeles",
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

		// Verify user was created with the provided timezone
		const { data: users, error: usersError } = await adminClient
			.from("users")
			.select("*")
			.eq("email", payload.email);
		expect(usersError).toBeNull();
		if (!users) throw new Error("No users found");
		expect(users).toHaveLength(1);

		const user = users[0];
		expect(user.email).toBe(payload.email);
		expect(user.timezone).toBe(payload.timezone);
	});

	it("verifies email after registration", async () => {
		const payload = {
			email: `test-verify-${Date.now()}@example.com`,
			password: "TestPassword123!",
			captcha_token: "test-captcha-token",
			timezone: "America/New_York",
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
		const confirmedAt = updatedUserData.user.email_confirmed_at;
		expect(confirmedAt).toBeTruthy();
		expect(typeof confirmedAt).toBe("string");
		if (!confirmedAt) {
			throw new Error("Missing email_confirmed_at");
		}
		expect(new Date(confirmedAt).getTime()).not.toBeNaN();
	});
});
