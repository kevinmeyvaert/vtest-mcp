import { describe, expect, it } from "vitest";
import { VtestResponseError } from "../src/errors.js";
import { type UsageInput, usageSchema } from "../src/usage.js";
import { buildForm, createVtestClient } from "../src/vtest-client.js";
import { loadFixture } from "./helpers.js";

const GENT_ID = "7623";
const usage = (input: unknown): UsageInput => usageSchema.parse(input);
const field = (form: FormData, name: string) => form.get(name);

describe("usageSchema", () => {
	it("accepts a postcode sent as a number", () => {
		expect(usage({ postal_code: 9000, gas: { amount: 1 } }).postal_code).toBe(
			"9000",
		);
	});

	it("requires electricity or gas", () => {
		expect(() => usage({ postal_code: "9000" })).toThrow(
			/electricity and\/or gas/,
		);
	});
});

describe("buildForm", () => {
	it("maps day/night electricity and gas usage to V-test fields", () => {
		const form = buildForm(
			usage({
				postal_code: "9000",
				electricity: { day_kwh: 1800, night_kwh: 1500 },
				gas: { amount: 12000 },
			}),
			GENT_ID,
			"tok",
		);
		expect(field(form, "__RequestVerificationToken")).toBe("tok");
		expect(field(form, "PostalCode")).toBe(GENT_ID);
		expect(field(form, "UserConsumption")).toBe("2");
		expect(field(form, "EnergyTypeElectricity")).toBe("true");
		expect(field(form, "EnergyTypeGas")).toBe("true");
		expect(field(form, "UsageDay")).toBe("1800");
		expect(field(form, "UsageNight")).toBe("1500");
		expect(field(form, "HasNightMeter")).toBe("true");
		expect(field(form, "HasExclusiveNight")).toBe("false");
		expect(field(form, "UsageGas")).toBe("12000");
		expect(field(form, "GasMeterUnit")).toBe("1");
		expect(field(form, "HasSolarPanels")).toBe("false");
		expect(field(form, "ZipCodeBaarleHertog")).toBe("6999");
	});

	it("leaves gas out of an electricity-only request", () => {
		const form = buildForm(
			usage({ postal_code: "9000", electricity: { day_kwh: 3000 } }),
			GENT_ID,
			"tok",
		);
		expect(field(form, "EnergyTypeGas")).toBe("false");
		expect(form.has("UsageGas")).toBe(false);
		expect(field(form, "HasNightMeter")).toBe("false");
	});

	it("rounds fractional kWh from meter readings", () => {
		const form = buildForm(
			usage({ postal_code: "9000", electricity: { day_kwh: 1800.6 } }),
			GENT_ID,
			"tok",
		);
		expect(field(form, "UsageDay")).toBe("1801");
	});

	it("uses unit 2 for gas in cubic metres", () => {
		const form = buildForm(
			usage({ postal_code: "9000", gas: { amount: 1200, unit: "m3" } }),
			GENT_ID,
			"tok",
		);
		expect(field(form, "GasMeterUnit")).toBe("2");
		expect(field(form, "EnergyTypeElectricity")).toBe("false");
	});

	it("still sends the required meter fields for a gas-only request", () => {
		const form = buildForm(
			usage({ postal_code: "9000", gas: { amount: 12000 } }),
			GENT_ID,
			"tok",
		);
		expect(field(form, "HasDigitalMeter")).toBe("true");
		expect(field(form, "HasNightMeter")).toBe("false");
		expect(field(form, "HasExclusiveNight")).toBe("false");
	});

	it("sends solar injection, inverter power and capacity peak with comma decimals", () => {
		const form = buildForm(
			usage({
				postal_code: "9000",
				electricity: {
					day_kwh: 2500,
					injection_day_kwh: 1800,
					injection_night_kwh: 200,
					inverter_kw: 5.5,
					capacity_peak_kw: 4.2,
				},
			}),
			GENT_ID,
			"tok",
		);
		expect(field(form, "HasSolarPanels")).toBe("true");
		expect(field(form, "InjectionDay")).toBe("1800");
		expect(field(form, "InjectionNight")).toBe("200");
		expect(field(form, "KnowsInverterPower")).toBe("true");
		expect(field(form, "InverterPower")).toBe("5,5");
		expect(field(form, "KnowsCapacityElectricity")).toBe("true");
		expect(field(form, "CapacityElectricity")).toBe("4,2");
	});
});

type Call = { url: string; init?: RequestInit };

function fakeFetch(postStatus = 200) {
	const calls: Call[] = [];
	const fn = (async (url: string | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		if (init?.method === "POST") {
			return new Response(
				postStatus === 200
					? loadFixture("results-gent")
					: "<title>Fout</title>",
				{
					status: postStatus,
				},
			);
		}
		return new Response(loadFixture("home"), {
			status: 200,
			headers: {
				"set-cookie": ".AspNetCore.Antiforgery.x=abc; path=/; httponly",
			},
		});
	}) as typeof fetch;
	return { fn, calls };
}

describe("createVtestClient", () => {
	const gentUsage = usage({
		postal_code: "9000",
		electricity: { day_kwh: 1800, night_kwh: 1500 },
		gas: { amount: 12000 },
	});

	it("posts the form with the session cookie and returns parsed offers", async () => {
		const { fn, calls } = fakeFetch();
		const offers = await createVtestClient(fn).compare(gentUsage, GENT_ID);

		expect(offers).toHaveLength(196);
		const post = calls.find((c) => c.init?.method === "POST");
		const headers = new Headers(post?.init?.headers);
		expect(headers.get("cookie")).toBe(".AspNetCore.Antiforgery.x=abc");
		const body = post?.init?.body as FormData;
		expect(body.get("__RequestVerificationToken")).toMatch(/^CfDJ8/);
		expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
	});

	it("reads postal codes from the home page", async () => {
		const { fn } = fakeFetch();
		expect(await createVtestClient(fn).getPostalCodes()).toHaveLength(1144);
	});

	it("passes a timeout signal to every request", async () => {
		const { fn, calls } = fakeFetch();
		await createVtestClient(fn).compare(gentUsage, GENT_ID);
		expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(
			true,
		);
	});

	it("reports an unreachable V-test as a VtestResponseError", async () => {
		const failing = (async () => {
			throw new TypeError("fetch failed");
		}) as typeof fetch;
		await expect(
			createVtestClient(failing).compare(gentUsage, GENT_ID),
		).rejects.toThrow(/Could not reach vtest.be: fetch failed/);
	});

	it("rejects a non-200 response from the V-test", async () => {
		const { fn } = fakeFetch(500);
		await expect(
			createVtestClient(fn).compare(gentUsage, GENT_ID),
		).rejects.toThrow(VtestResponseError);
		await expect(
			createVtestClient(fn).compare(gentUsage, GENT_ID),
		).rejects.toThrow(/HTTP 500/);
	});
});
