import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export function loadFixture(name: string): string {
	const path = new URL(`./fixtures/${name}.html.gz`, import.meta.url);
	return gunzipSync(readFileSync(path)).toString("utf8");
}
