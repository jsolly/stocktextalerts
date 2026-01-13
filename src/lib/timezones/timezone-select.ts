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

	const detectedTimezone = detected.trim();
	const knownValues = new Set(
		Array.from(select.options).map((option) => option.value),
	);

	if (detectedTimezone && knownValues.has(detectedTimezone)) {
		select.value = detectedTimezone;
		return;
	}

	if (defaultTimezone !== "" && knownValues.has(defaultTimezone)) {
		select.value = defaultTimezone;
	}
}
