export function formatMessage(message: string | null): string {
	if (!message) return "";

	const formatted = message.replace(/_/g, " ").trim().replace(/\s+/g, " ");

	return formatted
		? formatted.charAt(0).toUpperCase() + formatted.slice(1)
		: "";
}
