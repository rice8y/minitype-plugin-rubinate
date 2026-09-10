import { spawnSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Requires rustup target add wasm32-unknown-unknown. Cargo.lock pins the fork
// revision. First build downloads crates and dictionary archives.
const root = new URL("../", import.meta.url);
for (const [crate, asset] of [["ipadic", "ipadic"], ["unidic", "unidic"], ["jmdict-furigana", "jmdict_furigana"]]) {
  const dir = new URL(`wasm-plugins/${crate}/`, root);
  const result = spawnSync("cargo", ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"], {
    cwd: fileURLToPath(dir), stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build failed: ${crate}`);
  await copyFile(new URL(`target/wasm32-unknown-unknown/release/${asset}.wasm`, dir), new URL(`assets/${asset}.wasm`, root));
}
const path = new URL("assets/manifest.json", root);
const manifest = JSON.parse(await readFile(path, "utf8"));
manifest.sha256["wasm-plugins/common/abi.rs"] = "";
for (const name of Object.keys(manifest.sha256)) {
  manifest.sha256[name] = createHash("sha256").update(await readFile(new URL(name, root))).digest("hex");
}
manifest.description = "Rebuilt locally from the project sources in wasm-plugins; see Cargo.lock for dependency revisions.";
await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
