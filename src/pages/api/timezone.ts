import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../lib/supabase";
import { resolveTimezone } from "../../lib/timezones";
import { createUserService } from "../../lib/users";
import { parseWithSchema, redirect } from "./form-utils";

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = createSupabaseServerClient();
	const users = createUserService(supabase, cookies);

	const authUser = await users.getCurrentUser();
	if (!authUser) {
		console.error("Timezone update attempt without authenticated user");
		return redirect("/?error=unauthorized");
	}

	const formData = await request.formData();
	const parsed = parseWithSchema(formData, {
		timezone: { type: "timezone", required: true },
		utc_offset_minutes: { type: "integer" },
		return_to: { type: "string", trim: true },
	} as const);

	if (!parsed.ok) {
		console.error("Timezone update rejected due to invalid form", {
			errors: parsed.allErrors,
		});
		return redirect("/dashboard?error=invalid_form");
	}

	const returnTo = parsed.data.return_to || "/dashboard";

	const resolvedTimezone = await resolveTimezone({
		supabase,
		detectedTimezone: parsed.data.timezone,
		utcOffsetMinutes: parsed.data.utc_offset_minutes,
	});

	try {
		await users.update(authUser.id, { timezone: resolvedTimezone });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("Failed to update timezone", {
			userId: authUser.id,
			timezone: resolvedTimezone,
			error: errorMessage,
		});
		return redirect(`${returnTo}?error=update_failed`);
	}

	return redirect(`${returnTo}?success=timezone_updated`);
};
