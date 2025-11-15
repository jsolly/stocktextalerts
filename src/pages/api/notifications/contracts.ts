export type DeliveryMethod = "email" | "sms";

export type DeliveryResult =
	| { success: true; messageSid?: string }
	| { success: false; error: string; errorCode?: string | number };

export interface NotificationLogEntry {
	userId: string;
	type: string;
	deliveryMethod: DeliveryMethod;
	messageDelivered: boolean;
	message?: string;
}
