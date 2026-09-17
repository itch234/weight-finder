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
