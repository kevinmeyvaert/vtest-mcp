import * as cheerio from "cheerio";
import { REQUEST_TIMEOUT_MS, USER_AGENT, VTEST_BASE_URL } from "./consts.js";
import { VtestResponseError } from "./errors.js";
import { type ContractOffer, parseResults } from "./parse-results.js";
import { type PostalCodeOption, parsePostalCodes } from "./postal-codes.js";
import type { UsageInput } from "./usage.js";

export type VtestClient = {
	getPostalCodes(): Promise<PostalCodeOption[]>;
	compare(usage: UsageInput, postalCodeId: string): Promise<ContractOffer[]>;
};

/** Hidden and default fields the V-test form needs; leaving any out returns HTTP 500. */
const FIXED_FIELDS: Record<string, string> = {
	PropertyType: "1",
	UserConsumption: "2",
	IsFromIndexPage: "True",
	CreateLocation: "False",
	ShowModalCreateProfile: "False",
	IsFromLandingPage: "False",
	LocationCoupledToFluvius: "False",
	ZipCodeBaarleHertog: "6999",
	NumberOfResidents: "3",
	UnknownMeterType: "2",
	UnknownMeterCounting: "1",
	SelectedMeterType: "1",
	periodOptionsElek: "false",
	periodOptionsGas: "false",
	periodOptionsReturn: "false",
};

const bool = (b: boolean) => String(b);
const int = (n: number) => String(Math.round(n));
const decimal = (n: number) => String(n).replace(".", ",");

export function buildForm(
	usage: UsageInput,
	postalCodeId: string,
	token: string,
): FormData {
	const form = new FormData();
	form.set("__RequestVerificationToken", token);
	form.set("PostalCode", postalCodeId);
	for (const [name, value] of Object.entries(FIXED_FIELDS))
		form.set(name, value);

	const { electricity: el, gas } = usage;
	form.set("EnergyTypeElectricity", bool(!!el));
	form.set("EnergyTypeGas", bool(!!gas));

	if (el) {
		const injects = el.injection_day_kwh > 0 || el.injection_night_kwh > 0;
		form.set("HasDigitalMeter", bool(el.digital_meter));
		form.set("HasNightMeter", bool(el.night_kwh > 0));
		form.set("HasExclusiveNight", bool(el.exclusive_night_kwh > 0));
		form.set("UsageDay", int(el.day_kwh));
		form.set("UsageNight", int(el.night_kwh));
		form.set("UsageExclusiveNight", int(el.exclusive_night_kwh));
		form.set("HasSolarPanels", bool(injects));
		if (injects) {
			form.set("InjectionDay", int(el.injection_day_kwh));
			form.set("InjectionNight", int(el.injection_night_kwh));
		}
		form.set("KnowsInverterPower", bool(el.inverter_kw !== undefined));
		if (el.inverter_kw !== undefined)
			form.set("InverterPower", decimal(el.inverter_kw));
		form.set(
			"KnowsCapacityElectricity",
			bool(el.capacity_peak_kw !== undefined),
		);
		if (el.capacity_peak_kw !== undefined) {
			form.set("CapacityElectricity", decimal(el.capacity_peak_kw));
		}
	} else {
		form.set("HasDigitalMeter", "true");
		form.set("HasNightMeter", "false");
		form.set("HasExclusiveNight", "false");
		form.set("HasSolarPanels", "false");
		form.set("KnowsInverterPower", "false");
		form.set("KnowsCapacityElectricity", "false");
	}

	if (gas) {
		form.set("UsageGas", int(gas.amount));
		form.set("GasMeterUnit", gas.unit === "m3" ? "2" : "1");
	}
	return form;
}

type Session = { html: string; cookie: string; token: string };

export function createVtestClient(fetchFn: typeof fetch = fetch): VtestClient {
	let postalCodes: Promise<PostalCodeOption[]> | undefined;

	/** One request to vtest.be, with a timeout; body is read inside so a stalled body also times out. */
	async function request(
		init: RequestInit = {},
	): Promise<{ html: string; headers: Headers }> {
		let res: Response;
		let html: string;
		try {
			res = await fetchFn(`${VTEST_BASE_URL}/`, {
				...init,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			html = await res.text();
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new VtestResponseError(`Could not reach vtest.be: ${reason}`);
		}
		if (!res.ok)
			throw new VtestResponseError(`V-test returned HTTP ${res.status}`);
		return { html, headers: res.headers };
	}

	async function openSession(): Promise<Session> {
		const { html, headers } = await request({
			headers: { "User-Agent": USER_AGENT },
		});
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
		const token = cheerio
			.load(html)("input[name=__RequestVerificationToken]")
			.first()
			.attr("value");
		if (!token) {
			throw new VtestResponseError(
				"V-test page had no form token; the site layout may have changed.",
			);
		}
		return { html, cookie, token };
	}

	return {
		getPostalCodes() {
			postalCodes ??= openSession().then((s) => parsePostalCodes(s.html));
			postalCodes.catch(() => {
				postalCodes = undefined;
			});
			return postalCodes;
		},

		async compare(usage, postalCodeId) {
			const session = await openSession();
			const { html } = await request({
				method: "POST",
				headers: {
					"User-Agent": USER_AGENT,
					Cookie: session.cookie,
					Referer: `${VTEST_BASE_URL}/`,
				},
				body: buildForm(usage, postalCodeId, session.token),
			});
			return parseResults(html);
		},
	};
}
