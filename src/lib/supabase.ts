import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function requireServerCredentials() {
	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error("Missing Supabase environment variables");
	}

	return {
		supabaseUrl,
		supabaseAnonKey,
	};
}

function requireServiceRoleCredentials() {
	if (!supabaseServiceRoleKey) {
		throw new Error(
			"Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to environment variables",
		);
	}

	return supabaseServiceRoleKey;
}

const SUPABASE_CLIENT_OPTIONS = {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
	global: {
		headers: {
			"Cache-Control": "no-cache, no-store, must-revalidate",
		},
	},
};

export function createSupabaseServerClient() {
	const credentials = requireServerCredentials();

	return createClient(
		credentials.supabaseUrl,
		credentials.supabaseAnonKey,
		SUPABASE_CLIENT_OPTIONS,
	);
}

export function createSupabaseAdminClient() {
	const credentials = requireServerCredentials();
	const serviceRoleKey = requireServiceRoleCredentials();

	return createClient(
		credentials.supabaseUrl,
		serviceRoleKey,
		SUPABASE_CLIENT_OPTIONS,
	);
}
