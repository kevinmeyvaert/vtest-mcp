import { describe, expect, it } from "vitest";
import { VtestResponseError } from "../src/errors.js";
import { parseBelgianNumber, parseResults } from "../src/parse-results.js";
import { loadFixture } from "./helpers.js";

const offers = parseResults(loadFixture("results-gent"));

describe("parseResults", () => {
	it("returns every available electricity and gas offer", () => {
		expect(offers.filter((o) => o.energyType === "electricity")).toHaveLength(
			122,
		);
		expect(offers.filter((o) => o.energyType === "gas")).toHaveLength(74);
	});

	it("skips grayed-out offers such as the social tariff", () => {
		expect(offers.some((o) => o.product === "Sociaal tarief")).toBe(false);
	});

	it("reads supplier, product, tariff and prices of an offer", () => {
		expect(offers.find((o) => o.contractId === "18861")).toEqual({
			energyType: "electricity",
			supplier: "EnergyVision",
			product: "Wikipower groepsaankoop 10-2026 - vast",
			tariffType: "fixed",
			greenType: "GREENLOCAL",
			yearlyPriceEur: 1182.35,
			monthlyPriceEur: 98.53,
			unitPriceCentPerKwh: 35.83,
			contractId: "18861",
		});
	});

	it("decodes HTML entities in supplier names", () => {
		expect(offers.some((o) => o.supplier === "OCTA+ ENERGIE")).toBe(true);
	});

	it("throws when the page has no results", () => {
		expect(() => parseResults("<html><title>Fout</title></html>")).toThrow(
			VtestResponseError,
		);
	});
});

describe("parseBelgianNumber", () => {
	it("treats dots as thousands separators and commas as decimals", () => {
		expect(parseBelgianNumber("1.182,35")).toBe(1182.35);
		expect(parseBelgianNumber("98,53")).toBe(98.53);
	});

	it("throws on text that is not a number", () => {
		expect(() => parseBelgianNumber("n/a")).toThrow(VtestResponseError);
	});
});
