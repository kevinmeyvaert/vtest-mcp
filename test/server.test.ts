import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { parseResults } from "../src/parse-results.js";
import { parsePostalCodes } from "../src/postal-codes.js";
import { createServer } from "../src/server.js";
import type { VtestClient } from "../src/vtest-client.js";
import { loadFixture } from "./helpers.js";

const fakeVtest: VtestClient = {
	getPostalCodes: async () => parsePostalCodes(loadFixture("home")),
	compare: async () => parseResults(loadFixture("results-gent")),
};

async function connect() {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await createServer(fakeVtest).connect(serverTransport);
	const client = new Client({ name: "test", version: "0.0.0" });
	await client.connect(clientTransport);
	return client;
}

describe("MCP server", () => {
	it("lists compare_energy_contracts as a read-only tool", async () => {
		const client = await connect();
		const { tools } = await client.listTools();
		const tool = tools.find((t) => t.name === "compare_energy_contracts");
		expect(tool?.annotations).toMatchObject({
			readOnlyHint: true,
			destructiveHint: false,
		});
		expect(tool?.inputSchema.properties).toHaveProperty("postal_code");
	});

	it("returns structured contracts and a text summary", async () => {
		const client = await connect();
		const result = await client.callTool({
			name: "compare_energy_contracts",
			arguments: {
				postal_code: "9000",
				electricity: { day_kwh: 1800, night_kwh: 1500 },
				gas: { amount: 12000 },
			},
		});
		expect(result.isError).toBeFalsy();
		const structured = result.structuredContent as {
			electricity: { contractId: string }[];
		};
		expect(structured.electricity[0].contractId).toBe("18861");
		expect(result.content).toContainEqual(
			expect.objectContaining({ type: "text" }),
		);
	});

	it("reports input problems as a tool error the agent can act on", async () => {
		const client = await connect();
		const result = await client.callTool({
			name: "compare_energy_contracts",
			arguments: { postal_code: "1570", electricity: { day_kwh: 1800 } },
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toMatch(/Galmaarden/);
	});
});
