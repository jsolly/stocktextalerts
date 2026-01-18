type NonUndefined<T> = {
	[K in keyof T]: Exclude<T[K], undefined>;
};

export function omitUndefined<T extends Record<string, unknown | undefined>>(
	input: T,
) {
	const entries = Object.entries(input).filter(
		([, value]) => value !== undefined,
	);
	return Object.fromEntries(entries) as Partial<NonUndefined<T>>;
}

export function setupEmailInputHandlers(emailInput: HTMLInputElement) {
	emailInput.addEventListener("keydown", (e) => {
		if (e.key === " ") {
			e.preventDefault();
		}
	});

	emailInput.addEventListener("paste", (e) => {
		if (!e.clipboardData) return;
		e.preventDefault();
		const paste = e.clipboardData.getData("text");
		emailInput.value = paste.replace(/\s/g, "");
	});
}
