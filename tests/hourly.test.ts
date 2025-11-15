import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import type { EmailRequest } from "../src/pages/api/notifications/hourly-utils";
import {
	type EmailSender,
	sendHourlyNotifications,
} from "../src/pages/api/notifications/hourly-utils";
import type { SmsRequest } from "../src/pages/api/notifications/twilio-utils";

describe("sendHourlyNotifications [unit]", () => {
	test("delivers notifications via email and sms and logs results", async () => {
		const user = {
			id: "user-1",
			email: "user@example.com",
			phone_country_code: "+1",
			phone_number: "5555550123",
			phone_verified: true,
			sms_opted_out: false,
			timezone: "America/New_York",
			notification_start_hour: 8,
			notification_end_hour: 17,
			email_notifications_enabled: true,
			sms_notifications_enabled: true,
		};

		const supabaseStub = createSupabaseStub({
			users: [user],
			stocksByUser: {
				"user-1": [{ symbol: "AAPL" }, { symbol: "MSFT" }],
			},
		});

		const emailRequests: EmailRequest[] = [];
		const sendEmail: EmailSender = async (request) => {
			emailRequests.push(request);
			return { success: true };
		};

		const smsRequests: SmsRequest[] = [];
		const sendSms = vi.fn(async (request: SmsRequest) => {
			smsRequests.push(request);
			return { success: true };
		});

		const result = await sendHourlyNotifications({
			supabase: supabaseStub.client,
			sendEmail,
			sendSms,
		});

		expect(result.skipped).toBe(0);
		expect(emailRequests).toHaveLength(1);
		expect(emailRequests[0]?.subject).toBe("Your Hourly Stock Update");
		expect(emailRequests[0]?.body).toContain("AAPL, MSFT");

		expect(smsRequests).toHaveLength(1);
		expect(smsRequests[0]?.to).toBe("+15555550123");
		expect(smsRequests[0]?.body).toContain("Tracked: AAPL, MSFT");

		expect(supabaseStub.notificationLogs).toHaveLength(2);
		expect(supabaseStub.notificationLogs[0]?.delivery_method).toBe("email");
		expect(supabaseStub.notificationLogs[1]?.delivery_method).toBe("sms");
	});
});

interface SupabaseStubOptions {
	users: Array<Record<string, unknown>>;
	stocksByUser: Record<string, Array<{ symbol: string }>>;
}

function createSupabaseStub(options: SupabaseStubOptions) {
	const notificationLogs: Array<Record<string, unknown>> = [];

	const client = {
		from(table: string) {
			if (table === "users") {
				return {
					select: () => ({
						or: async () => ({
							data: options.users,
							error: null,
						}),
					}),
				};
			}

			if (table === "user_stocks") {
				return {
					select: () => ({
						eq: async (_column: string, userId: string) => ({
							data: options.stocksByUser[userId] ?? [],
							error: null,
						}),
					}),
				};
			}

			if (table === "notification_log") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						notificationLogs.push(payload);
						return { error: null };
					},
				};
			}

			throw new Error(`Unexpected table access: ${table}`);
		},
	} as unknown as SupabaseClient;

	return {
		client,
		notificationLogs,
	};
}
