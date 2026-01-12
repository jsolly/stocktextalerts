/* =============
Turnstile Utility Functions
============= */

export function setupTurnstileCallback(
	callbackName: string,
	tokenInputId: string,
	formId?: string,
) {
	const typedWindow = window as unknown as Window & {
		[key: string]: ((token: string) => void) | undefined;
	};

	typedWindow[callbackName] = (token: string) => {
		const input = document.getElementById(tokenInputId);
		if (!(input instanceof HTMLInputElement)) {
			return;
		}

		input.value = token;
		input.dispatchEvent(new Event("input", { bubbles: true }));

		if (formId) {
			const form = document.getElementById(formId);
			if (!(form instanceof HTMLFormElement)) {
				return;
			}

			const submitButton = form.querySelector("button[type='submit']");
			if (!(submitButton instanceof HTMLButtonElement)) {
				return;
			}

			submitButton.disabled = false;
		}
	};
}

export function setupTurnstileErrorCallback(
	callbackName: string,
	handler?: (errorCode: string) => void,
) {
	const typedWindow = window as unknown as Window & {
		[key: string]: ((errorCode: string) => void) | undefined;
	};

	typedWindow[callbackName] =
		handler ||
		((errorCode: string) => {
			console.error("Turnstile error:", errorCode);
		});
}

export function setupTurnstileExpiredCallback(
	callbackName: string,
	tokenInputId: string,
	handler?: () => void,
) {
	const typedWindow = window as unknown as Window & {
		[key: string]: (() => void) | undefined;
	};

	typedWindow[callbackName] = () => {
		const input = document.getElementById(tokenInputId);
		if (input instanceof HTMLInputElement) {
			input.value = "";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}

		handler?.();
	};
}

export function initializeTurnstileForm(formId: string, tokenInputId: string) {
	const setup = () => {
		const form = document.getElementById(formId);
		if (!(form instanceof HTMLFormElement)) {
			return;
		}

		const captchaTokenInput = document.getElementById(tokenInputId);
		if (!(captchaTokenInput instanceof HTMLInputElement)) {
			return;
		}

		const submitButton = form.querySelector("button[type='submit']");
		if (!(submitButton instanceof HTMLButtonElement)) {
			return;
		}

		const updateDisabledState = () => {
			const hasToken = captchaTokenInput.value.trim().length > 0;
			submitButton.disabled = !hasToken;
		};

		updateDisabledState();

		captchaTokenInput.addEventListener("input", updateDisabledState);
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", setup);
	} else {
		setup();
	}
}

export function createCaptchaStatusHelpers(statusElementId: string) {
	const statusElement = document.getElementById(statusElementId);

	return {
		show: (message: string) => {
			if (!(statusElement instanceof HTMLElement)) {
				return;
			}

			statusElement.textContent = message;
			statusElement.classList.remove("hidden");
		},
		hide: () => {
			if (!(statusElement instanceof HTMLElement)) {
				return;
			}

			statusElement.textContent = "";
			statusElement.classList.add("hidden");
		},
	};
}
