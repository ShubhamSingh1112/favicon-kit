import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "node_modules/astro/bin/astro.mjs");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: process.env.ASTRO_TELEMETRY_DISABLED || "1" },
});

process.exitCode = result.status ?? 1;
