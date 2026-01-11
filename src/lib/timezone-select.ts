export function setupDetectedTimezoneOption() {
	const select = document.getElementById("timezone");
	if (!(select instanceof HTMLSelectElement)) {
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
	if (!detectedTimezone) {
		return;
	}

	const existing = Array.from(select.options).some(
		(option) => option.value === detectedTimezone,
	);
	if (existing) {
		return;
	}

	const option = document.createElement("option");
	option.value = detectedTimezone;
	option.textContent = `Detected timezone: ${detectedTimezone}`;
	// Insert after placeholder (options[0]) if it exists, otherwise append
	select.insertBefore(option, select.options[1] ?? null);
}
