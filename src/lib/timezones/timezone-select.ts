export function setupDetectedTimezoneOption(options?: {
	selectId?: string;
	defaultTimezone?: string;
}) {
	const selectId = options?.selectId ?? "timezone";
	const defaultTimezone = options?.defaultTimezone ?? "";

	const select = document.getElementById(selectId);
	if (!(select instanceof HTMLSelectElement)) {
		return;
	}

	if (select.value !== "") {
		return;
	}

	let detected = "";
	try {
		detected = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
	} catch {
		// Silently fail - timezone detection is a progressive enhancement
		detected = "";
	}

	const knownValues = new Set(
		Array.from(select.options).map((option) => option.value),
	);

	if (detected && detected !== "" && knownValues.has(detected)) {
		select.value = detected;
		return;
	}

	if (defaultTimezone !== "" && knownValues.has(defaultTimezone)) {
		select.value = defaultTimezone;
	}
}
