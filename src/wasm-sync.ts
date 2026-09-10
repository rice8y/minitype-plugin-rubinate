import { readFileSync } from "node:fs";

/** Synchronous WASM host for the TSX component path. */
function createHostSync(name: string) {
  const bytes = readFileSync(new URL(`../assets/${name}.wasm`, import.meta.url));
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module, {});
  const { memory, alloc, dealloc } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== "function" || typeof dealloc !== "function") {
    throw new Error(`Invalid WASM buffer ABI: ${name}`);
  }
  return (entry: string, value: unknown): unknown => {
    const fn = instance.exports[entry];
    if (typeof fn !== "function") throw new Error(`Missing WASM export: ${entry}`);
    const input = new TextEncoder().encode(JSON.stringify(value));
    const inputPointer = alloc(input.length) >>> 0;
    let outputPointer: number | undefined;
    let outputLength = 0;
    try {
      new Uint8Array(memory.buffer, inputPointer, input.length).set(input);
      const packed = BigInt.asUintN(64, fn(inputPointer, input.length));
      outputPointer = Number(packed >> 32n);
      outputLength = Number(packed & 0xffffffffn);
      const output = new Uint8Array(memory.buffer, outputPointer, outputLength);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
      if (text.startsWith("Error:")) throw new Error(`${name}: ${text}`);
      return JSON.parse(text);
    } finally {
      if (outputPointer !== undefined) dealloc(outputPointer, outputLength);
      dealloc(inputPointer, input.length);
    }
  };
}

const hosts = new Map<string, ReturnType<typeof createHostSync>>();

export function callWasmSync(name: "ipadic" | "unidic" | "jmdict_furigana", entry: string, value: unknown): unknown {
  let host = hosts.get(name);
  if (!host) {
    host = createHostSync(name);
    hosts.set(name, host);
  }
  try {
    return host(entry, value);
  } catch (error) {
    if (hosts.get(name) === host) hosts.delete(name);
    throw error;
  }
}
