import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/notifications/preview";
import { adminClient } from "../../../setup";
import { createAuthenticatedCookies, createTestUser } from "../../../utils";

const TEST_PASSWORD = "TestPassword123!";

describe("Preview Notifications Endpoint", () => {
	const toAstroCookies = (
		cookies: Map<string, string>,
	): APIContext["cookies"] =>
		({
			get: (name: string) => {
				const value = cookies.get(name);
				return value ? { value } : undefined;
			},
			set: () => {},
		}) as unknown as APIContext["cookies"];

	it("returns 401 when user is not authenticated", async () => {
		const request = new Request("http://localhost/api/notifications/preview", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "email" }),
		});

		const response = await POST({
			request,
			cookies: toAstroCookies(new Map()),
		} as APIContext);

		expect(response.status).toBe(401);
		const json = await response.json();
		expect(json.success).toBe(false);
		expect(json.error).toBe("Unauthorized");
	});

	it("returns 400 when notification type is invalid", async () => {
		const { id, email } = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			confirmed: true,
		});
		try {
			const cookies = await createAuthenticatedCookies(email, TEST_PASSWORD);

			const request = new Request(
				"http://localhost/api/notifications/preview",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "invalid" }),
				},
			);

			const response = await POST({
				request,
				cookies: toAstroCookies(cookies),
			} as APIContext);

			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json.success).toBe(false);
			expect(json.error).toBe("Invalid notification type");
		} finally {
			await adminClient.auth.admin.deleteUser(id);
		}
	});

	it("returns 400 when user record missing required email notification fields", async () => {
		const { id, email } = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			confirmed: true,
			emailNotificationsEnabled: false,
		});

		try {
			const cookies = await createAuthenticatedCookies(email, TEST_PASSWORD);

			const request = new Request(
				"http://localhost/api/notifications/preview",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "email" }),
				},
			);

			const response = await POST({
				request,
				cookies: toAstroCookies(cookies),
			} as APIContext);

			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json.success).toBe(false);
			expect(json.error).toBe(
				"User record missing required email notification fields",
			);
		} finally {
			await adminClient.auth.admin.deleteUser(id);
		}
	});

	it("returns 400 when user record missing required SMS notification fields", async () => {
		const { id, email } = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			confirmed: true,
			smsNotificationsEnabled: false,
		});

		try {
			const cookies = await createAuthenticatedCookies(email, TEST_PASSWORD);

			const request = new Request(
				"http://localhost/api/notifications/preview",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "sms" }),
				},
			);

			const response = await POST({
				request,
				cookies: toAstroCookies(cookies),
			} as APIContext);

			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json.success).toBe(false);
			expect(json.error).toBe(
				"User record missing required SMS notification fields",
			);
		} finally {
			await adminClient.auth.admin.deleteUser(id);
		}
	});

	it("sends preview email notification when user has valid email fields", async () => {
		const { id, email } = await createTestUser({
			email:
				process.env.TEST_EMAIL_RECIPIENT || `test-${Date.now()}@resend.dev`,
			confirmed: true,
			emailNotificationsEnabled: true,
			trackedStocks: ["AAPL"],
		});

		try {
			const cookies = await createAuthenticatedCookies(email, TEST_PASSWORD);

			const request = new Request(
				"http://localhost/api/notifications/preview",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "email" }),
				},
			);

			const response = await POST({
				request,
				cookies: toAstroCookies(cookies),
			} as APIContext);

			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json.success).toBe(true);
			expect(typeof json.logged).toBe("boolean");
		} finally {
			await adminClient.auth.admin.deleteUser(id);
		}
	});

	it("sends preview SMS notification when user has valid SMS fields", async () => {
		const { id, email } = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			confirmed: true,
			smsNotificationsEnabled: true,
			trackedStocks: ["AAPL"],
		});

		try {
			await adminClient
				.from("users")
				.update({
					phone_country_code: "+1",
					// Twilio "magic" test number for successful send with test credentials
					phone_number: "5005550006",
					phone_verified: true,
					sms_opted_out: false,
				})
				.eq("id", id);

			const cookies = await createAuthenticatedCookies(email, TEST_PASSWORD);

			const request = new Request(
				"http://localhost/api/notifications/preview",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "sms" }),
				},
			);

			const response = await POST({
				request,
				cookies: toAstroCookies(cookies),
			} as APIContext);

			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json.success).toBe(true);
			expect(typeof json.logged).toBe("boolean");
		} finally {
			await adminClient.auth.admin.deleteUser(id);
		}
	});
});
