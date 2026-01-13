export function setupTimezoneMismatchBanner(options: {
	savedTimezone: string;
	allowedTimezones: string[];
}) {
	const savedTimezone = options.savedTimezone;
	const allowedTimezones = options.allowedTimezones;

	const banner = document.getElementById("timezone-mismatch-banner");
	const detectedSpan = document.getElementById("detected-timezone");
	const savedSpan = document.getElementById("saved-timezone");
	const timezoneInput = document.getElementById("timezone-update-value");
	const dismissButton = document.getElementById("dismiss-timezone-banner");

	if (
		!(banner instanceof HTMLElement) ||
		!(detectedSpan instanceof HTMLElement) ||
		!(savedSpan instanceof HTMLElement) ||
		!(timezoneInput instanceof HTMLInputElement) ||
		!(dismissButton instanceof HTMLButtonElement)
	) {
		console.warn("TimezoneMismatchBanner: Required DOM elements not found");
		return;
	}

	let detected = "";
	try {
		detected = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
	} catch {
		detected = "";
	}

	const detectedTimezone = detected.trim();
	const savedTimezoneTrimmed = String(savedTimezone ?? "").trim();

	if (!detectedTimezone) {
		return;
	}

	const allowedTimezoneSet = new Set(
		(allowedTimezones ?? []).map((timezone) => String(timezone ?? "").trim()),
	);
	if (!allowedTimezoneSet.has(detectedTimezone)) {
		return;
	}

	const dismissalKey = `timezone_mismatch_banner_dismissed:${savedTimezoneTrimmed}:${detectedTimezone}`;
	if (sessionStorage.getItem(dismissalKey) === "1") {
		return;
	}

	if (!savedTimezoneTrimmed || detectedTimezone === savedTimezoneTrimmed) {
		return;
	}

	detectedSpan.textContent = detectedTimezone;
	savedSpan.textContent = savedTimezoneTrimmed;
	timezoneInput.value = detectedTimezone;

	dismissButton.addEventListener("click", () => {
		sessionStorage.setItem(dismissalKey, "1");
		banner.classList.add("hidden");
	});

	banner.classList.remove("hidden");
}
