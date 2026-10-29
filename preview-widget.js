// Renders the widget art in a browser by shimming Scriptable's DrawContext with <canvas>.
// Run: node preview-widget.js <out.html>   then open the file in Chrome.
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/widget.js", "utf8");
const draw = src.slice(src.indexOf("// --- DRAW START"), src.indexOf("// --- DRAW END"));
const words = require("./words.json");
const longest = words.reduce((a, b) => (b.meo.length > a.meo.length ? b : a));
const four = words.find(w => w.hanzi.length === 4) || words[0];

const shim = `
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
class Color { constructor(hex) { this.hex = hex; } }
class Path {
  constructor() { this.ops = []; }
  addRoundedRect(r, cw) { this.ops.push(c => c.roundRect(r.x, r.y, r.width, r.height, cw)); }
  addLines(p) { this.ops.push(c => { c.moveTo(p[0].x, p[0].y); p.slice(1).forEach(q => c.lineTo(q.x, q.y)); }); }
  closeSubpath() { this.ops.push(c => c.closePath()); }
}
const WEIGHT = { heavyRoundedSystemFont: "800", boldRoundedSystemFont: "700", semiboldRoundedSystemFont: "600", italicSystemFont: "italic 400" };
const Font = new Proxy({}, { get: (_, n) => size => ({ css: (WEIGHT[n] || "400") + " " + size + "px Nunito, 'Microsoft YaHei', sans-serif", size }) });
class DrawContext {
  set size(s) {
    this.cv = document.createElement("canvas");
    this.cv.width = s.width * 3; this.cv.height = s.height * 3;
    this.cv.style.width = s.width + "px"; this.cv.style.height = s.height + "px";
    this.c = this.cv.getContext("2d"); this.c.scale(3, 3); this.align = "left";
  }
  addPath(p) { this.c.beginPath(); p.ops.forEach(o => o(this.c)); }
  fillPath() { this.c.fill(); }
  strokePath() { this.c.stroke(); }
  setFillColor(col) { this.c.fillStyle = col.hex; }
  setStrokeColor(col) { this.c.strokeStyle = col.hex; }
  setLineWidth(w) { this.c.lineWidth = w; }
  setFont(f) { this.font = f; }
  setTextColor(col) { this.color = col.hex; }
  setTextAlignedLeft() { this.align = "left"; }
  setTextAlignedCenter() { this.align = "center"; }
  setTextAlignedRight() { this.align = "right"; }
  drawTextInRect(s, r) {
    const c = this.c; c.save(); c.beginPath(); c.rect(r.x, r.y, r.width, r.height); c.clip();
    c.font = this.font.css; c.fillStyle = this.color; c.textBaseline = "top"; c.textAlign = this.align;
    const lines = []; let line = "";
    for (const tok of s.split(/(?<=\\s)|(?=[\\u4e00-\\u9fff])/)) {
      if (line && c.measureText(line + tok).width > r.width) { lines.push(line); line = tok.trimStart(); }
      else line += tok;
    }
    lines.push(line);
    const x = this.align === "center" ? r.x + r.width / 2 : this.align === "right" ? r.x + r.width : r.x;
    lines.forEach((l, i) => c.fillText(l, x, r.y + i * this.font.size * 1.2));
    c.restore();
  }
  getImage() { return this.cv; }
}`;

const cases = [
  ["large", "new", words[0]], ["large", "review", words[0]], ["large", "new", longest],
  ["large", "rest", four], ["medium", "new", words[0]], ["medium", "review", words[11]],
  ["small", "new", words[0]], ["small", "review", words[11]],
];

const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
<style>body{margin:0;padding:16px;background:#3a3036;display:flex;flex-wrap:wrap;gap:16px;font:12px sans-serif;color:#ccc}
figure{margin:0}canvas{border-radius:22px;display:block}</style>
<script>${shim}\n${draw}
const cases = ${JSON.stringify(cases)};
document.fonts.load("800 12px Nunito").then(() => {
  for (const [family, mode, word] of cases) {
    const f = document.createElement("figure");
    f.append(drawWidget(family, { mode, word, mastered: 128, total: 1009, streak: 6, due: 3 }));
    f.append(family + " / " + mode + " / " + word.hanzi);
    document.body.append(f);
  }
});
</script>`;

fs.writeFileSync(process.argv[2] || "widget-preview.html", html);
console.log("longest meo:", longest.hanzi, longest.meo.length, "chars");
