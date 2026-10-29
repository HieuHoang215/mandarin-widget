// Mandarin 1000 — spaced-repetition widget for the Scriptable app (iOS).
// Paste into a new Scriptable script, then add a Scriptable widget to the home screen.
// Tapping the widget (or running the script) opens the review session.

const SITE = "https://hieuhoang215.github.io/mandarin-widget/";
const NEW_PER_DAY = 10;        // new words introduced per day
const MAX_DUE_FOR_NEW = 50;    // pause new words while this many reviews are waiting
const REMIND_HOUR = 20;        // daily reminder at 20:00 if anything is waiting

// --- SRS CORE START (pure functions, tested by test-srs.js) ---
const HOUR = 3600 * 1000;
// Review interval after reaching each box. Box 1 = just learned, box 7 = long-term maintenance.
const INTERVAL_H = { 1: 4, 2: 24, 3: 72, 4: 168, 5: 384, 6: 840, 7: 2160 };
const MASTER_BOX = 6;          // passed reviews at 1d, 3d, 7d and 16d gaps => learned

function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function newState() {
  return { cards: {}, day: "", newToday: 0, streak: 0, lastStudyDay: "" };
}

// Reset the daily new-word counter when the date changes.
function rollDay(state, now) {
  const today = dayKey(now);
  if (state.day !== today) {
    state.day = today;
    state.newToday = 0;
  }
}

// grade: 0 = forgot, 1 = vaguely, 2 = remembered. New words are always graded 1 on first sight.
function applyGrade(state, hanzi, grade, now, kind) {
  let c = state.cards[hanzi];
  if (!c) {
    c = state.cards[hanzi] = { box: 1, due: now + INTERVAL_H[1] * HOUR, lapses: 0, reps: 0 };
    if (kind === "new") state.newToday++;
    c.reps++;
    return c;
  }
  c.reps++;
  if (grade === 0) {
    c.box = 1;
    c.lapses++;
    c.due = now;                       // comes back at the end of this session
  } else if (grade === 1) {
    c.due = now + (INTERVAL_H[c.box] / 2) * HOUR;
  } else {
    c.box = Math.min(c.box + 1, 7);
    c.due = now + INTERVAL_H[c.box] * HOUR;
  }
  // "Learned" is permanent once reached; a later lapse still sends the word back through reviews.
  if (c.box >= MASTER_BOX && !c.learnedAt) c.learnedAt = now;
  return c;
}

function dueList(state, now) {
  return Object.keys(state.cards)
    .filter(h => state.cards[h].due <= now)
    .sort((a, b) => state.cards[a].due - state.cards[b].due);
}

function newAllowed(state, now) {
  if (dueList(state, now).length >= MAX_DUE_FOR_NEW) return 0;
  return Math.max(0, NEW_PER_DAY - state.newToday);
}

// Words are introduced strictly in list order, so none is ever skipped.
function nextNewWords(state, words, n) {
  const out = [];
  for (const w of words) {
    if (out.length >= n) break;
    if (!state.cards[w.hanzi]) out.push(w.hanzi);
  }
  return out;
}

function buildSession(state, words, now) {
  rollDay(state, now);
  const known = new Set(words.map(w => w.hanzi));
  const due = dueList(state, now).filter(h => known.has(h));
  const fresh = nextNewWords(state, words, newAllowed(state, now));
  return due.map(h => ({ hanzi: h, kind: "review" }))
    .concat(fresh.map(h => ({ hanzi: h, kind: "new" })));
}

function stats(state, words, now) {
  let mastered = 0, learning = 0;
  for (const w of words) {
    const c = state.cards[w.hanzi];
    if (!c) continue;
    if (c.learnedAt) mastered++; else learning++;
  }
  return {
    mastered, learning, total: words.length, streak: state.streak,
    dueLeft: dueList(state, now).length, newLeft: newAllowed(state, now),
  };
}

function markStudied(state, now) {
  const today = dayKey(now);
  if (state.lastStudyDay === today) return;
  state.streak = state.lastStudyDay === dayKey(now - 24 * HOUR) ? state.streak + 1 : 1;
  state.lastStudyDay = today;
}
// --- SRS CORE END ---

const fm = (() => { try { return FileManager.iCloud(); } catch (e) { return FileManager.local(); } })();
const dir = fm.joinPath(fm.documentsDirectory(), "mandarin1000");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const statePath = fm.joinPath(dir, "state.json");

async function readFile(path) {
  if (!fm.fileExists(path)) return null;
  if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
  return fm.readString(path);
}

// Fetch a site file, keeping a local copy for offline use.
async function loadSiteText(name) {
  const cache = fm.joinPath(dir, name);
  try {
    const text = await new Request(SITE + name).loadString();
    fm.writeString(cache, text);
    return text;
  } catch (e) {
    const text = await readFile(cache);
    if (text) return text;
    throw e;
  }
}

async function loadState() {
  const text = await readFile(statePath);
  return text ? JSON.parse(text) : newState();
}

function saveState(state) {
  fm.writeString(statePath, JSON.stringify(state));
}

const runURL = "scriptable:///run/" + encodeURIComponent(Script.name());

async function scheduleReminder(state, words) {
  Notification.removePending(["mandarin-remind"]);
  const t = new Date();
  t.setHours(REMIND_HOUR, 0, 0, 0);
  if (t.getTime() <= Date.now() || state.lastStudyDay === dayKey(Date.now())) t.setDate(t.getDate() + 1);
  const due = dueList(state, t.getTime()).length;
  const fresh = Math.min(NEW_PER_DAY, words.length - Object.keys(state.cards).length);
  if (due + fresh === 0) return;
  const n = new Notification();
  n.identifier = "mandarin-remind";
  n.title = "汉字 đang đợi bạn 👀";
  n.body = (due ? due + " từ cần ôn" : "") + (due && fresh ? " + " : "") + (fresh ? fresh + " từ mới" : "") + ". 3 phút thôi!";
  n.openURL = runURL;
  n.setTriggerDate(t);
  await n.schedule();
}

// Game Show Flat palette (see DESIGN.md).
const HANZI = new Color("#FFF4DF");
const PINYIN = Color.white();
const MEANING = new Color("#FFD23F");
const SOFT = new Color("#E3DBFF");

function add(stack, text, font, color, lines) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = color || Color.white();
  if (lines) t.lineLimit = lines;
  t.minimumScaleFactor = 0.7;
  return t;
}

function buildWidget(state, words) {
  const now = Date.now();
  rollDay(state, now);
  const s = stats(state, words, now);
  const byHanzi = new Map(words.map(w => [w.hanzi, w]));
  const family = config.widgetFamily || "large";

  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#7A5FD0"), new Color("#6C4FC4")];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.url = runURL;
  w.refreshAfterDate = new Date(now + HOUR);

  const due = dueList(state, now);
  const fresh = nextNewWords(state, words, 1);
  let mode, word;
  if (due.length) {
    mode = "review"; word = byHanzi.get(due[0]);
  } else if (s.newLeft > 0 && fresh.length) {
    mode = "new"; word = byHanzi.get(fresh[0]);
  } else {
    // Nothing waiting: show an already-learned word as a passive refresher.
    mode = "rest";
    const seen = words.filter(x => state.cards[x.hanzi]);
    word = (seen.length ? seen : words)[Math.floor(now / (3 * HOUR)) % (seen.length || words.length)];
  }

  const header = mode === "review" ? "🧠 Nhớ nghĩa không? · " + due.length + " từ chờ ôn"
    : mode === "new" ? "✨ Từ mới hôm nay"
    : "🎉 Hôm nay xong rồi";
  add(w, header, Font.boldRoundedSystemFont(11), MEANING, 1);
  w.addSpacer(4);

  if (mode === "review") {
    // Recall prompt: only the character — tap to check yourself.
    add(w, word.hanzi, Font.heavyRoundedSystemFont(family === "small" ? 44 : 60), HANZI, 1);
    w.addSpacer();
    add(w, "Chạm để lật thẻ 👆", Font.systemFont(12), SOFT, 1);
  } else if (family === "small") {
    add(w, word.hanzi, Font.heavyRoundedSystemFont(40), HANZI, 1);
    add(w, word.pinyin, Font.mediumSystemFont(15), PINYIN, 1);
    add(w, word.nghia, Font.boldRoundedSystemFont(13), MEANING, 2);
  } else if (family === "medium") {
    const row = w.addStack();
    row.centerAlignContent();
    const left = row.addStack();
    left.layoutVertically();
    add(left, word.hanzi, Font.heavyRoundedSystemFont(36), HANZI, 1);
    add(left, word.pinyin, Font.mediumSystemFont(14), PINYIN, 1);
    row.addSpacer(12);
    const right = row.addStack();
    right.layoutVertically();
    add(right, word.nghia + "  ·  đọc: " + word.doc, Font.boldRoundedSystemFont(13), MEANING, 1);
    right.addSpacer(4);
    add(right, "💡 " + word.meo, Font.systemFont(12), Color.white(), 3);
  } else {
    add(w, word.hanzi, Font.heavyRoundedSystemFont(54), HANZI, 1);
    add(w, word.pinyin + "   ·   đọc: " + word.doc, Font.mediumSystemFont(16), PINYIN, 1);
    add(w, word.nghia + "  (Hán Việt: " + word.hanviet + ")", Font.boldRoundedSystemFont(15), MEANING, 1);
    w.addSpacer(8);
    add(w, word.vd.zh, Font.mediumSystemFont(15), HANZI, 1);
    add(w, word.vd.vi, Font.italicSystemFont(12), SOFT, 1);
    w.addSpacer(8);
    add(w, "💡 " + word.meo, Font.systemFont(13), Color.white(), 4);
  }

  w.addSpacer();
  add(w, "Đã thuộc " + s.mastered + "/" + s.total + (s.streak ? "  ·  🔥 " + s.streak : ""), Font.mediumSystemFont(10), SOFT, 1);
  return w;
}

async function runSession(state, words) {
  const html = await loadSiteText("review.html");
  const byHanzi = new Map(words.map(w => [w.hanzi, w]));
  const queue = buildSession(state, words, Date.now());

  const wv = new WebView();
  await wv.loadHTML(html, SITE);
  let closed = false;
  const dismissed = wv.present(true).then(() => { closed = true; return null; });
  const ask = js => Promise.race([wv.evaluateJavaScript(js, true), dismissed]);

  while (queue.length && !closed) {
    const item = queue.shift();
    const c = state.cards[item.hanzi];
    const card = { word: byHanzi.get(item.hanzi), kind: item.kind, lapses: c ? c.lapses : 0 };
    const s = stats(state, words, Date.now());
    s.dueLeft = queue.filter(q => q.kind === "review").length;
    s.newLeft = queue.filter(q => q.kind === "new").length;
    const res = await ask(`showCard(${JSON.stringify(card)}, ${JSON.stringify(s)}, completion)`);
    if (!res) break;
    applyGrade(state, item.hanzi, item.kind === "new" ? 1 : res.grade, Date.now(), item.kind);
    if (item.kind === "review" && res.grade === 0) queue.push({ hanzi: item.hanzi, kind: "review" });
    markStudied(state, Date.now());
    saveState(state);
  }
  if (!closed) {
    saveState(state);
    // WebView can't be dismissed from code; the user closes it with the Close button.
    await ask(`showDone(${JSON.stringify(stats(state, words, Date.now()))}, completion)`);
    await dismissed;
  }
}

const words = JSON.parse(await loadSiteText("words.json"));
const state = await loadState();

if (config.runsInWidget) {
  Script.setWidget(buildWidget(state, words));
} else {
  await runSession(state, words);
  saveState(state);
}
try { await scheduleReminder(state, words); } catch (e) { console.log("reminder: " + e); }
Script.complete();
