import type { AstroCookies } from "astro";
import { describe, expect, test } from "vitest";

interface CookieDeleteCall {
	key: string;
	options: { path: string };
}

function createCookiesStub() {
	const values = new Map<string, string>();
	const deleteCalls: CookieDeleteCall[] = [];

	return {
		stub: {
			get(key: string) {
				const stored = values.get(key);
				if (!stored) return undefined;
				return { value: stored };
			},
			has(key: string) {
				return values.has(key);
			},
			set(key: string, value: string) {
				values.set(key, value);
			},
			delete(key: string, options: { path: string }) {
				values.delete(key);
				deleteCalls.push({ key, options });
			},
		} as unknown as AstroCookies,
		values,
		deleteCalls,
	};
}

function createRedirect() {
	return (location: string) =>
		new Response(null, {
			status: 303,
			headers: { Location: location },
		});
}

describe("signout API [unit]", () => {
	test("deletes session cookies and redirects to home", async () => {
		const { POST } = await import("../../../../src/pages/api/auth/signout");

		const cookiesStub = createCookiesStub();
		cookiesStub.values.set("sb-access-token", "old-access-token");
		cookiesStub.values.set("sb-refresh-token", "old-refresh-token");

		const response = await POST({
			cookies: cookiesStub.stub,
			redirect: createRedirect(),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/");

		expect(cookiesStub.deleteCalls).toEqual([
			{ key: "sb-access-token", options: { path: "/" } },
			{ key: "sb-refresh-token", options: { path: "/" } },
		]);
	});
});
