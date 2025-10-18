import type { APIRoute } from "astro";
import twilio from "twilio";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { createUserService } from "../../../../lib/users";

/* =============
Inlined from lib/twilio.ts
============= */

const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
	throw new Error("Missing Twilio configuration in environment variables");
}

const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

async function checkVerification(
	fullPhone: string,
	code: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const verificationCheck = await twilioClient.verify.v2
			.services(twilioVerifyServiceSid)
			.verificationChecks.create({ to: fullPhone, code });

		if (verificationCheck.status === "approved") {
			return { success: true };
		}

		return { success: false, error: "Invalid verification code" };
	} catch (error) {
		console.error("Twilio verification check error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Verification failed",
		};
	}
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const supabase = createSupabaseServerClient();
	const userService = createUserService(supabase, cookies);

	const user = await userService.getCurrentUser();
	if (!user) {
		return redirect("/auth/register?error=unauthorized");
	}

	try {
		const formData = await request.formData();
		const code = formData.get("code") as string;

		if (!code) {
			return redirect("/alerts?error=code_required");
		}

		const userData = await userService.getById(user.id);
		if (!userData.phone_country_code || !userData.phone_number) {
			return redirect("/alerts?error=phone_not_set");
		}

		const fullPhone = `${userData.phone_country_code}${userData.phone_number}`;
		const result = await checkVerification(fullPhone, code);

		if (!result.success) {
			return redirect(
				`/alerts?error=${encodeURIComponent(result.error || "invalid_code")}`,
			);
		}

		await userService.update(user.id, {
			phone_verified: true,
		});

		return redirect("/alerts?success=phone_verified");
	} catch (error) {
		console.error("Verify code error:", error);
		return redirect("/alerts?error=server_error");
	}
};
