import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { afterAll, beforeAll } from "vitest";

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
		execSync("npm run db:reset", { stdio: "inherit" });
	} catch (error) {
		console.error("Database reset failed:", error);
		throw error;
	}
}

beforeAll(async () => {
	await resetDatabase();
});

afterAll(async () => {
	await resetDatabase();
});
