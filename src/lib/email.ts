export async function sendEmail(
	to: string,
	subject: string,
	body: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		console.log(`[EMAIL] To: ${to}`);
		console.log(`[EMAIL] Subject: ${subject}`);
		console.log(`[EMAIL] Body: ${body}`);

		return { success: true };
	} catch (error) {
		console.error("Email send error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to send email",
		};
	}
}
