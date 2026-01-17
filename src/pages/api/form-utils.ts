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
	 * Accepted truthy string values.
	 * Defaults to ["on", "true", "1"].
	 */
	truthyValues?: readonly string[];
	/**
	 * Accepted falsy string values.
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

type NumberFieldSpec = {
	type: "number";
	required?: boolean;
	min?: number;
	max?: number;
};

type TimeFieldSpec = {
	type: "time";
	required?: boolean;
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
	| NumberFieldSpec
	| TimeFieldSpec
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
			: TSpec extends { type: "number" }
				? number
				: TSpec extends { type: "timezone" }
					? string | null
					: TSpec extends { type: "time" }
						? number
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
				const truthyValues = spec.truthyValues ?? defaultTruthyValues;
				const falsyValues = spec.falsyValues ?? defaultFalsyValues;

				if (raw === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				if (truthyValues.includes(raw)) {
					output[key] = true;
					break;
				}

				if (falsyValues.includes(raw)) {
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
				const trimmed = spec.trim !== false ? raw.trim() : raw;
				if (trimmed === "" && spec.required) {
					errors.push({ reason: "missing_field", key });
					break;
				}
				if (trimmed === "" && !spec.required) {
					output[key] = undefined;
					break;
				}
				output[key] = trimmed;
				break;
			}
			case "time": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
				if (!timePattern.test(trimmed)) {
					errors.push({
						reason: "invalid_time",
						key,
						value: raw,
					});
					break;
				}

				const [hoursStr, minutesStr] = trimmed.split(":");
				const hours = Number.parseInt(hoursStr, 10);
				const minutes = Number.parseInt(minutesStr, 10);
				const totalMinutes = hours * 60 + minutes;

				output[key] = totalMinutes;
				break;
			}
			case "enum": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}
				if (!spec.values.includes(trimmed)) {
					errors.push({ reason: "invalid_enum", key, values: spec.values });
					break;
				}
				output[key] = trimmed;
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
				output[key] = trimmed;
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
			case "number": {
				const trimmed = raw.trim();
				if (trimmed === "") {
					if (spec.required) {
						errors.push({ reason: "missing_field", key });
					} else {
						output[key] = undefined;
					}
					break;
				}

				const parsedValue = Number.parseFloat(trimmed);
				if (Number.isNaN(parsedValue)) {
					errors.push({
						reason: "invalid_number",
						key,
						value: raw,
					});
					break;
				}

				if (typeof spec.min === "number" && parsedValue < spec.min) {
					errors.push({
						reason: "number_below_min",
						key,
						min: spec.min,
						value: parsedValue,
					});
					break;
				}

				if (typeof spec.max === "number" && parsedValue > spec.max) {
					errors.push({
						reason: "number_above_max",
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
				console.error(`Unexpected field type for key "${key}":`, spec);
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

/* =============
Redirect helper
============= */

export function redirect(url: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: { Location: url },
	});
}
