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
