import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./setup";

export interface CreateTestUserOptions {
	email?: string;
	password?: string;
	timezone?: string;
	emailNotificationsEnabled?: boolean;
	smsNotificationsEnabled?: boolean;
	dailyDigestEnabled?: boolean;
	dailyDigestNotificationTime?: number;
	trackedStocks?: string[];
	confirmed?: boolean;
}

export interface TestUser {
	id: string;
	email: string;
}

export async function createTestUser(
	options: CreateTestUserOptions = {},
): Promise<TestUser> {
	const email =
		options.email ||
		process.env.TEST_EMAIL_RECIPIENT ||
		`test-${Date.now()}@example.com`;
	const password = options.password || "TestPassword123!";
	const timezone = options.timezone || "America/New_York";

	// Create in Auth
	const { data: authUser, error: authError } = await adminClient.auth.signUp({
		email,
		password,
		options: {
			data: { timezone },
		},
	});

	if (authError) {
		throw new Error(`Auth setup failed: ${authError.message}`);
	}

	const userId = authUser.user?.id;
	if (!userId) throw new Error("Failed to create test user ID");

	// Confirm user if requested
	if (options.confirmed) {
		const { error: confirmError } = await adminClient.auth.admin.updateUserById(
			userId,
			{ email_confirm: true },
		);
		if (confirmError) {
			throw new Error(`Failed to confirm user: ${confirmError.message}`);
		}
	}

	// Create Profile in 'users' table
	const defaultNotificationTime = 540;
	const rawNotificationTime =
		options.dailyDigestNotificationTime ?? defaultNotificationTime;
	const dailyDigestNotificationTime = Math.max(
		0,
		Math.min(1439, rawNotificationTime),
	);
	const alignedDailyDigestNotificationTime =
		Math.floor(dailyDigestNotificationTime / 15) * 15;

	const { error: profileError } = await adminClient.from("users").upsert(
		{
			id: userId,
			email,
			timezone,
			email_notifications_enabled: options.emailNotificationsEnabled ?? false,
			sms_notifications_enabled: options.smsNotificationsEnabled ?? false,
			daily_digest_enabled: options.dailyDigestEnabled ?? true,
			daily_digest_notification_time: alignedDailyDigestNotificationTime,
		},
		{ onConflict: "id" },
	);

	if (profileError) {
		throw new Error(`Profile setup failed: ${profileError.message}`);
	}

	// Add Tracked Stocks if provided
	if (options.trackedStocks && options.trackedStocks.length > 0) {
		const stockInserts = options.trackedStocks.map((symbol) => ({
			user_id: userId,
			symbol,
		}));

		const { error: stockError } = await adminClient
			.from("user_stocks")
			.insert(stockInserts);

		if (stockError) {
			throw new Error(`Stock setup failed: ${stockError.message}`);
		}
	}

	return { id: userId, email };
}

export async function createAuthenticatedCookies(
	email: string,
	password: string,
): Promise<Map<string, string>> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error("Missing Supabase environment variables");
	}

	const supabase = createClient(supabaseUrl, supabaseAnonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});

	if (error || !data.session) {
		throw new Error(`Failed to sign in: ${error?.message || "Unknown error"}`);
	}

	const cookies = new Map<string, string>();
	cookies.set("sb-access-token", data.session.access_token);
	cookies.set("sb-refresh-token", data.session.refresh_token);

	return cookies;
}
