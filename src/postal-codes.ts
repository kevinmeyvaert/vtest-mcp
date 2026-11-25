import * as cheerio from "cheerio";
import { BRUSIM_URL, COMPACWAPE_URL } from "./consts.js";
import { VtestInputError } from "./errors.js";

export type PostalCodeOption = {
	id: string;
	postalCode: string;
	municipality: string;
};

const OPTION_LABEL = /^(\d{4})\s*-\s*(.+)$/;

export function parsePostalCodes(homeHtml: string): PostalCodeOption[] {
	const $ = cheerio.load(homeHtml);
	const options: PostalCodeOption[] = [];
	$("option").each((_, el) => {
		const id = $(el).attr("value")?.trim();
		const match = OPTION_LABEL.exec($(el).text().trim());
		if (id && match) {
			options.push({ id, postalCode: match[1], municipality: match[2].trim() });
		}
	});
	return options;
}

function outsideFlandersMessage(postalCode: string): string | undefined {
	const code = Number(postalCode);
	if (code >= 1000 && code <= 1299) {
		return `${postalCode} is in Brussels. The V-test only covers Flanders; use BRUSIM (${BRUSIM_URL}).`;
	}
	if ((code >= 1300 && code <= 1499) || (code >= 4000 && code <= 7999)) {
		return `${postalCode} is in Wallonia. The V-test only covers Flanders; use CompaCWaPE (${COMPACWAPE_URL}).`;
	}
	return undefined;
}

export function resolvePostalCode(
	options: PostalCodeOption[],
	postalCode: string,
	municipality?: string,
): PostalCodeOption {
	const matches = options.filter((o) => o.postalCode === postalCode);
	if (matches.length === 0) {
		throw new VtestInputError(
			outsideFlandersMessage(postalCode) ??
				`Unknown postcode ${postalCode}. The V-test only covers Flemish postcodes.`,
		);
	}

	const names = matches.map((o) => o.municipality).join(", ");
	if (municipality) {
		const wanted = municipality.trim().toLowerCase();
		const found = matches.find((o) => o.municipality.toLowerCase() === wanted);
		if (!found) {
			throw new VtestInputError(
				`Municipality "${municipality}" not found for ${postalCode}. Choose one of: ${names}.`,
			);
		}
		return found;
	}

	if (matches.length > 1) {
		throw new VtestInputError(
			`Postcode ${postalCode} covers several municipalities. Pass "municipality" as one of: ${names}.`,
		);
	}
	return matches[0];
}
