#!/usr/bin/env node
// Runs the token estimator from content.js against a saved conversation payload.
//
//   node scripts/test_estimator.js path/to/conversation.json
//
// Capture a payload from DevTools -> Network -> the chat_conversations?tree=True
// request -> Copy response. Compare the printed numbers against claude.ai's own
// "Context & token usage" popover; the estimate should land within ~10%.
//
// The functions are extracted verbatim from content.js so this test cannot
// drift from the shipped implementation.

const fs = require("fs");
const path = require("path");

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("usage: node scripts/test_estimator.js <conversation.json>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

const src = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const names = [
  "extractConversationStats",
  "isPaidPlan",
  "detectContextWindow",
  "currentBranchMessages",
  "analyzeMessages",
  "collectMessageParts",
  "countMessageImages",
  "estimateTokens",
];
const constMatch = src.match(/const DEFAULT_CONTEXT_WINDOW[\s\S]*?const IMAGE_TOKENS = \d+;/);
if (!constMatch) {
  console.error("could not extract constants from content.js");
  process.exit(1);
}
// isPaidPlan reads module state that doesn't exist outside the extension;
// default to a paid org here (set CUB_FREE=1 to test the free-plan mapping).
let code = constMatch[0] + "\n";
code += `let orgInfo = { capabilities: [${process.env.CUB_FREE ? "" : '"claude_pro"'}] };\n`;
for (const n of names) {
  const re = new RegExp(`  (?:// [^\\n]*\\n  )*function ${n}\\([\\s\\S]*?\\n  }\\n`);
  const m = src.match(re);
  if (!m) {
    console.error("could not extract", n);
    process.exit(1);
  }
  code += m[0] + "\n";
}
code += "return extractConversationStats(data);";

const stats = new Function("data", code)(data);
if (!stats) {
  console.error("no stats extracted, empty conversation?");
  process.exit(1);
}
const pct = ((stats.contextTokens / stats.window) * 100).toFixed(1);
console.log(`context : ${stats.contextTokens} tokens (${pct}% of ${stats.window})`);
console.log(`total   : ${stats.totalTokens} tokens`);
console.log(`source  : ${stats.source}`);
console.log("breakdown of context:");
for (const k of ["user", "assistant", "thinking", "tools", "files"]) {
  console.log(`  ${k.padEnd(9)}: ${stats.cats[k]}`);
}
