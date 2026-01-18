import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/preferences/timezone";
import { adminClient } from "../../../setup";
import { createAuthenticatedCookies, createTestUser } from "../../../utils";

describe("POST /api/preferences/timezone", () => {
	it("updates the current user's timezone and redirects back", async () => {
		const testUser = await createTestUser({
			email: `test-timezone-${Date.now()}@example.com`,
			password: "TestPassword123!",
			confirmed: true,
			timezone: "America/New_York",
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("timezone", "Etc/UTC");

		const request = new Request("http://localhost/api/preferences/timezone", {
			method: "POST",
			body: formData,
		});

		const response = await POST({
			request,
			cookies: {
				get: (name: string) => {
					const cookie = cookies.get(name);
					return cookie ? { value: cookie } : undefined;
				},
				set: () => {},
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=timezone_updated",
		);

		const { data: updatedUser, error } = await adminClient
			.from("users")
			.select("timezone")
			.eq("id", testUser.id)
			.single();

		expect(error).toBeNull();
		expect(updatedUser).not.toBeNull();
		expect(updatedUser.timezone).toBe("Etc/UTC");
	});
});
