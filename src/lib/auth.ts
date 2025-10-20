export function getAuthErrorMessage(error: string | null): string {
	if (!error) return "";

	switch (error) {
		case "unauthorized":
			return "Please sign in to continue";
		case "missing_phone":
			return "Phone number is required";
		case "invalid_phone":
			return "Invalid phone number format";
		case "phone_not_set":
			return "Add a phone number before verifying";
		case "missing_code":
			return "Verification code is required";
		case "invalid_code":
			return "Invalid or expired verification code";
		case "invalid_code_format":
			return "Enter a 6-digit verification code";
		case "rate_limit":
		case "too_many_attempts":
			return "Too many attempts. Please try again later.";
		case "failed":
			return "Failed to process request. Please try again.";
		case "server_error":
			return "Something went wrong. Please try again later.";
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
		case "phone_verified":
			return "Phone verified successfully.";
		case "account_deleted":
			return "Your account has been permanently deleted.";
		default:
			return "";
	}
}
