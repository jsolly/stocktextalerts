import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../lib/supabase";
import { createUserService } from "../../lib/users";
import { parseWithSchema, redirect } from "./form-utils";

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = createSupabaseServerClient();
	const users = createUserService(supabase, cookies);

	const authUser = await users.getCurrentUser();
	if (!authUser) {
		console.error("Timezone update attempt without authenticated user");
		return redirect("/signin?error=unauthorized");
	}

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		timezone: { type: "timezone", required: true },
		utc_offset_minutes: { type: "integer" },
	} as const);

	if (!parsed.ok) {
		console.error("Timezone update rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/dashboard?error=invalid_form");
	}

	try {
		await users.update(authUser.id, {
			timezone: parsed.data.timezone ?? undefined,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("Failed to update timezone", {
			userId: authUser.id,
			timezone: parsed.data.timezone,
			error: errorMessage,
		});
		return redirect("/dashboard?error=update_failed");
	}

	return redirect("/dashboard?success=timezone_updated");
};
