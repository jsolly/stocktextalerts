import { type CountryCode, parsePhoneNumber } from "libphonenumber-js";

export interface PhoneValidationResult {
	isValid: boolean;
	countryCode?: string;
	nationalNumber?: string;
	fullPhone?: string;
	error?: string;
}

export function validatePhone(
	phone: string,
	country: CountryCode = "US",
): PhoneValidationResult {
	try {
		const phoneNumber = parsePhoneNumber(phone, country);

		if (!phoneNumber || !phoneNumber.isValid()) {
			return {
				isValid: false,
				error: "Invalid phone number format",
			};
		}

		return {
			isValid: true,
			countryCode: `+${phoneNumber.countryCallingCode}`,
			nationalNumber: phoneNumber.nationalNumber,
			fullPhone: phoneNumber.number,
		};
	} catch (error) {
		return {
			isValid: false,
			error: error instanceof Error ? error.message : "Phone validation failed",
		};
	}
}

export function formatPhoneForDisplay(
	countryCode: string,
	nationalNumber: string,
): string {
	try {
		const phoneNumber = parsePhoneNumber(`${countryCode}${nationalNumber}`);
		return (
			phoneNumber?.formatInternational() ?? `${countryCode}${nationalNumber}`
		);
	} catch {
		return `${countryCode}${nationalNumber}`;
	}
}
