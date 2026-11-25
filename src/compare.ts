import { VTEST_BASE_URL } from "./consts.js";
import type { ContractOffer, EnergyType } from "./parse-results.js";
import { resolvePostalCode } from "./postal-codes.js";
import type { UsageInput } from "./usage.js";
import type { VtestClient } from "./vtest-client.js";

export type CompareResult = {
	location: { postalCode: string; municipality: string };
	electricity?: ContractOffer[];
	gas?: ContractOffer[];
	/** Feed-in contracts; negative yearly price = what you earn. */
	injection?: ContractOffer[];
	source: typeof VTEST_BASE_URL;
	note: string;
};

const NOTE =
	"Estimated yearly prices incl. VAT from the V-test (VREG). Check the supplier before signing.";

function rank(
	offers: ContractOffer[],
	energyType: EnergyType,
	usage: UsageInput,
): ContractOffer[] {
	const { tariff_type, green_only } = usage.filters ?? {};
	return offers
		.filter((o) => o.energyType === energyType)
		.filter((o) => !tariff_type || o.tariffType === tariff_type)
		.filter(
			(o) => !green_only || o.energyType === "gas" || o.greenType !== "NONE",
		)
		.sort((a, b) => a.yearlyPriceEur - b.yearlyPriceEur)
		.slice(0, usage.limit);
}

const injects = (usage: UsageInput) =>
	!!usage.electricity &&
	usage.electricity.injection_day_kwh + usage.electricity.injection_night_kwh >
		0;

export async function compareContracts(
	usage: UsageInput,
	client: VtestClient,
): Promise<CompareResult> {
	const location = resolvePostalCode(
		await client.getPostalCodes(),
		usage.postal_code,
		usage.municipality,
	);
	const offers = await client.compare(usage, location.id);

	return {
		location: {
			postalCode: location.postalCode,
			municipality: location.municipality,
		},
		...(usage.electricity && {
			electricity: rank(offers, "electricity", usage),
		}),
		...(usage.gas && { gas: rank(offers, "gas", usage) }),
		...(injects(usage) && { injection: rank(offers, "injection", usage) }),
		source: VTEST_BASE_URL,
		note: NOTE,
	};
}

const euro = new Intl.NumberFormat("nl-BE", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

function section(title: string, offers: ContractOffer[] | undefined): string[] {
	if (!offers) return [];
	if (offers.length === 0) return [`${title}: no contracts match the filters.`];
	return [
		`${title}:`,
		...offers
			.slice(0, 3)
			.map(
				(o, i) =>
					`${i + 1}. ${o.supplier} – ${o.product} (${o.tariffType}): € ${euro.format(o.yearlyPriceEur)}/yr` +
					(o.yearlyPriceWithDiscountEur === undefined
						? ""
						: ` (€ ${euro.format(o.yearlyPriceWithDiscountEur)} with first-year discount)`),
			),
	];
}

export function formatSummary(result: CompareResult): string {
	return [
		`Cheapest contracts for ${result.location.postalCode} ${result.location.municipality}:`,
		...section("Electricity", result.electricity),
		...section("Gas", result.gas),
		...section(
			"Feed-in for solar injection (negative = you earn)",
			result.injection,
		),
		result.note,
	].join("\n");
}
