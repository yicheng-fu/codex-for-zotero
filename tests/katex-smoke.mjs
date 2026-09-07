import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const katex = require("../vendor/katex/katex.min.js");

const inline = katex.renderToString("E = mc^2", {
  displayMode: false,
  throwOnError: false,
  trust: false,
  output: "htmlAndMathml",
});
const display = katex.renderToString("\\int_0^1 x^2 \\, dx", {
  displayMode: true,
  throwOnError: false,
  trust: false,
  output: "htmlAndMathml",
});

assert.match(inline, /class="katex"/);
assert.match(inline, /<math/);
assert.match(display, /class="katex-display"/);
assert.match(display, /∫/);
console.log(JSON.stringify({ ok: true, katex: true, inline: true, display: true }));
