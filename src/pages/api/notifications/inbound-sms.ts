import type { APIRoute } from "astro";
import twilio from "twilio";

import { createSupabaseAdminClient } from "../../../lib/db-client";
import { readTwilioConfig } from "../../../lib/twilio";
import { handleInboundSms } from "../../../modules/notifications/inbound-sms";

export const POST: APIRoute = async ({ request }) => {
	try {
		const signatureHeader = request.headers.get("x-twilio-signature");

		if (!signatureHeader) {
			console.warn("Inbound SMS request missing x-twilio-signature header");
			return new Response("Missing Twilio signature", { status: 401 });
		}

		const signature = signatureHeader;
		const formData = await request.formData();

		const params: Record<string, string> = {};
		for (const [key, value] of formData.entries()) {
			params[key] = value.toString();
		}

		const supabase = createSupabaseAdminClient();
		const twilioConfig = readTwilioConfig();

		const result = await handleInboundSms(
			{
				url: request.url,
				signature,
				params,
			},
			{
				authToken: twilioConfig.authToken,
				validateRequest: twilio.validateRequest,
				supabase,
			},
		);

		const headers: Record<string, string> = {};
		if (result.contentType) {
			headers["Content-Type"] = result.contentType;
		}

		return new Response(result.body, {
			status: result.status,
			headers,
		});
	} catch (error) {
		console.error("SMS webhook error:", error);
		return new Response("Internal server error", { status: 500 });
	}
};
