# V-test MCP server: design

## Intent
Let any agent answer "find me the cheapest energy contract". The agent gets usage
from tools the user already has (Home Assistant MCP, Homey, P1 apps). This server
only turns usage numbers into ranked contracts from vtest.be (VREG).

## Goals
- Local MCP server, testable today with Claude Code / Claude Desktop / MCP Inspector.
- Built on the latest MCP TypeScript SDK (v2: `@modelcontextprotocol/server` 2.4.0)
  so it is ready for a later connector/plugin submission.
- Tool descriptions precise enough that an agent knows which numbers to fetch and in
  which units.

## Non-goals (for now)
- Reading Home Assistant / P1 data ourselves.
- Hosted remote connector, auth, multi-user.
- Fluvius CSV upload / quarter-hour pricing for dynamic contracts.
- Brussels (BRUSIM) and Wallonia (CompaCWaPE).

## Anti-goals
- Hammering vtest.be: one form submission per tool call, no crawling, no parallel fan-out.
- Inventing prices: if parsing fails, return an error, never a guess.

## Verified findings (2026-11-25)
- Flow: GET `https://www.vtest.be/` → session cookie + `__RequestVerificationToken`;
  POST multipart form to `/` → 200 with the results page (~6 MB HTML).
- `PostalCode` is an internal id, not the postcode (e.g. `9000 - Gent` → `7623`).
  The id list is in the `<option>` elements on the home page.
- Known-usage mode: `UserConsumption=2`, `HasDigitalMeter`, `HasNightMeter`,
  `HasExclusiveNight`, `UsageDay`, `UsageNight`, `UsageExclusiveNight`, `UsageGas`,
  `GasMeterUnit`, `HasSolarPanels`, `InjectionDay`, `InjectionNight`, `InverterPower`,
  `KnowsCapacityElectricity`, `CapacityElectricity`. Missing hidden fields → HTTP 500.
- Results: ~200 `.resultitem` elements with `data-price`, `data-contracttype`
  (ELECTRICITY/GAS), `data-tarifftype` (FIXED/VARIABLE/DYNAMIC), `data-greentype`,
  `data-supplier` (id), plus text for product name, yearly/monthly/per-kWh price.
  `grayedout` items (e.g. social tariff) are not generally available.

## Approach (chosen)
Local stdio MCP server in TypeScript that scrapes the public form.
Rejected: headless browser (heavy, slow, no gain: plain HTTP works);
hosted remote server (later step, user chose local first).

## Design
- **Tool `compare_energy_contracts`** (annotations: readOnly, openWorld, not destructive)
  - input: `postal_code` (4 digits), `municipality` (optional, needed when a postcode
    has several), `electricity` {`day_kwh`, `night_kwh`, `exclusive_night_kwh`,
    `digital_meter`, `injection_day_kwh`, `injection_night_kwh`, `capacity_peak_kw`,
    `inverter_kw`}, `gas` {`amount`, `unit`: kWh | m³}, `filters` {`tariff_type`,
    `green_only`}, `limit` (default 10).
  - output: `structuredContent` (cheapest-first lists for electricity and gas: supplier,
    product, tariff type, green type, yearly/monthly price, c€/kWh) + short text summary.
  - ambiguous postcode → error listing the municipalities to choose from.
- **Modules**: `vtest-client` (session, token, form encoding, POST),
  `parse-results` (HTML → typed rows), `postal-codes` (postcode → internal id, cached
  per process), `server` (MCP wiring).
- **Stack**: Node 24, TypeScript, `@modelcontextprotocol/server` v2 + zod v4, `cheerio`
  for HTML, `vitest` with a saved results-page fixture.

## Left to the builder
- Exact form field defaults for each meter/solar combination.
- Supplier id → name mapping (from logo/markup).
- Whether to merge electricity + gas into combined offers or keep separate lists.

## Open risk
- VREG terms of use for automated access: check before any public hosting.
