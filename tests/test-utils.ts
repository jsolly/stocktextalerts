import type { AstroCookies } from "astro";

export function createCookiesStub(): AstroCookies {
	const values = new Map<string, string>();
	const setCookieHeaders = new Map<string, string>();

	function wrap(value: string) {
		return {
			value,
			json() {
				try {
					return JSON.parse(value);
				} catch {
					return {};
				}
			},
			number() {
				return Number(value);
			},
			boolean() {
				return value !== "" && value.toLowerCase() !== "false";
			},
		};
	}

	return {
		get(key: string) {
			const stored = values.get(key);
			if (!stored) {
				return undefined;
			}
			return wrap(stored);
		},
		has(key: string) {
			return values.has(key);
		},
		set(
			key: string,
			value: string | number | boolean | Record<string, unknown>,
		) {
			const serialized =
				typeof value === "object" ? JSON.stringify(value) : String(value);

			values.set(key, serialized);
			setCookieHeaders.set(key, `${key}=${serialized}`);
		},
		delete(key: string) {
			values.delete(key);
			setCookieHeaders.delete(key);
		},
		headers() {
			function* headerStream() {
				for (const header of setCookieHeaders.values()) {
					yield header;
				}
			}
			return headerStream();
		},
		merge(cookies: AstroCookies) {
			for (const header of cookies.headers()) {
				const [key] = header.split("=", 1);
				if (key) {
					setCookieHeaders.set(key, header);
				}
			}
		},
	} as unknown as AstroCookies;
}

export interface CookieDeleteCall {
	key: string;
	options: { path: string };
}

export interface TestCookiesStub {
	stub: AstroCookies;
	values: Map<string, string>;
	deleteCalls: CookieDeleteCall[];
}

export function createTestCookiesStub(): TestCookiesStub {
	const values = new Map<string, string>();
	const deleteCalls: CookieDeleteCall[] = [];

	return {
		stub: {
			get(key: string) {
				const stored = values.get(key);
				if (!stored) return undefined;
				return { value: stored };
			},
			has(key: string) {
				return values.has(key);
			},
			set(key: string, value: string) {
				values.set(key, value);
			},
			delete(key: string, options: { path: string }) {
				values.delete(key);
				deleteCalls.push({ key, options });
			},
		} as unknown as AstroCookies,
		values,
		deleteCalls,
	};
}

export function createRedirect() {
	return (location: string) =>
		new Response(null, {
			status: 303,
			headers: { Location: location },
		});
}
