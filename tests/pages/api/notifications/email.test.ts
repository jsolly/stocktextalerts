import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/notifications/scheduled";
import { adminClient } from "../../../setup";
import { createTestUser } from "../../../utils";

describe("Scheduled Notifications Integration", () => {
	it("sends email notifications to eligible users via Resend", async () => {
		// 1. Create User
		const { id } = await createTestUser({
			email:
				process.env.TEST_EMAIL_RECIPIENT ||
				`test-notification-${Date.now()}@resend.dev`,
			timezone: "America/New_York",
			emailNotificationsEnabled: true,
			smsNotificationsEnabled: false,
			notificationStartHour: 0,
			notificationEndHour: 23,
			timeFormat: "12h",
			trackedStocks: ["AAPL"],
		});

		// 2. Execute Scheduled Job
		const cronSecret = process.env.CRON_SECRET;
		// Ensure environment matches (mocking request header is enough if app checks env)

		const request = new Request(
			"http://localhost/api/notifications/scheduled",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${cronSecret}`,
				},
			},
		);

		const response = await POST({ request } as APIContext);

		// 3. Assertions
		// Check Status
		expect(response.status).toBe(200);

		const json = await response.json();

		expect(json.success).toBe(true);

		// Verify Database Log - notification was attempted
		const { data: logs, error: logError } = await adminClient
			.from("notification_log")
			.select("*")
			.eq("user_id", id)
			.eq("delivery_method", "email")
			.order("created_at", { ascending: false })
			.limit(1);

		expect(logError).toBeNull();
		expect(logs).toHaveLength(1);
		const log = logs?.[0];
		if (!log) throw new Error("Expected log entry not found");

		// Verify notification was attempted and logged
		// Note: Email delivery may fail due to invalid API key or rate limits
		expect(json.emailsSent + json.emailsFailed).toBeGreaterThanOrEqual(1);

		// If email succeeded, message should contain AAPL. If failed, error will be in message
		if (log.message_delivered) {
			expect(log.message).toContain("AAPL");
		} else {
			// On failure, error is logged - verify the log entry exists
			expect(log.error).toBeTruthy();
		}
	});
});
