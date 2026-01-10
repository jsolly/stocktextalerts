<template>
	<div class="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Tracked Stocks</h2>

		<div class="mb-6">
			<h3 class="text-lg font-semibold text-gray-900 mb-3">Add Stock</h3>
			<StockInput :stock-options="stockOptions" @select="handleSelect" />
		</div>

		<div>
			<h3 class="text-lg font-semibold text-gray-900 mb-3">Your Stocks</h3>
			<p v-if="trackedSymbols.length === 0" class="text-gray-500">
				No stocks tracked yet. Add your first stock above.
			</p>
			<div v-else class="space-y-2">
				<div
					v-for="symbol in trackedSymbols"
					:key="symbol"
					class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
				>
					<span class="font-medium text-gray-900">{{ symbol }}</span>
					<button
						type="button"
						class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="isSaving"
						@click="removeSymbol(symbol)"
					>
						Remove
					</button>
				</div>
			</div>
			<div v-if="saveStatus" class="mt-3 text-sm" :class="statusClass">
				<span v-if="saveStatus === 'saving'">Saving...</span>
				<span v-else-if="saveStatus === 'success'">Saved</span>
				<span v-else-if="saveStatus === 'error'">Failed to save. Please try again.</span>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import StockInput, { type StockOption } from "./StockInput.vue";

const SUCCESS_MESSAGE_DISPLAY_DURATION_MS = 2000;

interface Props {
	stockOptions: StockOption[];
	initialSymbols: string[];
}

const props = defineProps<Props>();

const trackedSymbols = ref([...props.initialSymbols]);
const isSaving = ref(false);
const pendingSave = ref(false);
const saveStatus = ref<"saving" | "success" | "error" | null>(null);
let statusTimeout: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

const statusClass = computed(() => {
	switch (saveStatus.value) {
		case "saving":
			return "text-gray-600";
		case "success":
			return "text-green-600";
		case "error":
			return "text-red-600";
		default:
			return "";
	}
});

const performSave = async () => {
	if (statusTimeout) {
		clearTimeout(statusTimeout);
		statusTimeout = null;
	}

	pendingSave.value = false;
	saveStatus.value = "saving";

	abortController = new AbortController();

	try {
		const formData = new FormData();
		formData.append("tracked_stocks", JSON.stringify(trackedSymbols.value));

		const response = await fetch("/api/preferences/stocks", {
			method: "POST",
			body: formData,
			signal: abortController.signal,
		});

		const data = await response.json();

		if (response.ok && data.success) {
			if (!pendingSave.value) {
				saveStatus.value = "success";
				// Clear success message after 2s, but only if no new save is pending
				// (timeout is cleared at start of loop if a new save begins)
				statusTimeout = setTimeout(() => {
					saveStatus.value = null;
					statusTimeout = null;
				}, SUCCESS_MESSAGE_DISPLAY_DURATION_MS);
			}
		} else {
			if (!pendingSave.value) {
				saveStatus.value = "error";
			}
		}
	} catch (error) {
		// Ignore aborted requests (component unmounted)
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		console.error("Failed to save stocks:", error);
		if (!pendingSave.value) {
			saveStatus.value = "error";
		}
	}

	if (pendingSave.value) {
		await performSave();
	} else {
		isSaving.value = false;
	}
};

const saveStocks = async () => {
	if (isSaving.value) {
		pendingSave.value = true;
		return;
	}

	isSaving.value = true;
	await performSave();
};

const handleSelect = (symbol: string) => {
	if (!symbol) {
		return;
	}

	if (trackedSymbols.value.includes(symbol)) {
		return;
	}

	trackedSymbols.value = [...trackedSymbols.value, symbol];
};

const removeSymbol = (symbol: string) => {
	trackedSymbols.value = trackedSymbols.value.filter(
		current => current !== symbol,
	);
};

const updateExternalInput = () => {
	const input = document.querySelector(
		'input[name="tracked_stocks"]',
	) as HTMLInputElement | null;
	if (!input) {
		return;
	}

	const serializedValue = JSON.stringify(trackedSymbols.value);
	input.value = serializedValue;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
};

onMounted(() => {
	updateExternalInput();
});

watch(
	trackedSymbols,
	(newValue, oldValue) => {
		// Only save if this is a real change (not initial mount)
		if (oldValue !== undefined && JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
			updateExternalInput();
			saveStocks();
		}
	},
	{ deep: true },
);

onUnmounted(() => {
	if (statusTimeout) {
		clearTimeout(statusTimeout);
	}
	if (abortController) {
		abortController.abort();
	}
});
</script>


