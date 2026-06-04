// Vite bundles @gukhanmun/wasm and @gukhanmun/stdict-fst JS source into the
// server bundle, but binary assets (.wasm, .fst) are not bundled. The bundled
// code resolves them relative to import.meta.url (a file: URL at runtime),
// so they must sit alongside the bundle in _fresh/server/assets/.
//
// Update these version constants when bumping @gukhanmun/* in deno.json.
const WASM_VERSION = "0.1.2";
const STDICT_VERSION = "0.1.2";

const OUT = "_fresh/server/assets";
const JSR = "https://jsr.io";

const FILES: [string, string][] = [
  [
    `${JSR}/@gukhanmun/stdict-fst/${STDICT_VERSION}/stdict.fst`,
    `${OUT}/stdict.fst`,
  ],
  [
    `${JSR}/@gukhanmun/wasm/${WASM_VERSION}/wasm/web/gukhanmun_wasm_bg.wasm`,
    `${OUT}/wasm/web/gukhanmun_wasm_bg.wasm`,
  ],
  [
    `${JSR}/@gukhanmun/wasm/${WASM_VERSION}/wasm/web/gukhanmun_wasm.js`,
    `${OUT}/wasm/web/gukhanmun_wasm.js`,
  ],
];

await Deno.mkdir(`${OUT}/wasm/web`, { recursive: true });

await Promise.all(FILES.map(async ([url, dest]) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await Deno.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
  console.log(`  copied → ${dest}`);
}));

console.log("Gukhanmun 바이너리 에셋 복사 완료.");
