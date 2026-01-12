<template>
	<div class="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-2xl font-bold text-gray-900 mb-4">Tracked Stocks</h2>

		<div class="mb-6">
			<h3 class="text-lg font-semibold text-gray-900 mb-3">Add Stock</h3>
			<StockInput
				:stock-options="stockOptions"
				:disabled="isSaving"
				@select="handleSelect"
			/>
			<p v-if="hasUnsavedChanges" class="mt-3 text-sm text-amber-700">
				Changes aren’t saved until you click <span class="font-medium">Save Stocks</span>.
			</p>
		</div>

		<div>
			<h3 class="text-lg font-semibold text-gray-900 mb-3">Your Stocks</h3>
			<p v-if="draftSymbols.length === 0" class="text-gray-500">
				No stocks tracked yet. Add your first stock above.
			</p>
			<div v-else class="space-y-2">
				<div
					v-for="symbol in draftSymbols"
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
			<div v-if="saveError" class="mt-3 text-sm text-red-600">
				{{ saveError }}
			</div>

			<div class="mt-6 flex items-center justify-end">
				<button
					type="button"
					class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
					:disabled="!hasUnsavedChanges || isSaving"
					@click="saveStocks"
				>
					<span v-if="isSaving">Saving...</span>
					<span v-else>Save Stocks</span>
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref } from "vue";

import StockInput, { type StockOption } from "./StockInput.vue";

interface Props {
	stockOptions: StockOption[];
	initialSymbols: string[];
}

const props = defineProps<Props>();

const savedSymbols = ref([...props.initialSymbols]);
const draftSymbols = ref([...props.initialSymbols]);
const isSaving = ref(false);
const saveError = ref<string | null>(null);
let abortController: AbortController | null = null;

const dispatchTrackedStocksEvent = (
	name: "tracked-stocks-changed" | "tracked-stocks-saved",
	symbols: string[],
) => {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent(name, {
			detail: {
				symbols,
			},
		}),
	);
};

const hasUnsavedChanges = computed(() => {
	if (draftSymbols.value.length !== savedSymbols.value.length) return true;
	const savedSet = new Set(savedSymbols.value);
	return draftSymbols.value.some(symbol => !savedSet.has(symbol));
});

const saveStocks = async () => {
	if (isSaving.value || !hasUnsavedChanges.value) {
		return;
	}

	saveError.value = null;
	isSaving.value = true;

	if (abortController) {
		abortController.abort();
	}

	abortController = new AbortController();

	try {
		const formData = new FormData();
		formData.append("tracked_stocks", JSON.stringify(draftSymbols.value));

		const response = await fetch("/api/preferences/stocks", {
			method: "POST",
			body: formData,
			signal: abortController.signal,
		});

		if (!response.ok) {
			saveError.value = `Failed to save (${response.status} ${response.statusText}). Please try again.`;
			return;
		}

		const data = await response.json();

		if (abortController?.signal.aborted) {
			return;
		}

		if (!data.success) {
			saveError.value = "Failed to save. Please try again.";
			return;
		}

		savedSymbols.value = [...draftSymbols.value];
		dispatchTrackedStocksEvent("tracked-stocks-saved", [...draftSymbols.value]);

		const url = new URL(window.location.href);
		url.searchParams.set("success", "stocks_updated");
		url.searchParams.delete("error");
		window.location.assign(url.toString());
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}

		console.error("Failed to save stocks:", error);
		saveError.value = "Failed to save. Please try again.";
	} finally {
		isSaving.value = false;
	}
};

const handleSelect = (symbol: string) => {
	if (!symbol) {
		return;
	}

	if (draftSymbols.value.includes(symbol)) {
		return;
	}

	saveError.value = null;
	draftSymbols.value = [...draftSymbols.value, symbol];
	dispatchTrackedStocksEvent("tracked-stocks-changed", [...draftSymbols.value]);
};

const removeSymbol = (symbol: string) => {
	saveError.value = null;
	draftSymbols.value = draftSymbols.value.filter(
		current => current !== symbol,
	);
	dispatchTrackedStocksEvent("tracked-stocks-changed", [...draftSymbols.value]);
};

onUnmounted(() => {
	if (abortController) {
		abortController.abort();
	}
});
</script>


