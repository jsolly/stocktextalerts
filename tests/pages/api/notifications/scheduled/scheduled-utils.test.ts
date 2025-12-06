import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import type { DeliveryResult } from "../../../../../src/pages/api/notifications/contracts";
import type { EmailRequest } from "../../../../../src/pages/api/notifications/scheduled/scheduled-utils";
import {
	type EmailSender,
	sendScheduledNotifications,
} from "../../../../../src/pages/api/notifications/scheduled/scheduled-utils";
import type { SmsRequest } from "../../../../../src/pages/api/notifications/twilio-utils";

describe("sendScheduledNotifications [unit]", () => {
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
		const sendSms = vi.fn(
			async (request: SmsRequest): Promise<DeliveryResult> => {
				smsRequests.push(request);
				return { success: true as const };
			},
		);

		const result = await sendScheduledNotifications({
			supabase: supabaseStub.client,
			sendEmail,
			sendSms,
			getCurrentTime: () => new Date("2024-01-01T17:00:00Z"),
		});

		expect(result.skipped).toBe(0);
		expect(result.emailsSent).toBe(1);
		expect(result.emailsFailed).toBe(0);
		expect(result.smsSent).toBe(1);
		expect(result.smsFailed).toBe(0);
		expect(emailRequests).toHaveLength(1);
		expect(emailRequests[0]?.subject).toBe("Your Stock Update");
		expect(emailRequests[0]?.body).toContain("AAPL, MSFT");

		expect(smsRequests).toHaveLength(1);
		expect(smsRequests[0]?.to).toBe("+15555550123");
		expect(smsRequests[0]?.body).toContain("Tracked: AAPL, MSFT");

		expect(supabaseStub.notificationLogs).toHaveLength(2);
		expect(supabaseStub.notificationLogs[0]?.delivery_method).toBe("email");
		expect(supabaseStub.notificationLogs[1]?.delivery_method).toBe("sms");
	});

	test("sends notification when user has no tracked stocks", async () => {
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
				"user-1": [],
			},
		});

		const emailRequests: EmailRequest[] = [];
		const sendEmail: EmailSender = async (request) => {
			emailRequests.push(request);
			return { success: true };
		};

		const smsRequests: SmsRequest[] = [];
		const sendSms = vi.fn(
			async (request: SmsRequest): Promise<DeliveryResult> => {
				smsRequests.push(request);
				return { success: true as const };
			},
		);

		const result = await sendScheduledNotifications({
			supabase: supabaseStub.client,
			sendEmail,
			sendSms,
			getCurrentTime: () => new Date("2024-01-01T17:00:00Z"),
		});

		expect(result.skipped).toBe(0);
		expect(result.emailsSent).toBe(1);
		expect(result.emailsFailed).toBe(0);
		expect(result.smsSent).toBe(1);
		expect(result.smsFailed).toBe(0);
		expect(emailRequests).toHaveLength(1);
		expect(emailRequests[0]?.subject).toBe("Your Stock Update");
		expect(emailRequests[0]?.body).toBe("You don't have any tracked stocks");

		expect(smsRequests).toHaveLength(1);
		expect(smsRequests[0]?.to).toBe("+15555550123");
		expect(smsRequests[0]?.body).toContain("You don't have any tracked stocks");

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
