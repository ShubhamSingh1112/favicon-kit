import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiler = resolve(root, "node_modules/typescript/bin/tsc");
const result = spawnSync(process.execPath, [compiler, "--noEmit"], {
  cwd: root,
  stdio: "inherit",
});

process.exitCode = result.status ?? 1;
