import { coerceValue, readRawSchemaData } from "./coercion";
import type {
	FieldSpec,
	FormIssue,
	FormSchema,
	InferSchema,
	ParseOutcome,
} from "./schema";

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
	const { keys, rawData, validationErrors } = readRawSchemaData(
		formData,
		schema,
	);

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

		if (raw === "" && spec.required) {
			errors.push({ reason: "missing_field", key });
			continue;
		}

		const { value, error } = coerceValue(spec, raw);
		if (error) {
			errors.push({ ...error, key });
			continue;
		}

		output[key] = value;
	}

	if (errors.length > 0) {
		return {
			ok: false,
			error: errors[0],
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
