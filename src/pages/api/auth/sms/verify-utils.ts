import twilio from "twilio";

type TwilioError = {
	code?: number;
	message?: string;
	more_info?: string;
	status?: number;
	details?: unknown;
};

type VerificationClientResult =
	| { client: ReturnType<typeof twilio>; serviceSid: string; error?: never }
	| { client: null; serviceSid: null; error: string };

function createVerificationClient(): VerificationClientResult {
	const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
	const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;
	const twilioVerifyServiceSid = import.meta.env.TWILIO_VERIFY_SERVICE_SID;

	if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
		return {
			client: null,
			serviceSid: null,
			error: "Missing Twilio configuration in environment variables",
		};
	}

	return {
		client: twilio(twilioAccountSid, twilioAuthToken),
		serviceSid: twilioVerifyServiceSid,
	};
}

export async function sendVerification(
	fullPhone: string,
): Promise<{ success: boolean; error?: string }> {
	const { client, serviceSid, error } = createVerificationClient();

	if (!client || !serviceSid || error) {
		console.error("Verification client creation failed:", error);
		return { success: false, error };
	}

	try {
		await client.verify.v2
			.services(serviceSid)
			.verifications.create({ to: fullPhone, channel: "sms" });

		return { success: true };
	} catch (error) {
		const e = error as TwilioError;
		console.error("Verification send error:", {
			message: e.message,
			code: e.code,
			status: e.status,
			more_info: e.more_info,
		});
		return {
			success: false,
			error: e.message || "Failed to send verification",
		};
	}
}

export async function checkVerification(
	fullPhone: string,
	code: string,
): Promise<{ success: boolean; error?: string }> {
	const { client, serviceSid, error } = createVerificationClient();

	if (!client || !serviceSid || error) {
		console.error("Verification client creation failed:", error);
		return { success: false, error };
	}

	try {
		const verificationCheck = await client.verify.v2
			.services(serviceSid)
			.verificationChecks.create({ to: fullPhone, code });

		if (verificationCheck.status === "approved") {
			return { success: true };
		}

		return { success: false, error: "Invalid verification code" };
	} catch (error) {
		const e = error as TwilioError;
		console.error("Verification check error:", {
			message: e.message,
			code: e.code,
			status: e.status,
			more_info: e.more_info,
		});
		return {
			success: false,
			error: e.message || "Verification failed",
		};
	}
}
