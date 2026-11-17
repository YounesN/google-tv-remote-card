import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

const dev = process.env.ROLLUP_WATCH === "true";

export default {
  input: "src/tcl-remote-card.ts",
  output: {
    file: "dist/tcl-remote-card.js",
    format: "es",
    sourcemap: dev,
  },
  plugins: [resolve(), typescript(), !dev && terser({ format: { comments: false } })],
};
