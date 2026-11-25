import { describe, expect, it } from "vitest";
import { compareContracts, formatSummary } from "../src/compare.js";
import { VtestInputError } from "../src/errors.js";
import { parseResults } from "../src/parse-results.js";
import { parsePostalCodes } from "../src/postal-codes.js";
import { usageSchema } from "../src/usage.js";
import type { VtestClient } from "../src/vtest-client.js";
import { loadFixture } from "./helpers.js";

const postalCodes = parsePostalCodes(loadFixture("home"));
const offers = parseResults(loadFixture("results-gent"));

function fakeClient() {
	const compareCalls: string[] = [];
	const client: VtestClient = {
		getPostalCodes: async () => postalCodes,
		compare: async (_usage, postalCodeId) => {
			compareCalls.push(postalCodeId);
			return offers;
		},
	};
	return { client, compareCalls };
}

const gent = (extra: object = {}) =>
	usageSchema.parse({
		postal_code: "9000",
		electricity: { day_kwh: 1800, night_kwh: 1500 },
		gas: { amount: 12000 },
		...extra,
	});

describe("compareContracts", () => {
	it("returns the cheapest electricity and gas contracts first", async () => {
		const { client, compareCalls } = fakeClient();
		const result = await compareContracts(gent(), client);

		expect(compareCalls).toEqual(["7623"]);
		expect(result.location).toEqual({
			postalCode: "9000",
			municipality: "Gent",
		});
		expect(result.electricity?.[0].contractId).toBe("18861");
		expect(result.gas?.[0].product).toBe("Groepsaankoop Wikipower FLEX DUAL");
		expect(result.electricity).toHaveLength(10);
		expect(result.gas).toHaveLength(10);
		const prices = result.electricity?.map((o) => o.yearlyPriceEur) ?? [];
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
	});

	it("filters on tariff type", async () => {
		const result = await compareContracts(
			gent({ filters: { tariff_type: "dynamic" } }),
			fakeClient().client,
		);
		expect(result.electricity?.[0].supplier).toBe("SPARKI");
		expect(result.electricity?.every((o) => o.tariffType === "dynamic")).toBe(
			true,
		);
	});

	it("keeps only green contracts when asked", async () => {
		const result = await compareContracts(
			gent({ filters: { green_only: true } }),
			fakeClient().client,
		);
		expect(result.electricity?.length).toBeGreaterThan(0);
		expect(result.electricity?.every((o) => o.greenType !== "NONE")).toBe(true);
	});

	it("respects the limit", async () => {
		const result = await compareContracts(
			gent({ limit: 3 }),
			fakeClient().client,
		);
		expect(result.electricity).toHaveLength(3);
	});

	it("leaves out gas when only electricity was asked", async () => {
		const usage = usageSchema.parse({
			postal_code: "9000",
			electricity: { day_kwh: 3000 },
		});
		const result = await compareContracts(usage, fakeClient().client);
		expect(result.gas).toBeUndefined();
		expect(result.electricity?.length).toBe(10);
	});

	it("rejects an ambiguous postcode without calling the V-test", async () => {
		const { client, compareCalls } = fakeClient();
		await expect(
			compareContracts(gent({ postal_code: "1570" }), client),
		).rejects.toThrow(VtestInputError);
		expect(compareCalls).toEqual([]);
	});
});

describe("compareContracts with solar injection", () => {
	const solarOffers = parseResults(loadFixture("results-leuven-solar"));
	const client: VtestClient = {
		getPostalCodes: async () => postalCodes,
		compare: async () => solarOffers,
	};
	const solarUsage = (electricity: object) =>
		usageSchema.parse({
			postal_code: "3000",
			electricity: { day_kwh: 2500, ...electricity },
		});

	it("lists feed-in contracts, highest earnings first, when the home injects", async () => {
		const result = await compareContracts(
			solarUsage({ injection_day_kwh: 2000 }),
			client,
		);
		expect(result.injection?.[0]).toMatchObject({
			contractId: "18801",
			yearlyPriceEur: -195.74,
		});
		expect(result.injection).toHaveLength(10);
	});

	it("leaves out feed-in contracts when the home does not inject", async () => {
		const result = await compareContracts(solarUsage({}), client);
		expect(result.injection).toBeUndefined();
	});
});

describe("formatSummary", () => {
	it("lists the top offers per energy type with Belgian euro formatting", async () => {
		const summary = formatSummary(
			await compareContracts(gent(), fakeClient().client),
		);
		expect(summary).toContain(
			"EnergyVision – Wikipower groepsaankoop 10-2026 - vast (fixed): € 1.182,35/yr",
		);
		expect(summary).toContain("Gas");
	});
});
