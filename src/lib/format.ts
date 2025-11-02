const MESSAGE_ALLOWLIST: Record<string, string> = {
	stock_added: "Stock added successfully",
	stock_removed: "Stock removed successfully",
	phone_verified: "Phone number verified successfully",
	settings_updated: "Settings updated successfully",
	verification_sent: "Verification code sent",
	symbol_required: "Stock symbol is required",
	invalid_symbol: "Invalid stock symbol",
	failed_to_add_stock: "Failed to add stock",
	failed_to_remove_stock: "Failed to remove stock",
	server_error: "An error occurred. Please try again",
	code_required: "Verification code is required",
	invalid_code: "Invalid verification code",
	phone_not_set: "Phone number not set",
	timezone_required: "Timezone is required",
	invalid_timezone: "Invalid timezone",
	invalid_start_hour: "Invalid start hour",
	invalid_end_hour: "Invalid end hour",
	no_updates: "No updates to save",
	phone_required: "Phone number is required",
	invalid_phone: "Invalid phone number",
	sms_opted_out: "SMS notifications are disabled for this number",
	user_not_found: "User not found",
};

type MessageKey = keyof typeof MESSAGE_ALLOWLIST;

export function formatMessage(message: MessageKey | null): string {
	if (!message) return "";
	return MESSAGE_ALLOWLIST[message] ?? "";
}

export function truncateEmailForLogging(email: string): string {
	if (!email) return "none";
	const local = email.split("@")[0];
	const domain = email.split("@")[1]?.split(".")[0] || "";
	const domainPrefix = domain.slice(0, 2);

	if (local.length <= 1) {
		return `${local}***@***`;
	}
	if (local.length <= 2) {
		return `${local}***@${domainPrefix}***`;
	}
	return `${local.slice(0, 2)}***@${domainPrefix}***`;
}

export function truncatePhoneForLogging(phone: string): string {
	if (!phone) return "none";
	const digits = phone.replace(/\D/g, "");
	if (digits.length <= 4) {
		return digits.slice(0, 1) + "*".repeat(digits.length - 1);
	}
	return (
		digits.slice(0, 2) +
		"*".repeat(Math.max(4, digits.length - 4)) +
		digits.slice(-2)
	);
}
