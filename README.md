# ⚡ vtest-mcp

**Ask your AI agent for the cheapest energy contract in Flanders, using your real meter data.**

An [MCP](https://modelcontextprotocol.io) server for the official
[V-test®](https://www.vtest.be) of the Flemish energy regulator (VREG). Pair it with a tool
that already knows your usage (Home Assistant, Homey, a P1 meter app) and just ask:

> *"Find me the cheapest energy contract based on my Home Assistant data. I live in 9000 Gent."*

```text
Cheapest contracts for 9000 Gent:
Electricity:
1. EnergyVision – Wikipower groepsaankoop 10-2026 - vast (fixed): € 1.182,35/yr
2. Ecopower – Groene Burgerstroom (variable): € 1.251,29/yr
3. EnergyVision – Goedkope stroom met 1.800 kWh vast (variable): € 1.268,48/yr (€ 1.233,48 with first-year discount)
Gas:
1. Mega (handelsnaam van Power Online) – Groepsaankoop Wikipower FLEX DUAL (variable): € 1.527,94/yr
...
```

## How it works

```text
 You ──► Agent ──► Home Assistant MCP / P1 app   → yearly kWh, gas, injection, capacity peak
           │
           └─────► vtest-mcp ──► vtest.be        → ranked contracts, incl. VAT
```

This server does one thing: it turns usage numbers into the V-test ranking. Your agent
gets the numbers from whatever energy tools you already have connected.

## Install

Needs Node.js 20 or newer.

```bash
git clone https://github.com/kevinmeyvaert/vtest-mcp.git
cd vtest-mcp
npm install        # also builds dist/
```

### Claude Code

```bash
claude mcp add vtest -- node "$(pwd)/dist/index.js"
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`, then restart Claude:

```json
{
  "mcpServers": {
    "vtest": {
      "command": "node",
      "args": ["/absolute/path/to/vtest-mcp/dist/index.js"]
    }
  }
}
```

### Try it without an agent

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Pair it with Home Assistant

Enable Home Assistant's
[Model Context Protocol Server](https://www.home-assistant.io/integrations/mcp_server/)
integration and connect it to the same agent. Make sure the sensors you need are exposed
to Assist:

- **Grid usage**: P1 tariff 1 (day) and tariff 2 (night) energy sensors
- **Injection**: returned-energy sensors, if you have solar panels
- **Gas**: gas meter sensor
- **Capacity peak**: monthly peak sensor (optional)

The agent reads the last 12 months and passes the totals to `compare_energy_contracts`.

## Tool: `compare_energy_contracts`

| Input | Meaning |
|---|---|
| `postal_code` | Flemish postcode, e.g. `"9000"` |
| `municipality` | Only when a postcode covers several municipalities |
| `electricity.day_kwh` / `night_kwh` / `exclusive_night_kwh` | Yearly grid usage in kWh |
| `electricity.injection_day_kwh` / `injection_night_kwh` | Yearly energy returned to the grid (solar) |
| `electricity.capacity_peak_kw` | Average monthly peak (capacity tariff), optional |
| `electricity.inverter_kw`, `electricity.digital_meter` | Optional meter details |
| `gas.amount`, `gas.unit` | Yearly gas usage, `kWh` (default) or `m3` |
| `filters.tariff_type` | `fixed`, `variable` or `dynamic` |
| `filters.green_only` | Only green electricity (gas is never filtered) |
| `limit` | Contracts per list, default 10 |

**Returns** cheapest-first lists:

- `electricity` and `gas`: estimated yearly price incl. VAT, monthly price, c€/kWh,
  tariff type, green label, and `yearlyPriceWithDiscountEur` when there is a first-year
  discount.
- `injection` (only when you return energy to the grid): feed-in contracts. A negative
  price is what you earn.

The tool is read-only: it never signs you up for anything.

## Development

```bash
npm test          # unit tests against real captured V-test pages (test/fixtures)
npm run typecheck
npm run lint
npm run build
```

Built with the [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
(`@modelcontextprotocol/server`), zod and cheerio.

## Limits

- **Flanders only.** Brussels: [BRUSIM](https://www.brusim.be). Wallonia:
  [CompaCWaPE](https://www.compacwape.be).
- **No official API.** The V-test has no public API, so this server fills in the public
  form and reads the results page. A site redesign can break it; it then returns an
  error, never a guessed price.
- **Be gentle.** One request to vtest.be per tool call. Check VREG's terms of use before
  hosting this for other people.
- Prices are V-test estimates. Check the supplier before signing.

## Not affiliated

This is an independent project. V-test® is a service of VREG, the Flemish utility
regulator.
