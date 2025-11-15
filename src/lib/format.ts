const MESSAGE_ALLOWLIST: Record<string, string> = {
	stock_added: "Stock added successfully",
	stock_removed: "Stock removed successfully",
	phone_verified: "Phone number verified successfully",
	settings_updated: "Settings updated successfully",
	verification_sent: "Verification code sent",
	verification_failed: "Failed to send verification code",
	failed_to_add_stock: "Failed to add stock",
	failed_to_remove_stock: "Failed to remove stock",
	server_error: "An error occurred. Please try again",
	phone_not_set: "Phone number not set",
	no_updates: "No updates to save",
	sms_opted_out: "SMS notifications are disabled for this number",
	user_not_found: "User not found",
};

type MessageKey = keyof typeof MESSAGE_ALLOWLIST;

export function formatMessage(message: MessageKey | null): string {
	if (!message) return "";
	return MESSAGE_ALLOWLIST[message] ?? "";
}

export function truncateSms(message: string, maxLength = 160): string {
	if (message.length <= maxLength) {
		return message;
	}

	const shortened = message.substring(0, maxLength - 3);
	return `${shortened}...`;
}
