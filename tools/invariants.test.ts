import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const biomeBin = join(repoRoot, "node_modules", ".bin", "biome");

const IMPORTS = "lint/style/noRestrictedImports";
const GLOBALS = "lint/style/noRestrictedGlobals";
const PLUGIN = "plugin";
const ENFORCED = new Set([IMPORTS, GLOBALS, PLUGIN]);

type Fixture = { path: string; source: string; expected: string[] };

const violating: Fixture[] = [
	{
		path: "src/game/react-import.ts",
		source: 'import { useState } from "react";\nexport const x = useState;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/game/ui-import.ts",
		source: 'import { b } from "@/ui/b";\nexport const x = b;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/game/store-import.ts",
		source: 'import { x } from "../store/x";\nexport const y = x;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/game/spotify-import.ts",
		source: 'import { y } from "@/spotify/y";\nexport const z = y;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/game/window-global.ts",
		source: "export const x = window;\n",
		expected: [GLOBALS],
	},
	{
		path: "src/game/fetch-global.ts",
		source: "export const x = fetch;\n",
		expected: [GLOBALS],
	},
	{
		path: "src/game/spotify-global.ts",
		source: "export const x = Spotify;\n",
		expected: [GLOBALS],
	},
	{
		path: "src/game/math-random.ts",
		source: "export const x = [Math.random()];\n",
		expected: [PLUGIN],
	},
	{
		path: "src/game/date-now.ts",
		source: "export const x = [Date.now()];\n",
		expected: [PLUGIN],
	},
	{
		path: "src/game/new-date.ts",
		source: "export const x = [new Date()];\n",
		expected: [PLUGIN],
	},
	{
		path: "src/game/performance-now.ts",
		source: "export const x = [performance.now()];\n",
		expected: [PLUGIN],
	},
	{
		path: "src/spotify/ui-import.ts",
		source: 'import { b } from "@/ui/b";\nexport const x = b;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/spotify/store-import.ts",
		source: 'import { s } from "@/store/s";\nexport const x = s;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/spotify/react-import.ts",
		source: 'import { useState } from "react";\nexport const x = useState;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/spotify/other.ts",
		source: "export const x = Spotify;\n",
		expected: [GLOBALS],
	},
	{
		path: "src/store/ui-import.ts",
		source: 'import { b } from "@/ui/b";\nexport const x = b;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/store/react-import.ts",
		source: 'import { useState } from "react";\nexport const x = useState;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/ui/spotify-import.tsx",
		source: 'import { y } from "@/spotify/y";\nexport const x = y;\n',
		expected: [IMPORTS],
	},
	{
		path: "src/ui/x.tsx",
		source: "export const x = Spotify;\n",
		expected: [GLOBALS],
	},
];

const clean: Fixture[] = [
	{
		path: "src/spotify/ambient.ts",
		source: "export const x = [Date.now(), new Date(), fetch, window];\n",
		expected: [],
	},
	{
		path: "src/store/ambient.ts",
		source: "export const x = [Date.now(), new Date(), fetch, window];\n",
		expected: [],
	},
	{
		path: "src/spotify/playback/sdk/x.ts",
		source: "export const x = Spotify;\n",
		expected: [],
	},
	{
		path: "src/game/sibling.ts",
		source: "export const sibling = 1;\n",
		expected: [],
	},
	{
		path: "src/game/pure.ts",
		source:
			'import { sibling } from "./sibling";\nexport const x = sibling + 1;\n',
		expected: [],
	},
	{
		path: "src/game/injected-clock.ts",
		source:
			"export const elapsed = (now: () => number, start: number) => now() - start;\n",
		expected: [],
	},
	{
		path: "src/game/dated-from-value.ts",
		source: "export const at = (ms: number) => new Date(ms);\n",
		expected: [],
	},
	{
		path: "src/ui/store-import.tsx",
		source: 'import { s } from "@/store/s";\nexport const x = s;\n',
		expected: [],
	},
];

const fixtures = [...violating, ...clean];

let workDir: string;
let categoriesByFile: Map<string, string[]>;

beforeAll(() => {
	workDir = mkdtempSync(join(tmpdir(), "harkdle-invariants-"));
	cpSync(join(repoRoot, "biome.json"), join(workDir, "biome.json"));
	cpSync(join(repoRoot, "rules"), join(workDir, "rules"), { recursive: true });

	for (const fixture of fixtures) {
		const target = join(workDir, fixture.path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, fixture.source);
	}

	const run = spawnSync(biomeBin, ["lint", "--reporter=json", "."], {
		cwd: workDir,
		encoding: "utf8",
	});
	const jsonLine = `${run.stdout}\n${run.stderr}`
		.split("\n")
		.find((line) => line.startsWith('{"summary"'));
	if (!jsonLine) {
		throw new Error(
			`biome produced no JSON report:\n${run.stdout}${run.stderr}`,
		);
	}

	const report: {
		diagnostics: { category: string; location?: { path?: string } }[];
	} = JSON.parse(jsonLine);

	categoriesByFile = new Map();
	for (const diagnostic of report.diagnostics) {
		const file = diagnostic.location?.path;
		if (!file || !ENFORCED.has(diagnostic.category)) continue;
		const found = categoriesByFile.get(file) ?? [];
		found.push(diagnostic.category);
		categoriesByFile.set(file, found);
	}
});

afterAll(() => {
	if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const categoriesOf = (path: string) => [
	...new Set(categoriesByFile.get(path) ?? []),
];

describe("layer invariants (biome.json)", () => {
	it.each(violating.map((f) => [f.path, f] as const))(
		"flags %s",
		(_path, fixture) => {
			expect(categoriesOf(fixture.path)).toEqual(fixture.expected);
		},
	);

	it.each(clean.map((f) => [f.path, f] as const))(
		"does not flag %s",
		(_path, fixture) => {
			expect(categoriesOf(fixture.path)).toEqual([]);
		},
	);

	it("reports only on the fixtures it wrote", () => {
		const known = new Set(fixtures.map((f) => f.path));
		expect([...categoriesByFile.keys()].filter((f) => !known.has(f))).toEqual(
			[],
		);
	});
});
