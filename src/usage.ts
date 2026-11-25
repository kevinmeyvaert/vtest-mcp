import { z } from "zod";
import { DEFAULT_LIMIT } from "./consts.js";

const kwh = (max: number) => z.number().min(0).max(max);

const electricitySchema = z.object({
	day_kwh: kwh(100_000).describe(
		"Yearly electricity taken from the grid, in kWh. With a day/night meter: the day (peak) register only. P1 meters: tariff 1.",
	),
	night_kwh: kwh(100_000)
		.default(0)
		.describe(
			"Yearly night/weekend (off-peak) usage in kWh. P1 meters: tariff 2. 0 for a single-rate meter.",
		),
	exclusive_night_kwh: kwh(100_000)
		.default(0)
		.describe(
			"Yearly usage on an exclusive-night meter (e.g. storage heating), in kWh. Usually 0.",
		),
	digital_meter: z
		.boolean()
		.default(true)
		.describe("True for a digital (smart) meter, false for an analog meter."),
	injection_day_kwh: kwh(12_000)
		.default(0)
		.describe(
			"Yearly electricity returned to the grid during day hours, in kWh (solar panels).",
		),
	injection_night_kwh: kwh(12_000)
		.default(0)
		.describe(
			"Yearly electricity returned to the grid during night hours, in kWh.",
		),
	inverter_kw: z
		.number()
		.positive()
		.optional()
		.describe("Solar inverter power in kW, if known."),
	capacity_peak_kw: z
		.number()
		.positive()
		.optional()
		.describe(
			"Average monthly peak over the last 12 months in kW (Fluvius capacity tariff), if known.",
		),
});

const gasSchema = z.object({
	amount: z.number().min(0).describe("Yearly gas usage."),
	unit: z
		.enum(["kWh", "m3"])
		.default("kWh")
		.describe("Unit of amount. Prefer kWh."),
});

const filtersSchema = z.object({
	tariff_type: z
		.enum(["fixed", "variable", "dynamic"])
		.optional()
		.describe("Only return contracts with this price type."),
	green_only: z
		.boolean()
		.default(false)
		.describe("Only return contracts with a green-energy label."),
});

export const usageSchema = z
	.object({
		postal_code: z.coerce
			.string()
			.regex(/^\d{4}$/, "Use a 4-digit Belgian postcode")
			.describe("Belgian postcode of the delivery address. Flanders only."),
		municipality: z
			.string()
			.optional()
			.describe(
				"Municipality name. Only needed when the postcode covers several municipalities.",
			),
		electricity: electricitySchema
			.optional()
			.describe("Omit to compare gas only."),
		gas: gasSchema.optional().describe("Omit to compare electricity only."),
		filters: filtersSchema.optional(),
		limit: z
			.number()
			.int()
			.min(1)
			.max(50)
			.default(DEFAULT_LIMIT)
			.describe("Maximum contracts to return per energy type."),
	})
	.refine(
		(u) => u.electricity || u.gas,
		"Provide electricity and/or gas usage",
	);

export type UsageInput = z.infer<typeof usageSchema>;
