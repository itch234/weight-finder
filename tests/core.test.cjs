const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sandbox = { module: { exports: {} } };
vm.runInNewContext(scripts[0], sandbox);
const WF = sandbox.module.exports;

const blank = (w, h) => new Uint8ClampedArray(w * h * 4).fill(255);
const withSubject = (mirror) => {
  const pixels = blank(80, 60);
  for (let y = 15; y < 45; y++) for (let x = 5; x < 25; x++) {
    const i = (y * 80 + (mirror ? 79 - x : x)) * 4;
    pixels[i] = 180; pixels[i + 1] = 30; pixels[i + 2] = 20;
  }
  return pixels;
};

test('all inline scripts compile', () => {
  for (const script of scripts) new vm.Script(script);
});

test('service worker compiles and the manifest lists icons that exist', () => {
  new vm.Script(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
});

test('uniform image is inconclusive rather than a high-scoring composition', () => {
  const result = WF.analyze(blank(64, 48), 64, 48);
  assert.equal(result.flat, true);
  assert.ok(Number.isFinite(result.cx));
});

test('mirrored subjects reverse the horizontal balance', () => {
  const make = (mirror) => WF.analyze(withSubject(mirror), 80, 60);
  const left = make(false), right = make(true);
  assert.ok(left.cx < -0.1 && right.cx > 0.1);
  assert.ok(Math.abs(left.cx + right.cx) < 0.001);
});

test('crop stays centered and inside landscape and portrait inputs', () => {
  for (const [w, h] of [[1200, 800], [800, 1200]]) for (const ratio of [null, 1, 3 / 2, 16 / 9]) {
    const crop = WF.cropRect(w, h, ratio);
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.w <= w && crop.h <= h);
    assert.ok(Math.abs(crop.x * 2 + crop.w - w) < 1e-8);
    assert.ok(Math.abs(crop.y * 2 + crop.h - h) < 1e-8);
  }
});

test('balance and thirds score their target positions at 100', () => {
  assert.equal(WF.evalBalance(0, 0, false).score, 100);
  for (const [x, y] of WF.THIRDS) {
    const result = WF.evalThirds({ x, y }, null, false);
    assert.equal(result.score, 100);
    assert.equal(result.ok, true);
  }
});

test('comparison score is null when nothing can be judged and 0-100 otherwise', () => {
  const flat = WF.analyze(blank(64, 48), 64, 48);
  assert.equal(WF.scoreFor(flat, 'balance'), null);
  assert.equal(WF.scoreFor(flat, 'thirds'), null);
  assert.equal(WF.scoreFor(null, 'balance'), null);
  const res = WF.analyze(withSubject(false), 80, 60);
  const balance = WF.scoreFor(res, 'balance');
  assert.ok(Number.isInteger(balance) && balance >= 0 && balance <= 100);
  assert.ok(balance < 100, 'an off-centre subject must not score a perfect balance');
  const thirds = WF.scoreFor(res, 'thirds');
  assert.ok(thirds === null || (Number.isInteger(thirds) && thirds >= 0 && thirds <= 100));
  assert.equal(WF.scoreFor({ ...res, subject: null }, 'thirds'), null);
});

test('file stamp uses local time and zero padding', () => {
  assert.equal(WF.fileStamp(new Date(2026, 8, 17, 9, 5, 3)), '20260917_090503');
  assert.equal(WF.fileStamp(new Date(2026, 11, 31, 23, 59, 59)), '20261231_235959');
});

test('manual subject keeps its original-image position across crops and excludes cropped-out points', () => {
  const point = { x: 2 / 3, y: 1 / 3 };
  const full = WF.subjectInCrop(point, 1200, 800, null);
  assert.equal(WF.evalThirds(full, null, false).score, 100);
  const square = WF.subjectInCrop(point, 1200, 800, 1);
  assert.ok(Math.abs(square.x - 0.25) < 1e-9);
  assert.ok(Math.abs(square.y + 1 / 6) < 1e-9);
  assert.equal(WF.subjectInCrop({ x: 0.05, y: 0.5 }, 1200, 800, 1), null);
  assert.equal(WF.subjectInCrop({ x: 0.5, y: 0.05 }, 800, 1200, 1), null);
  assert.equal(WF.subjectInCrop({ x: NaN, y: 0.5 }, 800, 1200, 1), null);
});

// ---- ビジュアルウェイト理論の各要因が実際に効いているかの検証 ----
// 比較用の色は CIE Lab で作り、明度・彩度をそろえたうえで一つの要因だけを変える。
const finv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
const enc = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};
function lch(L, C, hDeg) {
  const a = C * Math.cos(hDeg * Math.PI / 180), b = C * Math.sin(hDeg * Math.PI / 180);
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = 0.95047 * finv(fx), Y = finv(fy), Z = 1.08883 * finv(fz);
  return [
    enc(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
    enc(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z),
    enc(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z),
  ];
}
const W = 160, HT = 120;
const GRAY = [128, 128, 128];              // L 53.6
const DARK = [77, 77, 77], LIGHT = [181, 181, 181]; // 背景から上下に同じだけ離れた明度 (L 33.6 / 73.6)
const scene = (bg = GRAY) => {
  const p = new Uint8ClampedArray(W * HT * 4);
  for (let i = 0; i < W * HT; i++) { p[i * 4] = bg[0]; p[i * 4 + 1] = bg[1]; p[i * 4 + 2] = bg[2]; p[i * 4 + 3] = 255; }
  return p;
};
const box = (p, x0, y0, x1, y1, col) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4; p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2];
  }
};
// 同じ大きさの矩形を左右に置き、重心がどちらへ寄るかで重さを比べる
function leftVsRight(colLeft, colRight) {
  const p = scene();
  box(p, 20, 45, 50, 75, colLeft);
  box(p, 110, 45, 140, 75, colRight);
  return WF.analyze(p, W, HT);
}

test('darker elements outweigh lighter ones at the same luminance distance', () => {
  const result = leftVsRight(DARK, LIGHT);
  assert.ok(result.cx < -0.01, `expected the dark side to be heavier, got cx=${result.cx}`);
  assert.ok(result.left > 0.51);
});

test('skin tones outweigh a non-skin hue of identical lightness and chroma', () => {
  const result = leftVsRight(lch(63.9, 42, 59), lch(63.9, 42, 140));
  assert.ok(result.cx < -0.03, `expected the skin side to be heavier, got cx=${result.cx}`);
  assert.ok(result.subject && result.subject.face > 0.5, 'the subject should land on the skin-toned element');
});

test('a skin-coloured background is treated as a colour cast, not as a subject', () => {
  const p = scene([208, 139, 91]);
  box(p, 60, 40, 100, 80, [40, 60, 90]);
  const result = WF.analyze(p, W, HT);
  assert.ok(result.skin > 0.5, 'most of the frame is skin-like');
  assert.ok(Math.abs(result.cx) < 0.02 && Math.abs(result.cy) < 0.02);
  assert.ok(result.subject && Math.abs(result.subject.x) < 0.08, 'the real subject still wins');
});

test('red outweighs yellow, and warm outweighs cool, at equal lightness and chroma', () => {
  assert.ok(leftVsRight(lch(60, 50, 40), lch(60, 50, 95)).cx < -0.02, 'red should outweigh yellow');
  assert.ok(leftVsRight(lch(60, 50, 40), lch(60, 50, 260)).cx < -0.02, 'warm should outweigh cool');
});

test('the upper half carries slightly more weight than the lower half', () => {
  const p = scene();
  box(p, 65, 12, 95, 42, DARK);
  box(p, 65, 78, 95, 108, DARK);
  const result = WF.analyze(p, W, HT);
  assert.ok(result.cy < -0.005, `expected the top blob to be heavier, got cy=${result.cy}`);
  assert.ok(result.top > 0.51);
});

test('an isolated element outweighs the same element surrounded by clutter', () => {
  const p = scene();
  box(p, 28, 50, 44, 66, DARK);
  box(p, 112, 50, 128, 66, DARK);
  for (const [x, y] of [[96, 34], [96, 82], [136, 34], [136, 82], [112, 30], [112, 86]]) box(p, x, y, x + 10, y + 10, DARK);
  const result = WF.analyze(p, W, HT);
  const at = (x, y) => result.map[y * result.w + x];
  assert.ok(at(36, 58) > at(120, 58) * 1.05, 'the isolated element should weigh more per pixel');
});

test('horizontal and vertical balance tolerances are the same', () => {
  assert.equal(WF.TOL_X, WF.TOL_Y);
});

test('in a portrait-like scene the face wins over a bright distractor', () => {
  // 暗めの壁 / 明るい窓 / 暗い服の肩 / 肌色の頭部 という、人物写真に近い合成画像
  const build = (withFace) => {
    const p = scene([96, 98, 104]);
    box(p, 118, 20, 150, 60, [238, 240, 235]);                       // 明るい窓
    for (let y = 70; y < HT; y++) for (let x = 34; x < 86; x++) {    // 肩
      if (Math.abs(x - 60) < 14 + (y - 70) / 50 * 16) box(p, x, y, x + 1, y + 1, [52, 54, 62]);
    }
    if (withFace) {
      for (let y = 34; y < 76; y++) for (let x = 42; x < 78; x++) {  // 頭部
        const dx = (x - 60) / 17, dy = (y - 55) / 21;
        if (dx * dx + dy * dy <= 1) box(p, x, y, x + 1, y + 1, [214, 166, 132]);
      }
      for (let y = 32; y < 46; y++) for (let x = 42; x < 78; x++) {  // 髪
        const dx = (x - 60) / 18, dy = (y - 50) / 20;
        if (dx * dx + dy * dy <= 1) box(p, x, y, x + 1, y + 1, [44, 36, 32]);
      }
    }
    return WF.analyze(p, W, HT);
  };
  const withFace = build(true), noFace = build(false);
  assert.ok(withFace.subject, 'a subject should be found');
  const sx = withFace.subject.x * W + W / 2, sy = withFace.subject.y * HT + HT / 2;
  assert.ok(Math.hypot(sx - 60, sy - 55) < 12, `the subject should sit on the head, got (${sx.toFixed(0)}, ${sy.toFixed(0)})`);
  assert.ok(withFace.subject.face > 0.5);
  assert.ok(noFace.subject.x > 0.25, 'without a face the bright window takes over as the subject');
});
