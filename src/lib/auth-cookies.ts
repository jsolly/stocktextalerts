import type { AstroCookies } from "astro";

export function clearAuthCookies(cookies: AstroCookies): void {
	const options = {
		path: "/",
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax" as const,
	};
	cookies.delete("sb-access-token", options);
	cookies.delete("sb-refresh-token", options);
}
