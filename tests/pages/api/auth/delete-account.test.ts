import type { AstroCookies } from "astro";
import { afterEach, describe, expect, test, vi } from "vitest";

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

afterEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("delete-account API [unit]", () => {
	test("deletes auth user and DB row then redirects to home with success", async () => {
		const deleteUserSpy = vi.fn(async () => ({ error: null }));
		const dbDeleteEqSpy = vi.fn(async () => ({ error: null }));
		const dbSelectEqSpy = vi.fn(() => ({
			maybeSingle: async () => ({ data: { id: "user-1" }, error: null }),
		}));

		vi.doMock("../../../../src/lib/supabase", () => ({
			createSupabaseServerClient: () => ({ marker: "server" }),
			createSupabaseAdminClient: () => ({
				auth: { admin: { deleteUser: deleteUserSpy } },
				from: (table: string) => {
					if (table === "users") {
						return {
							select: () => ({ eq: dbSelectEqSpy }),
							delete: () => ({ eq: dbDeleteEqSpy }),
						};
					}
					throw new Error(`Unexpected table: ${table}`);
				},
			}),
		}));

		vi.doMock("../../../../src/lib/users", () => ({
			createUserService: () => ({
				getCurrentUser: async () => ({ id: "user-1" }),
			}),
		}));

		const { POST } = await import(
			"../../../../src/pages/api/auth/delete-account"
		);

		const cookiesStub = createCookiesStub();
		cookiesStub.values.set("sb-access-token", "old-access-token");
		cookiesStub.values.set("sb-refresh-token", "old-refresh-token");

		const response = await POST({
			cookies: cookiesStub.stub,
			redirect: createRedirect(),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/?success=account_deleted");

		expect(deleteUserSpy).toHaveBeenCalledWith("user-1");
		expect(dbDeleteEqSpy).toHaveBeenCalledWith("id", "user-1");

		expect(cookiesStub.deleteCalls).toEqual([
			{ key: "sb-access-token", options: { path: "/" } },
			{ key: "sb-refresh-token", options: { path: "/" } },
		]);
	});
});
