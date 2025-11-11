export function getAuthErrorMessage(error: string | null): string {
	if (!error) return "";

	switch (error) {
		case "unauthorized":
			return "Please sign in to continue";
		case "phone_not_set":
			return "Add a phone number before verifying";
		case "invalid_code":
			return "Invalid or expired verification code";
		case "rate_limit":
		case "too_many_attempts":
			return "Too many attempts. Please try again later.";
		case "failed":
			return "Failed to process request. Please try again.";
		case "server_error":
			return "Something went wrong. Please try again later.";
		case "invalid_credentials":
			return "Invalid email or password";
		case "delete_failed":
			return "Failed to delete account. Please try again.";
		case "user_not_found":
			return "We couldn't find an account for that email.";
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
