import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
	vi.unstubAllEnvs();
});

describe("scheduled cron route [unit]", () => {
	test("returns 200 JSON summary when cron secret matches", async () => {
		vi.stubEnv("CRON_SECRET", "test-cron-secret");

		// Mock Supabase
		vi.doMock("../../../../src/lib/supabase", () => ({
			createSupabaseAdminClient: () => ({
				from: (table: string) => {
					if (table === "users") {
						return {
							select: () => ({
								or: async () => ({
									data: [
										{
											id: "user-1",
											email: "user@example.com",
											email_notifications_enabled: true,
											sms_notifications_enabled: true,
											phone_verified: true,
											phone_country_code: "+1",
											phone_number: "5555550123",
											timezone: "America/New_York",
											notification_start_hour: 8,
											notification_end_hour: 17,
										},
									],
									error: null,
								}),
							}),
						};
					}
					if (table === "user_stocks") {
						return {
							select: () => ({
								eq: async () => ({
									data: [{ symbol: "AAPL" }],
									error: null,
								}),
							}),
						};
					}
					if (table === "notification_log") {
						return {
							insert: async () => ({ error: null }),
						};
					}
					return {};
				},
			}),
		}));

		// Mock Shared Logic
		vi.doMock("../../../../src/pages/api/notifications/shared", () => ({
			shouldNotifyUser: () => true,
			loadUserStocks: async () => [{ symbol: "AAPL" }],
			recordNotification: async () => true,
		}));

		// Mock Services
		vi.doMock(
			"../../../../src/pages/api/notifications/sms/twilio-utils",
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

		vi.doMock("../../../../src/pages/api/notifications/email/utils", () => ({
			createEmailSender: () => vi.fn(),
			formatEmailMessage: () => "Test Message",
		}));

		vi.doMock("../../../../src/pages/api/notifications/email", () => ({
			sendUserEmail: async () => ({ success: true }),
			shouldSendEmail: () => true,
		}));

		vi.doMock("../../../../src/pages/api/notifications/sms", () => ({
			sendUserSms: async () => ({ success: true }),
			shouldSendSms: () => true,
		}));

		const { POST } = await import(
			"../../../../src/pages/api/notifications/scheduled"
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
			emailsSent: 1,
			emailsFailed: 0,
			smsSent: 1,
			smsFailed: 0,
		});
	});
});
