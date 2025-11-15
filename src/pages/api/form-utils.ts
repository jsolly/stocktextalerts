import { validateTimezone } from "../../lib/timezones";
import type { Hour } from "../../lib/users";

/* =============
Schema parsing
============= */
type StringFieldSpec = {
	type: "string";
	required?: boolean;
	trim?: boolean;
};

type BooleanFieldSpec = {
	type: "boolean";
	required?: boolean;
	/**
	 * Accepted truthy string values (normalized to lowercase + trimmed).
	 * Defaults to ["on", "true", "1"].
	 */
	truthyValues?: readonly string[];
	/**
	 * Accepted falsy string values (normalized to lowercase + trimmed).
	 * Defaults to ["off", "false", "0"].
	 */
	falsyValues?: readonly string[];
};

type EnumFieldSpec<TValues extends readonly string[]> = {
	type: "enum";
	values: TValues;
	required?: boolean;
};

type TimezoneFieldSpec = {
	type: "timezone";
	required?: boolean;
};

type IntegerFieldSpec = {
	type: "integer";
	required?: boolean;
	min?: number;
	max?: number;
};

type HourFieldSpec = {
	type: "hour";
	required?: boolean;
	min?: number;
	max?: number;
};

type JsonStringArrayFieldSpec = {
	type: "json_string_array";
	required?: boolean;
};

export type FieldSpec<TValues extends readonly string[] = readonly string[]> =
	| BooleanFieldSpec
	| StringFieldSpec
	| EnumFieldSpec<TValues>
	| TimezoneFieldSpec
	| IntegerFieldSpec
	| HourFieldSpec
	| JsonStringArrayFieldSpec;

export type FormSchema = Record<string, FieldSpec>;

type InferField<TSpec> = TSpec extends {
	type: "enum";
	values: infer V extends readonly string[];
}
	? V[number]
	: TSpec extends { type: "boolean" }
		? boolean
		: TSpec extends { type: "integer" }
			? number
			: TSpec extends { type: "timezone" }
				? string | null
				: TSpec extends { type: "hour" }
					? Hour
					: TSpec extends { type: "json_string_array" }
						? string[]
						: string;

type RequiredFields<TSchema extends FormSchema> = {
	[K in keyof TSchema as TSchema[K] extends { required: true }
		? K
		: never]: InferField<TSchema[K]>;
};

type OptionalFields<TSchema extends FormSchema> = {
	[K in keyof TSchema as TSchema[K] extends { required: true }
		? never
		: K]?: InferField<TSchema[K]>;
};

export type InferSchema<TSchema extends FormSchema> = RequiredFields<TSchema> &
	OptionalFields<TSchema>;

type ParseOutcome<TResult> =
	| {
			ok: true;
			data: TResult;
	  }
	| {
			ok: false;
			error: FormIssue;
			allErrors: FormIssue[];
	  };

export function parseWithSchema<TSchema extends FormSchema>(
	formData: FormData,
	schema: TSchema,
): ParseOutcome<InferSchema<TSchema>>;

export function parseWithSchema<TSchema extends FormSchema, TResult>(
	formData: FormData,
	schema: TSchema,
	transform: (data: InferSchema<TSchema>) => TResult,
): ParseOutcome<TResult>;

export function parseWithSchema<TSchema extends FormSchema, TResult>(
	formData: FormData,
	schema: TSchema,
	transform?: (data: InferSchema<TSchema>) => TResult,
): ParseOutcome<InferSchema<TSchema> | TResult> {
	const defaultTruthyValues = ["on", "true", "1"];
	const defaultFalsyValues = ["off", "false", "0"];
	const keys = Object.keys(schema) as readonly string[];
	const schemaKeySet = new Set(keys);

	const rawData: Record<string, string | null> = {};
	const seen = new Set<string>();
	const validationErrors: FormIssue[] = [];

	for (const key of keys) {
		rawData[key] = null;
	}

	for (const [key, value] of formData.entries()) {
		if (!schemaKeySet.has(key)) {
			continue;
		}

		if (seen.has(key)) {
			console.error("parseWithSchema rejected duplicate key", { key });
			validationErrors.push({
				reason: "duplicate_key",
				key,
			});
			continue;
		}

		if (typeof value !== "string") {
			const valueType = typeof value;
			console.error("parseWithSchema rejected non-string value", {
				key,
				valueType,
			});
			validationErrors.push({
				reason: "non_string_value",
				key,
				valueType,
			});
			continue;
		}

		rawData[key] = value;
		seen.add(key);
	}

	if (validationErrors.length > 0) {
		return {
			ok: false,
			error: validationErrors[0],
			allErrors: validationErrors,
		};
	}

	const errors: FormIssue[] = [];
	const output: Record<string, unknown> = {};

	for (const key of keys) {
		const spec = schema[key] as FieldSpec;
		const raw = rawData[key];

		if (raw === null) {
			if (spec.type === "boolean") {
				// HTML checkboxes submit no value when unchecked, which we treat as `false`
				// for optional boolean fields. Required booleans still enforce presence.
				if (spec.required) {
					errors.push({ reason: "missing_field", key });
				} else {
					output[key] = false;
				}
			} else if (spec.required) {
				errors.push({ reason: "missing_field", key });
			} else {
				output[key] = undefined;
			}
			continue;
		}

		switch (spec.type) {
			case "boolean": {
				const normalized = raw.trim().toLowerCase();
				const truthyValues =
					spec.truthyValues?.map((value) => value.trim().toLowerCase()) ??
					defaultTruthyValues;
				const falsyValues =
					spec.falsyValues?.map((value) => value.trim().toLowerCase()) ??
					defaultFalsyValues;

				if (normalized === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				if (truthyValues.includes(normalized)) {
					output[key] = true;
					break;
				}

				if (falsyValues.includes(normalized)) {
					output[key] = false;
					break;
				}

				errors.push({
					reason: "invalid_boolean",
					key,
					value: raw,
				});
				break;
			}
			case "string": {
				const trimmed = spec.trim ? raw.trim() : raw;
				if (spec.required && trimmed === "") {
					errors.push({ reason: "missing_field", key });
					break;
				}
				output[key] = trimmed;
				break;
			}
			case "hour": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				if (!/^\d+$/.test(trimmed)) {
					errors.push({
						reason: "invalid_hour",
						key,
						value: raw,
					});
					break;
				}

				const parsedValue = Number.parseInt(trimmed, 10);
				if (!Number.isInteger(parsedValue)) {
					errors.push({
						reason: "invalid_hour",
						key,
						value: raw,
					});
					break;
				}

				const min = typeof spec.min === "number" ? spec.min : 0;
				const max = typeof spec.max === "number" ? spec.max : 23;

				if (parsedValue < min) {
					errors.push({
						reason: "hour_below_min",
						key,
						min,
						value: parsedValue,
					});
					break;
				}

				if (parsedValue > max) {
					errors.push({
						reason: "hour_above_max",
						key,
						max,
						value: parsedValue,
					});
					break;
				}

				output[key] = parsedValue as Hour;
				break;
			}
			case "enum": {
				if (!spec.values.includes(raw)) {
					errors.push({ reason: "invalid_enum", key, values: spec.values });
					break;
				}
				output[key] = raw;
				break;
			}
			case "timezone": {
				const trimmed = raw.trim();
				if (spec.required && trimmed === "") {
					errors.push({ reason: "missing_field", key });
					break;
				}
				if (!spec.required && trimmed === "") {
					output[key] = null;
					break;
				}
				const result = validateTimezone(trimmed);
				if (!result.valid) {
					errors.push({
						reason: "invalid_timezone",
						key,
						message: result.reason ?? "Unsupported timezone provided.",
					});
					break;
				}
				output[key] = result.value;
				break;
			}
			case "integer": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				if (!/^-?\d+$/.test(trimmed)) {
					errors.push({
						reason: "invalid_integer",
						key,
						value: raw,
					});
					break;
				}

				const parsedValue = Number.parseInt(trimmed, 10);
				if (!Number.isInteger(parsedValue)) {
					errors.push({
						reason: "invalid_integer",
						key,
						value: raw,
					});
					break;
				}

				if (typeof spec.min === "number" && parsedValue < spec.min) {
					errors.push({
						reason: "integer_below_min",
						key,
						min: spec.min,
						value: parsedValue,
					});
					break;
				}

				if (typeof spec.max === "number" && parsedValue > spec.max) {
					errors.push({
						reason: "integer_above_max",
						key,
						max: spec.max,
						value: parsedValue,
					});
					break;
				}

				output[key] = parsedValue;
				break;
			}
			case "json_string_array": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				try {
					const parsedValue = JSON.parse(trimmed);

					if (!Array.isArray(parsedValue)) {
						errors.push({
							reason: "invalid_json_array",
							key,
							value: raw,
						});
						break;
					}

					if (!parsedValue.every((entry) => typeof entry === "string")) {
						errors.push({
							reason: "invalid_json_array_elements",
							key,
							value: raw,
						});
						break;
					}

					output[key] = parsedValue;
				} catch (error) {
					console.error("Failed to parse JSON string array field", {
						key,
						error,
					});
					errors.push({
						reason: "invalid_json_array",
						key,
						value: raw,
					});
				}

				break;
			}
			default: {
				output[key] = raw;
				break;
			}
		}
	}

	if (errors.length > 0) {
		return {
			ok: false,
			error: errors[0] ?? { reason: "form_error", key: "form" },
			allErrors: errors,
		};
	}

	const baseResult = output as InferSchema<TSchema>;
	const transformed = transform ? transform(baseResult) : baseResult;

	return {
		ok: true,
		data: transformed,
	};
}

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

export interface FormIssue {
	reason: string;
	key: string;
	[detail: string]: unknown;
}
