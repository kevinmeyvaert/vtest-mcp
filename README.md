# vtest-mcp

MCP server that finds the cheapest electricity and gas contracts in Flanders, using the
official [V-test](https://www.vtest.be) of the Flemish energy regulator (VREG).

Pair it with a tool that knows your usage (the Home Assistant MCP server, Homey, a P1
meter app) and ask:

> Find me the cheapest energy contract based on my Home Assistant data. I live in 9000 Gent.

The agent reads your yearly usage, calls `compare_energy_contracts`, and gets the V-test
ranking back.

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
| `filters.tariff_type`, `filters.green_only` | `fixed` / `variable` / `dynamic`; green label only |
| `limit` | Contracts per list, default 10 |

Returns cheapest-first `electricity`, `gas`, and (for homes that inject) `injection`
feed-in contracts, where a negative price is what you earn. All prices are estimated
yearly amounts incl. VAT.

## Run locally

```bash
npm install
npm run build
```

**Claude Code:**

```bash
claude mcp add vtest -- node /absolute/path/to/vtest-mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vtest": { "command": "node", "args": ["/absolute/path/to/vtest-mcp/dist/index.js"] }
  }
}
```

**MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Development

```bash
npm test          # unit tests against captured V-test pages in test/fixtures
npm run typecheck
npm run lint
```

## Limits

- Flanders only. Brussels: [BRUSIM](https://www.brusim.be). Wallonia: [CompaCWaPE](https://www.compacwape.be).
- The V-test has no public API. This server fills in the public form and reads the
  results page, so a site redesign can break it. Errors are reported, never guessed.
- One request to vtest.be per tool call. Check VREG's terms of use before hosting this
  for other people.
