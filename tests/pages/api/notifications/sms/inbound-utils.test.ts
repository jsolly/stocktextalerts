import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";

import { handleInboundSms } from "../../../../../src/pages/api/notifications/sms/inbound-utils";

describe("handleInboundSms [unit]", () => {
	test("processes STOP command and updates user preferences", async () => {
		const supabaseStub = createSupabaseStub({
			user: {
				id: "user-1",
				phone_verified: true,
				phone_country_code: "+1",
				phone_number: "5555550123",
			},
		});

		const validateRequest = vi.fn(() => true);

		const result = await handleInboundSms(
			{
				url: "https://example.com/api/notifications/inbound-sms",
				signature: "test-signature",
				params: {
					From: "+15555550123",
					Body: "stop",
				},
			},
			{
				authToken: "secret",
				validateRequest,
				supabase: supabaseStub.client,
			},
		);

		expect(validateRequest).toHaveBeenCalledWith(
			"secret",
			"test-signature",
			"https://example.com/api/notifications/inbound-sms",
			expect.objectContaining({
				From: "+15555550123",
				Body: "stop",
			}),
		);

		expect(result.status).toBe(200);
		expect(result.contentType).toBe("text/xml");
		expect(result.body).toContain("You have been unsubscribed");

		expect(supabaseStub.updates).toEqual([
			{ id: "user-1", changes: { sms_opted_out: true } },
		]);
	});
});

interface IncomingSupabaseOptions {
	user: {
		id: string;
		phone_verified: boolean;
		phone_country_code: string;
		phone_number: string;
	};
}

function createSupabaseStub(options: IncomingSupabaseOptions) {
	const updates: Array<{ id: string; changes: Record<string, unknown> }> = [];

	const client = {
		from(table: string) {
			if (table !== "users") {
				throw new Error(`Unexpected table access: ${table}`);
			}

			return {
				select: () => ({
					eq: (_column: string, value: string) => ({
						// Second eq: matches phone_country_code then phone_number
						eq: async (_secondColumn: string, secondValue: string) => {
							const matchesCountry = options.user.phone_country_code === value;
							const matchesNumber = options.user.phone_number === secondValue;

							if (matchesCountry && matchesNumber) {
								return {
									data: [
										{
											id: options.user.id,
											phone_verified: options.user.phone_verified,
										},
									],
									error: null,
								};
							}

							return { data: [], error: null };
						},
					}),
				}),
				update: (changes: Record<string, unknown>) => ({
					eq: async (_column: string, id: string) => {
						updates.push({ id, changes });
						return { error: null };
					},
				}),
			};
		},
	} as unknown as SupabaseClient;

	return {
		client,
		updates,
	};
}
