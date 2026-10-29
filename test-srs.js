// Simulates a learner using the SRS core from widget.js, one session a day at 20:00.
// Run: node test-srs.js [newPerDay]
const fs = require("fs");
const assert = require("assert");

const src = fs.readFileSync(__dirname + "/widget.js", "utf8");
const core = src.slice(src.indexOf("// --- SRS CORE START"), src.indexOf("// --- SRS CORE END"));
const NEW_PER_DAY = Number(process.argv[2] || 10);
const MAX_DUE_FOR_NEW = 50;
const api = new Function("NEW_PER_DAY", "MAX_DUE_FOR_NEW", core +
  "return { HOUR, MASTER_BOX, newState, applyGrade, buildSession, stats, markStudied };")(NEW_PER_DAY, MAX_DUE_FOR_NEW);

const words = Array.from({ length: 1000 }, (_, i) => ({ hanzi: "w" + i }));

// Seeded RNG so runs are reproducible.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const recallP = { 1: 0.7, 2: 0.8, 3: 0.85, 4: 0.88, 5: 0.9, 6: 0.93, 7: 0.95 };

const state = api.newState();
const start = new Date(2026, 10, 1, 20).getTime();
const introOrder = [];
let doneDay = null, day90 = null, maxLoad = 0, totalLoad = 0;

for (let day = 0; day < 400 && doneDay === null; day++) {
  const now = start + day * 24 * api.HOUR;
  const queue = api.buildSession(state, words, now);
  let load = 0;
  while (queue.length) {
    const item = queue.shift();
    load++;
    if (item.kind === "new") {
      introOrder.push(item.hanzi);
      api.applyGrade(state, item.hanzi, 1, now, "new");
      continue;
    }
    const r = rand();
    const grade = r < recallP[state.cards[item.hanzi].box] ? 2 : r < 0.97 ? 0 : 1;
    api.applyGrade(state, item.hanzi, grade, now, "review");
    if (grade === 0) queue.push({ hanzi: item.hanzi, kind: "review" });
  }
  api.markStudied(state, now);
  maxLoad = Math.max(maxLoad, load);
  totalLoad += load;
  const mastered = api.stats(state, words, now).mastered;
  if (day90 === null && mastered >= words.length * 0.9) day90 = day + 1;
  if (mastered === words.length) doneDay = day + 1;
}

// Every word introduced exactly once, in list order — nothing skipped.
assert.deepStrictEqual(introOrder, words.map(w => w.hanzi));
assert.ok(doneDay, "not all words mastered within 400 days");
assert.strictEqual(state.streak, doneDay);

console.log(`new/day=${NEW_PER_DAY}: 90% learned on day ${day90}, all 1000 on day ${doneDay}; ` +
  `cards per session avg ${(totalLoad / doneDay).toFixed(0)}, max ${maxLoad}`);
