/* =============
Environment Validation
============= */

interface RequiredEnvVars {
	SITE_URL: string;
	PUBLIC_SUPABASE_URL: string;
	PUBLIC_SUPABASE_ANON_KEY: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	TWILIO_ORG_SID: string;
	TWILIO_AUTH_TOKEN: string;
	TWILIO_PHONE_NUMBER: string;
	TWILIO_VERIFY_SERVICE_SID: string;
	CRON_SECRET: string;
}

const REQUIRED_ENV_VARS: (keyof RequiredEnvVars)[] = [
	"SITE_URL",
	"PUBLIC_SUPABASE_URL",
	"PUBLIC_SUPABASE_ANON_KEY",
	"SUPABASE_SERVICE_ROLE_KEY",
	"TWILIO_ORG_SID",
	"TWILIO_AUTH_TOKEN",
	"TWILIO_PHONE_NUMBER",
	"TWILIO_VERIFY_SERVICE_SID",
	"CRON_SECRET",
];

export function validateEnv(): void {
	const missing: string[] = [];

	for (const varName of REQUIRED_ENV_VARS) {
		const value = import.meta.env[varName];
		if (!value || value.trim() === "") {
			missing.push(varName);
		}
	}

	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missing.join(", ")}\n` +
				"Please check your .env file and ensure all required variables are set.",
		);
	}
}

export function getSiteUrl(): string {
	const siteUrl = import.meta.env.SITE_URL;
	if (!siteUrl) {
		throw new Error(
			"SITE_URL is not configured. This should have been caught at startup.",
		);
	}
	return siteUrl;
}
