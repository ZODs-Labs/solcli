import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/solcli": "bin/solcli.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  shims: false,
  minify: false,
  bundle: true,
  noExternal: [/^@solcli\//],
  external: ["@napi-rs/keyring", "pino", "pino-roll", "pino-pretty", "proper-lockfile"],
});
