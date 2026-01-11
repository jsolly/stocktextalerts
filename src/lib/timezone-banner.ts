export function setupTimezoneMismatchBanner(savedTimezone: string) {
	const banner = document.getElementById("timezone-mismatch-banner");
	const detectedSpan = document.getElementById("detected-timezone");
	const savedSpan = document.getElementById("saved-timezone");
	const timezoneInput = document.getElementById("timezone-update-value");
	const offsetInput = document.getElementById("timezone-update-offset");
	const dismissButton = document.getElementById("dismiss-timezone-banner");

	if (
		!(banner instanceof HTMLElement) ||
		!(detectedSpan instanceof HTMLElement) ||
		!(savedSpan instanceof HTMLElement) ||
		!(timezoneInput instanceof HTMLInputElement) ||
		!(offsetInput instanceof HTMLInputElement) ||
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

	const dismissalKey = `timezone_banner_dismissed:${savedTimezoneTrimmed}:${detectedTimezone}`;
	if (sessionStorage.getItem(dismissalKey) === "1") {
		return;
	}

	if (
		!detectedTimezone ||
		!savedTimezoneTrimmed ||
		detectedTimezone === savedTimezoneTrimmed
	) {
		return;
	}

	detectedSpan.textContent = detectedTimezone;
	savedSpan.textContent = savedTimezoneTrimmed;
	timezoneInput.value = detectedTimezone;

	try {
		offsetInput.value = String(new Date().getTimezoneOffset());
	} catch {
		offsetInput.value = "";
	}

	dismissButton.addEventListener("click", () => {
		sessionStorage.setItem(dismissalKey, "1");
		banner.classList.add("hidden");
	});

	banner.classList.remove("hidden");
}
