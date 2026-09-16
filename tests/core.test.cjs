const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sandbox = { module: { exports: {} } };
vm.runInNewContext(scripts[0], sandbox);
const WF = sandbox.module.exports;

test('all inline scripts compile', () => {
  for (const script of scripts) new vm.Script(script);
});

test('uniform image is inconclusive rather than a high-scoring composition', () => {
  const pixels = new Uint8ClampedArray(64 * 48 * 4).fill(255);
  const result = WF.analyze(pixels, 64, 48);
  assert.equal(result.flat, true);
  assert.ok(Number.isFinite(result.cx));
});

test('mirrored subjects reverse the horizontal balance', () => {
  const make = (mirror) => {
    const pixels = new Uint8ClampedArray(80 * 60 * 4).fill(255);
    for (let y = 15; y < 45; y++) for (let x = 5; x < 25; x++) {
      const i = (y * 80 + (mirror ? 79 - x : x)) * 4;
      pixels[i] = 180; pixels[i + 1] = 30; pixels[i + 2] = 20;
    }
    return WF.analyze(pixels, 80, 60);
  };
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
