import type { APIRoute } from "astro";
import { parsePhoneNumber } from "libphonenumber-js";
import twilio from "twilio";
import { createSupabaseAdminClient } from "../../../../lib/supabase";

export const POST: APIRoute = async ({ request }) => {
	const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
	if (!twilioAuthToken) {
		console.error("Missing TWILIO_AUTH_TOKEN for webhook validation");
		return new Response("Server misconfigured", { status: 500 });
	}

	// Validate Twilio signature before processing
	const signature = request.headers.get("x-twilio-signature") || "";
	const url = request.url;
	const formData = await request.formData();

	// Convert FormData to params object for Twilio validation
	const params: Record<string, string> = {};
	for (const [key, value] of formData.entries()) {
		params[key] = value.toString();
	}

	const isValid = twilio.validateRequest(
		twilioAuthToken,
		signature,
		url,
		params,
	);
	if (!isValid) {
		return new Response("Invalid signature", { status: 403 });
	}

	const supabase = createSupabaseAdminClient();

	try {
		const from = formData.get("From") as string;
		const body = (formData.get("Body") as string)?.trim().toUpperCase();

		if (!from || !body) {
			return new Response("Missing parameters", { status: 400 });
		}

		let countryCode: string;
		let phoneNumber: string;

		try {
			const parsed = parsePhoneNumber(from);
			if (!parsed?.isValid()) {
				return new Response("Invalid phone format", { status: 400 });
			}
			countryCode = `+${parsed.countryCallingCode}`;
			phoneNumber = parsed.nationalNumber;
		} catch {
			return new Response("Invalid phone format", { status: 400 });
		}

		const { data: users, error } = await supabase
			.from("users")
			.select("id")
			.eq("phone_country_code", countryCode)
			.eq("phone_number", phoneNumber);

		if (error || !users || users.length === 0) {
			return new Response("User not found", { status: 404 });
		}

		const userId = users[0].id;
		let responseMessage = "";

		if (body === "STOP" || body === "UNSUBSCRIBE") {
			const { error: updateError } = await supabase
				.from("users")
				.update({ sms_opted_out: true })
				.eq("id", userId);

			if (updateError) {
				console.error("Failed to opt out user:", updateError);
				return new Response("Failed to update preferences", { status: 500 });
			}

			responseMessage =
				"You have been unsubscribed from SMS alerts. Reply START to resume.";
		} else if (body === "START" || body === "SUBSCRIBE") {
			const { error: updateError } = await supabase
				.from("users")
				.update({ sms_opted_out: false })
				.eq("id", userId);

			if (updateError) {
				console.error("Failed to opt in user:", updateError);
				return new Response("Failed to update preferences", { status: 500 });
			}

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
