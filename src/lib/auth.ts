export function getAuthErrorMessage(error: string | null): string {
	if (!error) return "";

	switch (error) {
		case "missing_phone":
			return "Phone number is required";
		case "invalid_phone":
			return "Invalid phone number format";
		case "missing_code":
			return "Verification code is required";
		case "invalid_code":
			return "Invalid or expired verification code";
		case "rate_limit":
			return "Too many attempts. Please try again later.";
		case "failed":
			return "Failed to process request. Please try again.";
		case "invalid_credentials":
			return "Invalid email or password";
		case "missing_fields":
			return "Email and password are required";
		case "delete_failed":
			return "Failed to delete account. Please try again.";
		case "user_not_found":
			return "User not found";
		default:
			return "An unexpected error occurred. Please try again.";
	}
}

export function getAuthSuccessMessage(code: string | null): string {
	if (!code) return "";

	switch (code) {
		case "password_reset":
			return "Password updated successfully! You can now sign in with your new password.";
		default:
			return "";
	}
}
