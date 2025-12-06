import { describe, expect, test, vi } from "vitest";

import {
	createSmsSender,
	type TwilioClient,
} from "../../../../src/pages/api/notifications/twilio-utils";

describe("createSmsSender [unit]", () => {
	test("calls messages.create and returns success with messageSid", async () => {
		const messagesCreateSpy = vi.fn(async () => ({ sid: "SM123456" }));

		const fakeClient = {
			messages: { create: messagesCreateSpy },
		} as unknown as TwilioClient;

		const sendSms = createSmsSender(fakeClient, "+12223334444");

		const result = await sendSms({
			to: "+15555550123",
			body: "Test message",
		});

		expect(messagesCreateSpy).toHaveBeenCalledWith({
			body: "Test message",
			from: "+12223334444",
			to: "+15555550123",
		});

		expect(result).toEqual({
			success: true,
			messageSid: "SM123456",
		});
	});

	test("uses custom from number when provided", async () => {
		const messagesCreateSpy = vi.fn(async () => ({ sid: "SM789" }));

		const fakeClient = {
			messages: { create: messagesCreateSpy },
		} as unknown as TwilioClient;

		const sendSms = createSmsSender(fakeClient, "+12223334444");

		const result = await sendSms({
			to: "+15555550123",
			body: "Custom from test",
			from: "+19998887777",
		});

		expect(messagesCreateSpy).toHaveBeenCalledWith({
			body: "Custom from test",
			from: "+19998887777",
			to: "+15555550123",
		});

		expect(result).toEqual({
			success: true,
			messageSid: "SM789",
		});
	});
});
