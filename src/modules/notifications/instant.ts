/* =============
Instant Notifications (Placeholder)
============= */

export interface InstantNotificationOptions {
	userId: string;
	message: string;
}

export async function sendInstantNotification(
	_options: InstantNotificationOptions,
): Promise<void> {
	throw new Error("Instant notifications are not implemented yet.");
}
