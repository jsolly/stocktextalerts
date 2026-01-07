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
						class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors cursor-pointer"
						@click="removeSymbol(symbol)"
					>
						Remove
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from "vue";

import StockInput, { type StockOption } from "./StockInput.vue";

interface Props {
	stockOptions: StockOption[];
	initialSymbols: string[];
}

const props = defineProps<Props>();

const trackedSymbols = ref([...props.initialSymbols]);

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
	() => {
		updateExternalInput();
	},
	{ deep: true },
);
</script>


