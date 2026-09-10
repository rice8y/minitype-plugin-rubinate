import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { callWasm } from "../dist/wasm.js";

for (const [name, entry] of [["ipadic", "analyze"], ["unidic", "analyze"], ["jmdict_furigana", "lookup"]]) {
  test(`${name} has an import-free ABI and releases input/output buffers`, async () => {
    const bytes = await readFile(new URL(`../assets/${name}.wasm`, import.meta.url));
    const module = await WebAssembly.compile(bytes);
    assert.deepEqual(WebAssembly.Module.imports(module), []);
    const { exports: wasm } = await WebAssembly.instantiate(module, {});
    // Large invalid JSON exercises allocation, memory growth, error output and
    // repeated reuse without initializing the dictionaries.
    const input = new TextEncoder().encode("!".repeat(256 * 1024));
    function invoke() {
      const pointer = wasm.alloc(input.length) >>> 0;
      new Uint8Array(wasm.memory.buffer, pointer, input.length).set(input);
      const packed = BigInt.asUintN(64, wasm[entry](pointer, input.length));
      const outputPointer = Number(packed >> 32n);
      const length = Number(packed & 0xffffffffn);
      try {
        assert.match(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, outputPointer, length)), /^Error:/);
      } finally {
        wasm.dealloc(outputPointer, length);
        wasm.dealloc(pointer, input.length);
      }
    }
    invoke();
    const size = wasm.memory.buffer.byteLength;
    for (let i = 0; i < 32; i++) invoke();
    assert.equal(wasm.memory.buffer.byteLength, size, "freed buffers should be reused");
  });
}

test("host reports malformed requests and recovers for subsequent calls", async () => {
  await assert.rejects(callWasm("jmdict_furigana", "lookup", null), /Error: Invalid JSON/);
  assert.deepEqual(await callWasm("jmdict_furigana", "lookup", { entries: [], kana: "hiragana" }), []);
  await assert.rejects(callWasm("jmdict_furigana", "missing", {}), /Missing WASM export/);
  assert.deepEqual(await callWasm("jmdict_furigana", "lookup", { entries: [], kana: "hiragana" }), []);
});
