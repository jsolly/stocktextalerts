import type { APIRoute } from "astro";
import { createSupabaseAdminClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request }) => {
	const supabase = createSupabaseAdminClient();

	try {
		const formData = await request.formData();
		const from = formData.get("From") as string;
		const body = (formData.get("Body") as string)?.trim().toUpperCase();

		if (!from || !body) {
			return new Response("Missing parameters", { status: 400 });
		}

		const phoneMatch = from.match(/^\+?(\d{1,4})(\d{10,14})$/);
		if (!phoneMatch) {
			return new Response("Invalid phone format", { status: 400 });
		}

		const [, countryCode, phoneNumber] = phoneMatch;
		const fullCountryCode = countryCode.startsWith("+")
			? countryCode
			: `+${countryCode}`;

		const { data: users, error } = await supabase
			.from("users")
			.select("id")
			.eq("phone_country_code", fullCountryCode)
			.eq("phone_number", phoneNumber);

		if (error || !users || users.length === 0) {
			return new Response("User not found", { status: 404 });
		}

		const userId = users[0].id;
		let responseMessage = "";

		if (body === "STOP" || body === "UNSUBSCRIBE") {
			await supabase
				.from("users")
				.update({ sms_opted_out: true })
				.eq("id", userId);

			responseMessage =
				"You have been unsubscribed from SMS alerts. Reply START to resume.";
		} else if (body === "START" || body === "SUBSCRIBE") {
			await supabase
				.from("users")
				.update({ sms_opted_out: false })
				.eq("id", userId);

			responseMessage =
				"You have been subscribed to SMS alerts. Reply STOP to unsubscribe.";
		} else if (body === "HELP") {
			responseMessage =
				"Stock Text Alerts: Reply STOP to unsubscribe, START to subscribe. Manage stocks at your dashboard.";
		} else {
			responseMessage = "Unknown command. Reply HELP for options.";
		}

		return new Response(
			`<?xml version="1.0" encoding="UTF-8"?>
<Response>
	<Message>${responseMessage}</Message>
</Response>`,
			{
				status: 200,
				headers: { "Content-Type": "text/xml" },
			},
		);
	} catch (error) {
		console.error("SMS webhook error:", error);
		return new Response("Internal server error", { status: 500 });
	}
};
