import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/preferences";
import { adminClient } from "../../../setup";
import { createAuthenticatedCookies, createTestUser } from "../../../utils";

describe("POST /api/preferences", () => {
	it("should successfully update user preferences", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("email_notifications_enabled", "true");
		formData.append("sms_notifications_enabled", "false");
		formData.append("timezone", "America/Los_Angeles");
		formData.append("notification_start_hour", "8");
		formData.append("notification_end_hour", "18");
		formData.append("notification_frequency", "hourly");
		formData.append("breaking_news_enabled", "true");
		formData.append("breaking_news_threshold_percent", "5.0");
		formData.append("breaking_news_outside_window", "true");
		formData.append("time_format", "24h");

		const request = new Request("http://localhost/api/preferences", {
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
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		const { data: updatedUser } = await adminClient
			.from("users")
			.select("*")
			.eq("id", testUser.id)
			.single();

		expect(updatedUser.email_notifications_enabled).toBe(true);
		expect(updatedUser.sms_notifications_enabled).toBe(false);
		expect(updatedUser.timezone).toBe("America/Los_Angeles");
		expect(updatedUser.notification_start_hour).toBe(8);
		expect(updatedUser.notification_end_hour).toBe(18);
		expect(updatedUser.notification_frequency).toBe("hourly");
		expect(updatedUser.breaking_news_enabled).toBe(true);
		expect(updatedUser.breaking_news_threshold_percent).toBe(5.0);
		expect(updatedUser.breaking_news_outside_window).toBe(true);
		expect(updatedUser.time_format).toBe("24h");
	});

	it("should successfully update preferences with tracked stocks", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("email_notifications_enabled", "true");
		formData.append("sms_notifications_enabled", "false");
		formData.append("timezone", "America/New_York");
		formData.append("notification_frequency", "daily");
		formData.append("daily_notification_hour", "10");
		formData.append("time_format", "12h");
		formData.append(
			"tracked_stocks",
			JSON.stringify(["AAPL", "MSFT", "GOOGL"]),
		);

		const request = new Request("http://localhost/api/preferences", {
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
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		const { data: updatedUser } = await adminClient
			.from("users")
			.select("*")
			.eq("id", testUser.id)
			.single();

		expect(updatedUser.email_notifications_enabled).toBe(true);
		expect(updatedUser.notification_frequency).toBe("daily");
		expect(updatedUser.daily_notification_hour).toBe(10);

		const { data: trackedStocks } = await adminClient
			.from("user_stocks")
			.select("symbol")
			.eq("user_id", testUser.id)
			.order("symbol");

		expect(trackedStocks).toHaveLength(3);
		expect(trackedStocks?.map((s) => s.symbol)).toEqual([
			"AAPL",
			"GOOGL",
			"MSFT",
		]);
	});

	it("should successfully update preferences with daily notification hour within window", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
			notificationStartHour: 9,
			notificationEndHour: 17,
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("email_notifications_enabled", "true");
		formData.append("sms_notifications_enabled", "false");
		formData.append("notification_frequency", "daily");
		formData.append("daily_notification_hour", "12");

		const request = new Request("http://localhost/api/preferences", {
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
			redirect: (url: string) => {
				return new Response(null, {
					status: 302,
					headers: { Location: url },
				});
			},
		} as unknown as APIContext);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(
			"/dashboard?success=settings_updated",
		);

		const { data: updatedUser } = await adminClient
			.from("users")
			.select("*")
			.eq("id", testUser.id)
			.single();

		expect(updatedUser.notification_frequency).toBe("daily");
		expect(updatedUser.daily_notification_hour).toBe(12);
	});
});
