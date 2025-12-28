import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../../src/pages/api/auth/email/register";
import { adminClient } from "../../../../setup";

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

		// Checking user profile data
		const { data: profileData, error: profileError } = await adminClient
			.from("user_profiles")
			.select("*")
			.eq("user_id", user.id)
			.single();
		expect(profileError).toBeNull();

		if (!profileData) throw new Error("No profile found");
		expect(profileData.user_id).toBe(user.id);
		expect(profileData.timezone).toBe(payload.timezone);
		expect(profileData.time_format).toBe(payload.time_format);

		// Verify user was created in auth
		const { data: authUserData, error: authError } =
			await adminClient.auth.admin.getUserById(user.id);
		expect(authError).toBeNull();
		if (!authUserData || !authUserData.user)
			throw new Error("No auth user found");
		expect(authUserData.user.email).toBe(payload.email);
	});
});
