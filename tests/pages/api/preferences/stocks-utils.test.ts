import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";

import { updateUserPreferencesAndStocks } from "../../../../src/pages/api/preferences/stocks-utils";

describe("updateUserPreferencesAndStocks [unit]", () => {
	test("calls RPC with correct payload and resolves without error", async () => {
		const rpcSpy = vi.fn(async () => ({ error: null }));

		const supabaseStub = {
			rpc: rpcSpy,
		} as unknown as SupabaseClient;

		await updateUserPreferencesAndStocks(
			supabaseStub,
			"user-1",
			{
				timezone: "America/New_York",
				notification_start_hour: 9,
				notification_end_hour: 17,
				time_format: "24h",
				email_notifications_enabled: true,
				sms_notifications_enabled: false,
			},
			["AAPL", "MSFT"],
		);

		expect(rpcSpy).toHaveBeenCalledWith("update_user_preferences_and_stocks", {
			user_id: "user-1",
			timezone: "America/New_York",
			notification_start_hour: 9,
			notification_end_hour: 17,
			time_format: "24h",
			email_notifications_enabled: true,
			sms_notifications_enabled: false,
			symbols: ["AAPL", "MSFT"],
		});
	});

	test("converts undefined optional fields to null", async () => {
		const rpcSpy = vi.fn(async () => ({ error: null }));

		const supabaseStub = {
			rpc: rpcSpy,
		} as unknown as SupabaseClient;

		await updateUserPreferencesAndStocks(
			supabaseStub,
			"user-2",
			{
				email_notifications_enabled: false,
				sms_notifications_enabled: true,
			},
			[],
		);

		expect(rpcSpy).toHaveBeenCalledWith("update_user_preferences_and_stocks", {
			user_id: "user-2",
			timezone: null,
			notification_start_hour: null,
			notification_end_hour: null,
			time_format: null,
			email_notifications_enabled: false,
			sms_notifications_enabled: true,
			symbols: [],
		});
	});
});
