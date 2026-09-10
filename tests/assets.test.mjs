import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

test("shipped WASM and upstream source match the recorded snapshot", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/manifest.json", import.meta.url), "utf8"));
  for (const [path, expected] of Object.entries(manifest.sha256)) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, path);
  }
});
