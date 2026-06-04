import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WASM_VER = "0.1.2";
const STDICT_VER = "0.1.2";
const JSR = "https://jsr.io";

// @fresh/plugin-vite forces noExternal: true, so @gukhanmun/wasm and
// @gukhanmun/stdict-fst are bundled as JS but their binary assets (.wasm,
// .fst) are not.  The bundled code resolves them relative to import.meta.url
// (a file: URL at runtime), so they must live alongside the bundle.
// This plugin fetches them from JSR and writes them into the SSR output.
const gukhanmunBinaryAssets = {
  name: "gukhanmun-binary-assets",
  apply: "build" as const,
  async closeBundle() {
    // this.environment is available in Vite 7.x Environments API;
    // skip for the client environment to avoid unnecessary fetches.
    if ((this as { environment?: { name: string } }).environment?.name === "client") {
      return;
    }
    const out = "_fresh/server/assets";
    await mkdir(join(out, "wasm/web"), { recursive: true });

    await Promise.all([
      fetch(`${JSR}/@gukhanmun/stdict-fst/${STDICT_VER}/stdict.fst`)
        .then((r) => r.arrayBuffer())
        .then((b) => writeFile(join(out, "stdict.fst"), new Uint8Array(b))),
      fetch(
        `${JSR}/@gukhanmun/wasm/${WASM_VER}/wasm/web/gukhanmun_wasm_bg.wasm`,
      )
        .then((r) => r.arrayBuffer())
        .then((b) =>
          writeFile(
            join(out, "wasm/web/gukhanmun_wasm_bg.wasm"),
            new Uint8Array(b),
          )
        ),
      fetch(`${JSR}/@gukhanmun/wasm/${WASM_VER}/wasm/web/gukhanmun_wasm.js`)
        .then((r) => r.text())
        .then((t) => writeFile(join(out, "wasm/web/gukhanmun_wasm.js"), t)),
    ]);
  },
};

export default defineConfig({
  plugins: [fresh(), gukhanmunBinaryAssets],
});
