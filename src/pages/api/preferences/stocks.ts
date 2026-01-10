import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { createUserService } from "../../../lib/users";
import { type FormSchema, parseWithSchema } from "../form-utils";

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		console.error("Stocks update attempt without authenticated user");
		return new Response(
			JSON.stringify({ success: false, error: "Unauthorized" }),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const formData = await request.formData();
	const shape = {
		tracked_stocks: { type: "json_string_array" },
	} as const satisfies FormSchema;

	const parsed = parseWithSchema(formData, shape, (body) => ({
		trackedSymbols: body.tracked_stocks,
	}));

	if (!parsed.ok) {
		console.error("Stocks update rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return new Response(
			JSON.stringify({ success: false, error: "Invalid form" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const { trackedSymbols } = parsed.data;

	try {
		const { error } = await supabase.rpc("replace_user_stocks", {
			user_id: user.id,
			symbols: trackedSymbols,
		});

		if (error) {
			throw error;
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error("Failed to update stocks", {
			userId: user.id,
			symbols: trackedSymbols,
			error: errorMessage,
		});

		return new Response(
			JSON.stringify({ success: false, error: errorMessage }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
