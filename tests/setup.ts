import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { Client } from "pg";
import { beforeAll } from "vitest";

// Load environment variables from .env.local if it exists
try {
	config({ path: ".env.local" });
} catch (_error) {
	// Ignore errors if .env.local doesn't exist or can't be read
	// Environment variables may be set via other means (CI, etc.)
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceRoleKey || !databaseUrl) {
	throw new Error(
		"Missing required environment variables for tests: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL must be set",
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
	const client = new Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		// Find the test user by email to preserve them
		const { rows: testUserRows } = await client.query(
			"SELECT id FROM auth.users WHERE email = $1",
			["test@jsolly.com"],
		);
		const testUserId = testUserRows[0]?.id;

		// Build list of preserved user IDs
		const preservedUserIds = [PRESERVED_USER_ID];
		if (testUserId) {
			preservedUserIds.push(testUserId);
		}

		// Clean up public schema tables
		// Deleting from users cascades to user_stocks and notification_log
		await client.query(`DELETE FROM public.users WHERE id != ALL($1::uuid[])`, [
			preservedUserIds,
		]);

		// Clear rate limits to prevent test interference
		await client.query(`DELETE FROM public.rate_limits`);

		// Clean up auth.users via Admin API to ensure proper cleanup of sessions/metadata
		const { rows: authUsers } = await client.query(
			`SELECT id FROM auth.users WHERE id != ALL($1::uuid[])`,
			[preservedUserIds],
		);

		await Promise.all(
			authUsers.map(async (user) => {
				const { error } = await adminClient.auth.admin.deleteUser(user.id);
				if (error) {
					console.warn(`Failed to cleanup user ${user.id}:`, error.message);
				}
			}),
		);
	} catch (error) {
		console.error("Database reset failed:", error);
		throw error;
	} finally {
		await client.end();
	}
}

beforeAll(async () => {
	await resetDatabase();
});
