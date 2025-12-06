import { afterEach, describe, expect, test, vi } from "vitest";

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

describe("registration API [unit]", () => {
	test("creates user and profile then redirects to unconfirmed page", async () => {
		const signUpSpy = vi.fn(async () => ({
			data: { user: { id: "user-1" } },
			error: null,
		}));

		const upsertSpy = vi.fn(() => ({
			select: () => ({
				single: async () => ({
					data: { id: "user-1", email: "test@example.com" },
					error: null,
				}),
			}),
		}));

		vi.doMock("../../../../../src/lib/supabase", () => ({
			createSupabaseServerClient: () => ({
				auth: { signUp: signUpSpy },
			}),
			createSupabaseAdminClient: () => ({
				from: () => ({ upsert: upsertSpy }),
			}),
		}));

		const { POST } = await import(
			"../../../../../src/pages/api/auth/email/register"
		);

		const form = new URLSearchParams({
			email: "test@example.com",
			password: "securepassword123",
			timezone: "America/New_York",
			time_format: "12h",
		});

		const request = new Request("http://localhost/api/auth/email/register", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form,
		});

		const response = await POST({
			request,
			redirect: createRedirect(),
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe(
			"/auth/unconfirmed?email=test%40example.com",
		);

		expect(signUpSpy).toHaveBeenCalledWith({
			email: "test@example.com",
			password: "securepassword123",
		});

		expect(upsertSpy).toHaveBeenCalledWith(
			{
				id: "user-1",
				email: "test@example.com",
				timezone: "America/New_York",
				time_format: "12h",
			},
			{ onConflict: "id" },
		);
	});
});
