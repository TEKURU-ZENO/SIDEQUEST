import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const allowed = {
  "@sidequest/api": [
    "@sidequest/application",
    "@sidequest/config",
    "@sidequest/contracts",
    "@sidequest/observability",
    "@sidequest/twitch",
    "@sidequest/persistence",
    "@sidequest/intelligence",
  ],
  "@sidequest/dashboard": ["@sidequest/contracts", "@sidequest/ui"],
  "@sidequest/overlay": ["@sidequest/contracts", "@sidequest/ui"],
  "@sidequest/application": ["@sidequest/contracts", "@sidequest/domain"],
  "@sidequest/config": [],
  "@sidequest/contracts": [],
  "@sidequest/domain": ["@sidequest/contracts"],
  "@sidequest/intelligence": ["@sidequest/contracts", "@sidequest/domain"],
  "@sidequest/observability": [],
  "@sidequest/persistence": ["@sidequest/application", "@sidequest/domain"],
  "@sidequest/testing": ["@sidequest/domain"],
  "@sidequest/twitch": ["@sidequest/contracts"],
  "@sidequest/ui": [],
};
const workspaces = new Map();
for (const parent of ["apps", "packages"]) {
  for (const folder of await readdir(resolve(root, parent), {
    withFileTypes: true,
  })) {
    if (!folder.isDirectory()) continue;
    const dir = resolve(root, parent, folder.name);
    const manifest = JSON.parse(
      await readFile(resolve(dir, "package.json"), "utf8"),
    );
    workspaces.set(manifest.name, { dir, manifest });
  }
}

const errors = [];
const graph = new Map();
async function sourceFiles(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist")
        result.push(...(await sourceFiles(path)));
    } else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) result.push(path);
  }
  return result;
}

for (const [name, { dir, manifest }] of workspaces) {
  const permitted = new Set(allowed[name] ?? []);
  if (!(name in allowed))
    errors.push(`${name}: missing architecture allowlist entry`);
  graph.set(name, new Set());
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (!workspaces.has(dependency)) continue;
    if (!permitted.has(dependency))
      errors.push(`${name}: disallowed workspace dependency ${dependency}`);
    graph.get(name).add(dependency);
  }
  for (const file of await sourceFiles(resolve(dir, "src"))) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /\b(?:from\s*|import\s*)["'](@sidequest\/[^"']+)["']/g,
    )) {
      const dependency = match[1];
      if (!workspaces.has(dependency)) continue;
      const declared =
        Object.hasOwn(manifest.dependencies ?? {}, dependency) ||
        Object.hasOwn(manifest.devDependencies ?? {}, dependency);
      const relative = file.slice(root.length + 1);
      if (!declared)
        errors.push(`${name}: ${relative} imports undeclared ${dependency}`);
      if (!permitted.has(dependency))
        errors.push(`${name}: ${relative} imports disallowed ${dependency}`);
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visit(node, path = []) {
  if (visiting.has(node)) {
    errors.push(`dependency cycle: ${[...path, node].join(" -> ")}`);
    return;
  }
  if (visited.has(node)) return;
  visiting.add(node);
  for (const dependency of graph.get(node) ?? [])
    visit(dependency, [...path, node]);
  visiting.delete(node);
  visited.add(node);
}
for (const name of workspaces.keys()) visit(name);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Workspace boundaries valid: ${workspaces.size} packages, no cycles.`,
  );
