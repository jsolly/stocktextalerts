import type { APIRoute } from "astro";

export const POST: APIRoute = async () => {
	return new Response(
		JSON.stringify({
			success: false,
			error: "Instant notifications are not implemented yet.",
		}),
		{
			status: 501,
			headers: { "Content-Type": "application/json" },
		},
	);
};
