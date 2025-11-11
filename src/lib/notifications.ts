/* =============
Notification Utilities
============= */

export type DeliveryMethod = "email" | "sms";

export interface DeliveryResult {
	success: boolean;
	error?: string;
}

export interface NotificationLogEntry {
	userId: string;
	type: string;
	deliveryMethod: DeliveryMethod;
	messageDelivered: boolean;
	message?: string;
}

export function truncateSms(message: string, maxLength = 160): string {
	if (message.length <= maxLength) {
		return message;
	}

	const shortened = message.substring(0, maxLength - 3);
	return `${shortened}...`;
}
