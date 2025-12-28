import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./tests/setup.ts"],
		include: ["tests/**/*.test.ts"],
		fileParallelism: false,
		hookTimeout: 60000,
		testTimeout: 30000,
	},
});
