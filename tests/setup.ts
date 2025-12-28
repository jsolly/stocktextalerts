import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { beforeAll } from "vitest";

// Load environment variables from .env.local if it exists
config({ path: ".env.local" });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
	throw new Error(
		"Missing required environment variables for tests: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
	);
}

export const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

export async function resetDatabase() {
	try {
		// Clean up public schema tables
		// Deleting from users cascades to user_stocks and notification_log
		const { error } = await adminClient
			.from("users")
			.delete()
			.neq("id", "00000000-0000-0000-0000-000000000000");

		if (error) {
			console.error("Failed to clean users table:", error);
			throw error;
		}

		// Note: We are not cleaning auth.users here as it's slower and tests use unique emails.
		// If necessary, we could implement auth cleanup.
	} catch (error) {
		console.error("Database reset failed:", error);
		throw error;
	}
}

beforeAll(async () => {
	await resetDatabase();
});
