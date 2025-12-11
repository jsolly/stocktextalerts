import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("inbound SMS route [unit]", () => {
	test("returns 200 TwiML response when signature is valid", async () => {
		const handleInboundSmsSpy = vi.fn(async () => ({
			status: 200,
			contentType: "text/xml",
			body: "<Response><Message>You have been unsubscribed</Message></Response>",
		}));

		vi.doMock("../../../../../src/lib/supabase", () => ({
			createSupabaseAdminClient: () => ({ marker: "admin" }),
		}));

		vi.doMock(
			"../../../../../src/pages/api/notifications/sms/twilio-utils",
			() => ({
				readTwilioConfig: () => ({
					accountSid: "AC123",
					authToken: "test-auth-token",
					phoneNumber: "+12223334444",
				}),
			}),
		);

		vi.doMock("twilio", () => ({
			default: {
				validateRequest: () => true,
			},
		}));

		vi.doMock(
			"../../../../../src/pages/api/notifications/sms/inbound-utils",
			() => ({
				handleInboundSms: handleInboundSmsSpy,
			}),
		);

		const { POST } = await import(
			"../../../../../src/pages/api/notifications/sms/inbound"
		);

		const formData = new FormData();
		formData.append("MessageSid", "SM123");
		formData.append("AccountSid", "AC123");
		formData.append("From", "+15555550123");
		formData.append("To", "+12223334444");
		formData.append("Body", "stop");

		const request = new Request(
			"http://localhost/api/notifications/sms/inbound",
			{
				method: "POST",
				headers: { "x-twilio-signature": "valid-signature" },
				body: formData,
			},
		);

		const response = await POST({ request } as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/xml");

		const body = await response.text();
		expect(body).toContain("You have been unsubscribed");

		expect(handleInboundSmsSpy).toHaveBeenCalledWith(
			{
				url: "http://localhost/api/notifications/sms/inbound",
				signature: "valid-signature",
				params: expect.objectContaining({
					MessageSid: "SM123",
					AccountSid: "AC123",
					From: "+15555550123",
					To: "+12223334444",
					Body: "stop",
				}),
			},
			{
				authToken: "test-auth-token",
				validateRequest: expect.any(Function),
				supabase: { marker: "admin" },
			},
		);
	});
});
