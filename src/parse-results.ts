import * as cheerio from "cheerio";
import { VtestResponseError } from "./errors.js";

/** "injection" = feed-in contracts for energy returned to the grid; their prices are negative (earnings). */
export type EnergyType = "electricity" | "gas" | "injection";
export type TariffType = "fixed" | "variable" | "dynamic";

export type ContractOffer = {
	energyType: EnergyType;
	supplier: string;
	product: string;
	tariffType: TariffType;
	/** Raw V-test green label, e.g. "GREENLOCAL" or "NONE". */
	greenType: string;
	yearlyPriceEur: number;
	/** Yearly price including welcome/promo discounts; only set when it differs. */
	yearlyPriceWithDiscountEur?: number;
	monthlyPriceEur: number;
	unitPriceCentPerKwh: number;
	contractId: string;
};

const ENERGY_TYPES: Record<string, EnergyType> = {
	ELECTRICITY: "electricity",
	GAS: "gas",
	RETURN: "injection",
};

const TARIFF_TYPES: Record<string, TariffType> = {
	FIXED: "fixed",
	VARIABLE: "variable",
	DYNAMIC: "dynamic",
};

export function parseBelgianNumber(s: string): number {
	const n = Number(s.trim().replaceAll(".", "").replace(",", "."));
	if (s.trim() === "" || Number.isNaN(n)) {
		throw new VtestResponseError(
			`Unexpected number format on V-test page: "${s}"`,
		);
	}
	return n;
}

export function parseResults(html: string): ContractOffer[] {
	const $ = cheerio.load(html);
	const items = $("div.resultitem");
	if (items.length === 0) {
		throw new VtestResponseError(
			"The V-test page contained no contracts. The form may have been rejected or the site layout changed.",
		);
	}

	const offers: ContractOffer[] = [];
	items.each((_, el) => {
		const item = $(el);
		if (item.hasClass("grayedout")) return;

		const contractId = item.attr("data-contractid") ?? "";
		const energyType = ENERGY_TYPES[item.attr("data-contracttype") ?? ""];
		const tariffType = TARIFF_TYPES[item.attr("data-tarifftype") ?? ""];
		if (!energyType || !tariffType) {
			throw new VtestResponseError(
				`Unrecognised contract type for contract ${contractId}`,
			);
		}

		const priceIn = (cls: string) =>
			parseBelgianNumber(
				item
					.find(`.${cls} .resultitemprice-price`)
					.first()
					.attr("data-price") ?? "",
			);

		const yearlyPriceEur = parseBelgianNumber(item.attr("data-price") ?? "");
		const discounted = item.attr("data-discount");
		const yearlyPriceWithDiscountEur = discounted
			? parseBelgianNumber(discounted)
			: yearlyPriceEur;

		offers.push({
			energyType,
			supplier: item.find("#supplier-name").first().text().trim(),
			product: item.find(".productNameStyle").first().text().trim(),
			tariffType,
			greenType: item.attr("data-greentype") ?? "NONE",
			yearlyPriceEur,
			...(yearlyPriceWithDiscountEur !== yearlyPriceEur && {
				yearlyPriceWithDiscountEur,
			}),
			monthlyPriceEur: priceIn("monthprice"),
			unitPriceCentPerKwh: priceIn("unitprice"),
			contractId,
		});
	});
	return offers;
}
