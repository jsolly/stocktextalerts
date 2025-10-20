import { defineMiddleware } from "astro:middleware";
import { validateEnv } from "./lib/env";

// Validate environment variables once at module load time
// This ensures the app won't start if required env vars are missing
validateEnv();

export const onRequest = defineMiddleware(async (_context, next) => {
	return next();
});
