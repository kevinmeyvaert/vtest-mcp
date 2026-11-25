import { describe, expect, it } from "vitest";
import { parsePostalCodes, resolvePostalCode } from "../src/postal-codes.js";
import { loadFixture } from "./helpers.js";

const options = parsePostalCodes(loadFixture("home"));

describe("parsePostalCodes", () => {
	it("reads every Flemish postcode option from the home page", () => {
		expect(options).toHaveLength(1144);
	});
});

describe("resolvePostalCode", () => {
	it("maps a unique postcode to its V-test id", () => {
		expect(resolvePostalCode(options, "9000")).toEqual({
			id: "7623",
			postalCode: "9000",
			municipality: "Gent",
		});
	});

	it("picks the municipality case-insensitively when a postcode is shared", () => {
		expect(resolvePostalCode(options, "1570", "tollembeek").id).toBe("9702");
	});

	it("lists the municipalities when a shared postcode is ambiguous", () => {
		expect(() => resolvePostalCode(options, "1570")).toThrow(
			/Galmaarden.*Tollembeek.*Vollezele/,
		);
	});

	it("points Brussels postcodes to BRUSIM", () => {
		expect(() => resolvePostalCode(options, "1000")).toThrow(/BRUSIM/);
	});

	it("points Walloon postcodes to CompaCWaPE", () => {
		expect(() => resolvePostalCode(options, "4000")).toThrow(/CompaCWaPE/);
		expect(() => resolvePostalCode(options, "1300")).toThrow(/CompaCWaPE/);
	});

	it("rejects an unknown municipality for a known postcode", () => {
		expect(() => resolvePostalCode(options, "9000", "Brugge")).toThrow(/Gent/);
	});
});
