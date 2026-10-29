// Merges content/*.json chunks into words.json (HSK 1–3 first, then HSK 4), dedups by hanzi, assigns ids.
// Run: node merge-words.js
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "content");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort((a, b) => {
  const rank = f => (f.startsWith("hsk13") ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
});

const fields = ["hanzi", "pinyin", "doc", "hanviet", "nghia", "meo"];
const seen = new Map();
const out = [];
const problems = [];

for (const f of files) {
  for (const w of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) {
    for (const k of fields) if (!w[k]) problems.push(`${f}: ${w.hanzi || "?"} missing ${k}`);
    if (!w.vd || !w.vd.zh || !w.vd.py || !w.vd.vi) problems.push(`${f}: ${w.hanzi} bad vd`);
    if (seen.has(w.hanzi)) {
      problems.push(`duplicate ${w.hanzi} in ${f} (kept ${seen.get(w.hanzi)})`);
      continue;
    }
    seen.set(w.hanzi, f);
    out.push({ id: out.length + 1, ...w });
  }
}

fs.writeFileSync(path.join(__dirname, "words.json"), "[\n" + out.map(w => "  " + JSON.stringify(w)).join(",\n") + "\n]\n");
const byLevel = out.reduce((m, w) => ((m[w.level] = (m[w.level] || 0) + 1), m), {});
console.log(`wrote ${out.length} words`, byLevel);
if (problems.length) console.log(problems.join("\n"));
