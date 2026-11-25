import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { compareContracts, formatSummary } from "./compare.js";
import { usageSchema } from "./usage.js";
import { createVtestClient, type VtestClient } from "./vtest-client.js";

const offerSchema = z.object({
	energyType: z.enum(["electricity", "gas", "injection"]),
	supplier: z.string(),
	product: z.string(),
	tariffType: z.enum(["fixed", "variable", "dynamic"]),
	greenType: z.string(),
	yearlyPriceEur: z.number(),
	yearlyPriceWithDiscountEur: z.number().optional(),
	monthlyPriceEur: z.number(),
	unitPriceCentPerKwh: z.number(),
	contractId: z.string(),
});

const resultSchema = z.object({
	location: z.object({ postalCode: z.string(), municipality: z.string() }),
	electricity: z.array(offerSchema).optional(),
	gas: z.array(offerSchema).optional(),
	injection: z.array(offerSchema).optional(),
	source: z.string(),
	note: z.string(),
});

const DESCRIPTION = `Find the cheapest electricity and gas contracts for a home in Flanders (Belgium) using the official V-test of the Flemish energy regulator (VREG, vtest.be).

Before calling, gather yearly usage for the last 12 months from the user's energy tools (Home Assistant energy dashboard, Homey, a P1 meter app such as HomeWizard, or Fluvius data):
- electricity.day_kwh / night_kwh: energy taken from the grid. On a P1 meter, tariff 1 is day and tariff 2 is night. Single-rate meter: put everything in day_kwh.
- electricity.injection_day_kwh / injection_night_kwh: energy returned to the grid (solar panels).
- electricity.capacity_peak_kw: average of the monthly peaks over 12 months (capacity tariff), if available.
- gas.amount: yearly gas usage, in kWh (or m3 with unit "m3").
If you only have a shorter period, scale it to a year and tell the user. Ask the user for their postcode if you don't know it.

Returns contracts sorted from cheapest to most expensive yearly price, incl. VAT, ranked like the V-test on the regular price; yearlyPriceWithDiscountEur shows the first-year price with welcome discounts when there is one. Homes that inject also get "injection": feed-in contracts where a negative price is what the user earns; suppliers often require their electricity and feed-in contract together, so compare totals per supplier. Brussels and Wallonia are not covered.`;

export function createServer(
	client: VtestClient = createVtestClient(),
): McpServer {
	const server = new McpServer(
		{ name: "vtest-mcp", version: "0.1.0" },
		{ capabilities: { tools: {} } },
	);

	server.registerTool(
		"compare_energy_contracts",
		{
			title: "Compare Flemish energy contracts (V-test)",
			description: DESCRIPTION,
			inputSchema: usageSchema,
			outputSchema: resultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (usage) => {
			try {
				const result = await compareContracts(usage, client);
				return {
					content: [{ type: "text", text: formatSummary(result) }],
					structuredContent: result,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: message }], isError: true };
			}
		},
	);

	return server;
}
