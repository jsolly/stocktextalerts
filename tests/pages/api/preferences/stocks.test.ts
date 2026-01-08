import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/preferences/stocks";
import { adminClient } from "../../../setup";
import { createAuthenticatedCookies, createTestUser } from "../../../utils";

describe("POST /api/preferences/stocks", () => {
	it("should successfully update tracked stocks", async () => {
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
		formData.append(
			"tracked_stocks",
			JSON.stringify(["AAPL", "MSFT", "GOOGL"]),
		);

		const request = new Request("http://localhost/api/preferences/stocks", {
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
			redirect: () => {
				throw new Error("Should not redirect");
			},
		} as unknown as APIContext);

		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

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

	it("should successfully replace existing tracked stocks", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
			trackedStocks: ["TSLA", "NVDA"],
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("tracked_stocks", JSON.stringify(["AAPL", "MSFT"]));

		const request = new Request("http://localhost/api/preferences/stocks", {
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
			redirect: () => {
				throw new Error("Should not redirect");
			},
		} as unknown as APIContext);

		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

		const { data: trackedStocks } = await adminClient
			.from("user_stocks")
			.select("symbol")
			.eq("user_id", testUser.id)
			.order("symbol");

		expect(trackedStocks).toHaveLength(2);
		expect(trackedStocks?.map((s) => s.symbol)).toEqual(["AAPL", "MSFT"]);
	});

	it("should successfully clear all tracked stocks", async () => {
		const testUser = await createTestUser({
			email: `test-${Date.now()}@example.com`,
			password: "TestPassword123!",
			trackedStocks: ["AAPL", "MSFT", "GOOGL"],
		});

		await adminClient.auth.admin.updateUserById(testUser.id, {
			email_confirm: true,
		});

		const cookies = await createAuthenticatedCookies(
			testUser.email,
			"TestPassword123!",
		);

		const formData = new FormData();
		formData.append("tracked_stocks", JSON.stringify([]));

		const request = new Request("http://localhost/api/preferences/stocks", {
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
			redirect: () => {
				throw new Error("Should not redirect");
			},
		} as unknown as APIContext);

		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

		const { data: trackedStocks } = await adminClient
			.from("user_stocks")
			.select("symbol")
			.eq("user_id", testUser.id);

		expect(trackedStocks).toHaveLength(0);
	});
});
