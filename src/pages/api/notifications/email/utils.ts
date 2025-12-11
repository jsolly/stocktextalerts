import type { DeliveryResult, UserStockRow } from "../shared";

export interface EmailRequest {
	to: string;
	subject: string;
	body: string;
}

export type EmailSender = (request: EmailRequest) => Promise<DeliveryResult>;

export function createEmailSender(): EmailSender {
	return async () => {
		return { success: true };
	};
}

export function formatEmailMessage(
	userStocks: UserStockRow[],
	stocksList: string,
): string {
	if (userStocks.length === 0) {
		return stocksList;
	}
	return `Your tracked stocks: ${stocksList}`;
}
