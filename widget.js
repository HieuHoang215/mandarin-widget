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

// --- DRAW START (widget art, drawn as one image; previewed by preview-widget.js) ---
// Game Show Flat palette (see DESIGN.md).
const INK = "#1C1530", CREAM = "#FFF4DF", WHITE = "#FFFFFF", RED = "#FF5A5F",
  YELLOW = "#FFD23F", GREEN = "#3DDC84", PINK = "#FF7EB6", ORANGE = "#FF9F43", SOFT_INK = "#5B5270";
const SETS = [["#6C4FC4", "#7A5FD0"], ["#FF9F43", "#FFB063"], ["#3FB7EA", "#5CC4EF"],
  ["#FF77AE", "#FF8DBC"], ["#22B39F", "#3BC2AE"], ["#8BD346", "#9CDB60"]];
const SIZES = { small: [170, 170], medium: [364, 170], large: [364, 382] };

function rr(x, y, w, h, r) {
  const p = new Path();
  p.addRoundedRect(new Rect(x, y, w, h), r, r);
  return p;
}

function fill(ctx, path, color) {
  ctx.addPath(path);
  ctx.setFillColor(new Color(color));
  ctx.fillPath();
}

// Ink-outlined rounded box with a hard offset shadow.
function box(ctx, x, y, w, h, r, color, shadow = 4) {
  if (shadow) fill(ctx, rr(x + shadow, y + shadow, w, h, r), INK);
  fill(ctx, rr(x, y, w, h, r), color);
  ctx.addPath(rr(x, y, w, h, r));
  ctx.setStrokeColor(new Color(INK));
  ctx.setLineWidth(2.5);
  ctx.strokePath();
}

function txt(ctx, s, x, y, w, h, font, color, align) {
  ctx.setFont(font);
  ctx.setTextColor(new Color(color));
  if (align === "center") ctx.setTextAlignedCenter();
  else if (align === "right") ctx.setTextAlignedRight();
  else ctx.setTextAlignedLeft();
  ctx.drawTextInRect(s, new Rect(x, y, w, h));
}

function stripes(ctx, W, H, set) {
  fill(ctx, rr(0, 0, W, H, 0), set[0]);
  for (let x = -H; x < W + H; x += 30) {
    const p = new Path();
    p.addLines([new Point(x, 0), new Point(x + 15, 0), new Point(x + 15 - H, H), new Point(x - H, H)]);
    p.closeSubpath();
    fill(ctx, p, set[1]);
  }
}

// The bean mascot from review.html.
function bean(ctx, cx, cy, s) {
  ctx.setStrokeColor(new Color(INK));
  ctx.setLineWidth(2.5 * s);
  const body = rr(cx - 18 * s, cy - 22 * s, 36 * s, 46 * s, 18 * s);
  fill(ctx, body, ORANGE);
  ctx.addPath(body);
  ctx.strokePath();
  fill(ctx, rr(cx - 9 * s, cy + 4 * s, 18 * s, 13 * s, 6.5 * s), "#FFD9B0");
  for (const dx of [-7, 7]) {
    fill(ctx, rr(cx + dx * s - 3.5 * s, cy - 10 * s, 7 * s, 8 * s, 3.5 * s), INK);
    fill(ctx, rr(cx + dx * s - 1 * s, cy - 9 * s, 2.5 * s, 2.5 * s, 1.25 * s), WHITE);
  }
}

function hanziSize(hanzi, base) {
  return [base, base, base * 0.82, base * 0.64, base * 0.52][Math.min(hanzi.length, 4)];
}

function pill(ctx, s, x, y, w, color, align) {
  box(ctx, x, y, w, 24, 12, color, 2.5);
  txt(ctx, s, x + 8, y + 4, w - 16, 18, Font.heavyRoundedSystemFont(12), INK, align || "center");
}

// view = { mode: "new"|"review"|"rest", word, mastered, total, streak, due }
function drawWidget(family, view) {
  const [W, H] = SIZES[family] || SIZES.large;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.respectScreenScale = true;
  const w = view.word;
  stripes(ctx, W, H, SETS[w.id % SETS.length]);

  const label = view.mode === "review" ? "🧠 Ôn bài · " + view.due
    : view.mode === "new" ? "✨ Từ mới!" : "🎉 Xong hôm nay";
  const labelColor = view.mode === "review" ? PINK : view.mode === "new" ? YELLOW : GREEN;
  const score = "🏆 " + view.mastered + "/" + view.total + (view.streak ? "  🔥" + view.streak : "");
  const recall = view.mode === "review";

  if (family === "small") {
    box(ctx, 10, 12, W - 24, H - 26, 20, CREAM);
    if (recall) {
      txt(ctx, w.hanzi, 10, 26, W - 24, 70, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 58)), INK, "center");
      txt(ctx, "Nhớ không? 👀", 10, 104, W - 24, 20, Font.heavyRoundedSystemFont(14), INK, "center");
      txt(ctx, view.due + " từ chờ ôn", 10, 124, W - 24, 18, Font.boldRoundedSystemFont(11), SOFT_INK, "center");
    } else {
      txt(ctx, w.hanzi, 10, 20, W - 24, 58, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 48)), INK, "center");
      txt(ctx, w.pinyin, 10, 78, W - 24, 22, Font.heavyRoundedSystemFont(17), RED, "center");
      box(ctx, 22, 108, W - 48, 32, 12, YELLOW, 2.5);
      txt(ctx, w.nghia, 26, 114, W - 56, 22, Font.heavyRoundedSystemFont(13), INK, "center");
    }
    return ctx.getImage();
  }

  if (family === "medium") {
    box(ctx, 12, 12, W - 28, H - 28, 22, CREAM);
    if (recall) {
      txt(ctx, w.hanzi, 20, 30, 170, 90, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 72)), INK, "center");
      pill(ctx, label, 200, 24, 136, PINK);
      txt(ctx, "Nhớ nghĩa không?", 196, 60, 150, 22, Font.heavyRoundedSystemFont(15), INK, "left");
      txt(ctx, "Chạm để lật thẻ 👆", 196, 84, 150, 20, Font.boldRoundedSystemFont(12), SOFT_INK, "left");
      bean(ctx, 300, 120, 0.7);
    } else {
      txt(ctx, w.hanzi, 22, 22, 150, 64, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 54)), INK, "center");
      txt(ctx, w.pinyin, 22, 86, 150, 22, Font.heavyRoundedSystemFont(17), RED, "center");
      box(ctx, 30, 112, 134, 30, 12, YELLOW, 2.5);
      txt(ctx, w.nghia, 34, 117, 126, 22, Font.heavyRoundedSystemFont(13), INK, "center");
      pill(ctx, label, 186, 22, 150, labelColor);
      const meoFont = w.meo.length > 140 ? 11 : 12;
      txt(ctx, "💡 " + w.meo, 186, 52, 152, 96, Font.semiboldRoundedSystemFont(meoFont), INK, "left");
    }
    return ctx.getImage();
  }

  // Large
  pill(ctx, label, 14, 14, 150, labelColor);
  pill(ctx, score, W - 168, 14, 150, CREAM);
  const cx = 14, cy = 50, cw = W - 32, ch = H - 68;
  box(ctx, cx, cy, cw, ch, 24, CREAM, 5);

  if (recall) {
    txt(ctx, w.hanzi, cx, cy + 40, cw, 120, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 104)), INK, "center");
    txt(ctx, "Nghĩa là gì? Đọc sao ta? 🤔", cx, cy + 180, cw, 24, Font.heavyRoundedSystemFont(17), INK, "center");
    txt(ctx, "Nghĩ trong đầu rồi chạm để lật thẻ", cx, cy + 206, cw, 20, Font.boldRoundedSystemFont(13), SOFT_INK, "center");
    bean(ctx, cx + cw / 2, cy + ch - 42, 1);
    return ctx.getImage();
  }

  const px = cx + 16, pw = cw - 32;
  txt(ctx, w.hanzi, px, cy + 10, 190, 76, Font.heavyRoundedSystemFont(hanziSize(w.hanzi, 64)), INK, "left");
  box(ctx, cx + cw - 146, cy + 18, 130, 46, 14, YELLOW, 3);
  txt(ctx, w.nghia, cx + cw - 142, cy + (w.nghia.length > 14 ? 23 : 31), 122, 40,
    Font.heavyRoundedSystemFont(w.nghia.length > 14 ? 13 : 16), INK, "center");
  txt(ctx, w.pinyin, px, cy + 88, pw, 26, Font.heavyRoundedSystemFont(21), RED, "left");
  txt(ctx, "đọc: " + w.doc + "  ·  Hán Việt: " + w.hanviet, px, cy + 116, pw, 18, Font.boldRoundedSystemFont(12), SOFT_INK, "left");
  txt(ctx, w.vd.zh, px, cy + 142, pw, 22, Font.heavyRoundedSystemFont(16), INK, "left");
  txt(ctx, w.vd.vi, px, cy + 164, pw, 18, Font.italicSystemFont(12), SOFT_INK, "left");

  const my = cy + 190, mh = ch - 190 - 14;
  box(ctx, px, my, pw, mh, 14, WHITE, 0);
  fill(ctx, rr(px, my, 6, mh, 3), YELLOW);
  const meoFont = w.meo.length > 170 ? 11.5 : w.meo.length > 130 ? 13 : w.meo.length > 90 ? 14 : 15;
  txt(ctx, "💡 " + w.meo, px + 14, my + 8, pw - 24, mh - 12, Font.semiboldRoundedSystemFont(meoFont), INK, "left");
  return ctx.getImage();
}
// --- DRAW END ---

function buildWidget(state, words) {
  const now = Date.now();
  rollDay(state, now);
  const s = stats(state, words, now);
  const byHanzi = new Map(words.map(w => [w.hanzi, w]));
  const family = config.widgetFamily || "large";

  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
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

  w.backgroundImage = drawWidget(family, {
    mode, word, mastered: s.mastered, total: s.total, streak: s.streak, due: due.length,
  });
  return w;
}

const wait = ms => new Promise(r => Timer.schedule(ms, false, r));

async function runSession(state, words) {
  const byHanzi = new Map(words.map(w => [w.hanzi, w]));
  const queue = buildSession(state, words, Date.now());

  const wv = new WebView();
  let closed = false;
  const dismissed = wv.present(true).then(() => { closed = true; return null; });
  try {
    await wv.loadURL(SITE + "review.html?v=" + Date.now());
    loadSiteText("review.html").catch(() => {});   // refresh the offline copy
  } catch (e) {
    await wv.loadHTML(await loadSiteText("review.html"), SITE);
  }
  // Wait until the page script has defined its API.
  for (let i = 0; i < 50 && !closed; i++) {
    if (await wv.evaluateJavaScript("typeof showCard === 'function'")) break;
    await wait(200);
  }
  const ask = async js => {
    const res = await Promise.race([
      wv.evaluateJavaScript(`try { ${js} } catch (e) { completion({ error: String(e) }) }`, true), dismissed]);
    if (res && res.error) throw new Error("review.html: " + res.error);
    return res;
  };

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

try {
  const words = JSON.parse(await loadSiteText("words.json"));
  const state = await loadState();

  if (config.runsInWidget) {
    Script.setWidget(buildWidget(state, words));
  } else {
    await runSession(state, words);
    saveState(state);
  }
  try { await scheduleReminder(state, words); } catch (e) { console.log("reminder: " + e); }
} catch (e) {
  // Show the error on screen so it can be screenshotted.
  console.error(e);
  if (config.runsInWidget) {
    const w = new ListWidget();
    w.addText("⚠️ " + e.message);
    Script.setWidget(w);
  } else {
    const a = new Alert();
    a.title = "Lỗi";
    a.message = String(e && e.message || e);
    a.addAction("OK");
    await a.presentAlert();
  }
}
Script.complete();
