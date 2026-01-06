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

const PRESERVED_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function resetDatabase() {
	try {
		// Clean up public schema tables
		// Deleting from users cascades to user_stocks and notification_log
		const { error } = await adminClient
			.from("users")
			.delete()
			.neq("id", PRESERVED_USER_ID);

		if (error) {
			console.error("Failed to clean users table:", error);
			throw error;
		}

		// Clean up auth.users to prevent accumulation across test runs
		// This ensures test isolation and prevents database bloat
		let hasMore = true;
		while (hasMore) {
			const { data: authUsers, error: listError } =
				await adminClient.auth.admin.listUsers({ page: 1, perPage: 50 });

			if (listError) {
				console.warn("Failed to list auth users for cleanup:", listError);
				// Don't throw - continue with test execution
				break;
			}

			const users = authUsers?.users || [];
			if (users.length === 0) {
				hasMore = false;
				break;
			}

			for (const user of users) {
				// Preserve the special test user if it exists
				if (user.id === PRESERVED_USER_ID) {
					continue;
				}

				const { error: deleteError } = await adminClient.auth.admin.deleteUser(
					user.id,
				);

				if (deleteError) {
					console.warn(`Failed to delete auth user ${user.id}:`, deleteError);
					// Continue with other users even if one fails
				}
			}

			if (users.length < 50) {
				hasMore = false;
			}
		}
	} catch (error) {
		console.error("Database reset failed:", error);
		throw error;
	}
}

beforeAll(async () => {
	await resetDatabase();
});
