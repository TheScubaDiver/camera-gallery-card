import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const isDev = process.env.ROLLUP_WATCH === "true" || process.env.NODE_ENV === "development";

export default {
  input: "src/index.js",
  output: {
    file: "dist/camera-gallery-card.js",
    format: "iife",
    name: "CameraGalleryCardBundle",
    sourcemap: isDev,
    banner: `/*! camera-gallery-card v${pkg.version} | ${pkg.license} */`,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        __VERSION__: JSON.stringify(pkg.version),
      },
    }),
    nodeResolve({ browser: true, extensions: [".js", ".ts", ".mjs"] }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      noEmitOnError: !isDev,
      // Plugin requires emit-capable config; tsconfig keeps noEmit:true for `tsc --noEmit`.
      compilerOptions: {
        noEmit: false,
        declaration: false,
        sourceMap: isDev,
        outDir: ".",
      },
      outputToFilesystem: false,
    }),
    !isDev &&
      terser({
        format: { comments: /^!/ },
      }),
  ].filter(Boolean),
};
