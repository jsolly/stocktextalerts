import { describe, expect, test } from "vitest";
import { createRedirect, createTestCookiesStub } from "../../../test-utils";

describe("signout API [unit]", () => {
	test("deletes session cookies and redirects to home", async () => {
		const { POST } = await import("../../../../src/pages/api/auth/signout");

		const cookiesStub = createTestCookiesStub();
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
