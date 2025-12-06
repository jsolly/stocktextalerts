import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
	vi.unstubAllEnvs();
});

describe("scheduled cron route [unit]", () => {
	test("returns 200 JSON summary when cron secret matches", async () => {
		vi.stubEnv("CRON_SECRET", "test-cron-secret");

		vi.doMock("../../../../../src/lib/supabase", () => ({
			createSupabaseAdminClient: () => ({ marker: "admin" }),
		}));

		vi.doMock(
			"../../../../../src/pages/api/notifications/twilio-utils",
			() => ({
				readTwilioConfig: () => ({
					accountSid: "AC123",
					authToken: "token",
					phoneNumber: "+12223334444",
				}),
				createTwilioClient: () => ({ marker: "twilio" }),
				createSmsSender: () => vi.fn(async () => ({ success: true })),
			}),
		);

		vi.doMock(
			"../../../../../src/pages/api/notifications/scheduled/scheduled-utils",
			() => ({
				sendScheduledNotifications: vi.fn(async () => ({
					skipped: 0,
					logFailures: 0,
					emailsSent: 2,
					emailsFailed: 0,
					smsSent: 1,
					smsFailed: 0,
				})),
			}),
		);

		const { POST } = await import(
			"../../../../../src/pages/api/notifications/scheduled/index"
		);

		const request = new Request(
			"http://localhost/api/notifications/scheduled",
			{
				method: "POST",
				headers: { "x-vercel-cron-secret": "test-cron-secret" },
			},
		);

		const response = await POST({ request } as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");

		const body = await response.json();
		expect(body).toEqual({
			success: true,
			skipped: 0,
			logFailures: 0,
			emailsSent: 2,
			emailsFailed: 0,
			smsSent: 1,
			smsFailed: 0,
		});
	});
});
