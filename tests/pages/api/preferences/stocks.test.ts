import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { POST } from "../../../../src/pages/api/preferences/stocks";
import { adminClient } from "../../../setup";
import {
	createAuthenticatedCookies,
	createTestUser,
	type TestUser,
} from "../../../utils";

const TEST_PASSWORD = "TestPassword123!";

async function updateTrackedStocks(
	initialStocks: string[],
	stocksToUpdate: string[],
): Promise<{
	response: Response;
	testUser: TestUser;
	trackedStocks: Array<{ symbol: string }> | null;
	redirectUrl: string | null;
}> {
	const testUser = await createTestUser({
		email: `test-${Date.now()}@example.com`,
		password: TEST_PASSWORD,
		trackedStocks: initialStocks,
	});

	await adminClient.auth.admin.updateUserById(testUser.id, {
		email_confirm: true,
	});

	const cookies = await createAuthenticatedCookies(
		testUser.email,
		TEST_PASSWORD,
	);

	const formData = new FormData();
	formData.append("tracked_stocks", JSON.stringify(stocksToUpdate));

	const request = new Request("http://localhost/api/preferences/stocks", {
		method: "POST",
		body: formData,
	});

	let redirectUrl: string | null = null;
	const response = await POST({
		request,
		cookies: {
			get: (name: string) => {
				const cookie = cookies.get(name);
				return cookie ? { value: cookie } : undefined;
			},
			set: () => {},
		},
		redirect: (url: string) => {
			redirectUrl = url;
			return new Response(null, {
				status: 302,
				headers: { Location: url },
			});
		},
	} as unknown as APIContext);

	const { data: trackedStocks } = await adminClient
		.from("user_stocks")
		.select("symbol")
		.eq("user_id", testUser.id)
		.order("symbol");

	return { response, testUser, trackedStocks, redirectUrl };
}

describe("POST /api/preferences/stocks", () => {
	it("should successfully update tracked stocks", async () => {
		const { response, trackedStocks, redirectUrl } = await updateTrackedStocks(
			[],
			["AAPL", "MSFT", "GOOGL"],
		);

		expect(redirectUrl).toBeNull();
		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

		expect(trackedStocks).toHaveLength(3);
		expect(trackedStocks?.map((s) => s.symbol)).toEqual([
			"AAPL",
			"GOOGL",
			"MSFT",
		]);
	});

	it("should successfully replace existing tracked stocks", async () => {
		const { response, trackedStocks, redirectUrl } = await updateTrackedStocks(
			["TSLA", "NVDA"],
			["AAPL", "MSFT"],
		);

		expect(redirectUrl).toBeNull();
		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

		expect(trackedStocks).toHaveLength(2);
		expect(trackedStocks?.map((s) => s.symbol)).toEqual(["AAPL", "MSFT"]);
	});

	it("should successfully clear all tracked stocks", async () => {
		const { response, trackedStocks, redirectUrl } = await updateTrackedStocks(
			["AAPL", "MSFT", "GOOGL"],
			[],
		);

		expect(redirectUrl).toBeNull();
		expect(response.status).toBe(200);
		const responseData = await response.json();
		expect(responseData.success).toBe(true);

		expect(trackedStocks).toHaveLength(0);
	});
});
