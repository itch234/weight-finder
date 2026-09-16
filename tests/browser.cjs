// Optional browser checks: install Playwright and provide an existing browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(root, 'index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.addInitScript(() => {
      window.cameraTracks = [];
      navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => {
        window.rejectCamera = () => reject(new DOMException('denied', 'NotAllowedError'));
        window.resolveCamera = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = 480;
          canvas.getContext('2d').fillRect(0, 0, 320, 480);
          const stream = canvas.captureStream(10);
          window.cameraTracks.push(...stream.getTracks());
          resolve(stream);
        };
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    assert.ok(!await page.locator('#instr').innerText().then(t => t.includes('カメラを')));
    assert.match(await page.locator('#score').innerText(), /^\d+$/);
    await page.locator('[data-mode="balance"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-mode="thirds"]').getAttribute('aria-checked'), 'true');
    await page.locator('#ratioBtn').click();
    assert.equal(await page.locator('#ratioVal').innerText(), '3:2');
    await page.locator('#mapBtn').click();
    await page.screenshot({ path: path.join(output, 'mobile-photo.png') });
    for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      const bounds = await page.locator('#closeBtn').boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= size.height);
      assert.ok(await page.locator('#frame').isVisible());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fileIn').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
    await page.locator('#error').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#frame').isVisible(), 'bad upload preserves the previous photo');
    const photo = await page.locator('#still').evaluate(canvas => canvas.toDataURL('image/png'));
    const file = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') };
    for (let i = 0; i < 2; i++) {
      await page.locator('#fileIn').setInputFiles(file);
      await page.waitForFunction(() => document.getElementById('fileIn').value === '' && document.getElementById('error').hidden);
      assert.ok(await page.locator('#frame').isVisible());
    }
    await page.locator('#pauseBtn').click();
    await page.evaluate(() => window.rejectCamera());
    await page.locator('#pauseBtn:not([disabled])').waitFor();
    assert.match(await page.locator('#error').innerText(), /許可/);
    assert.ok(await page.locator('#frame').isVisible());
    await page.locator('#pauseBtn').click();
    await page.locator('#closeBtn').click();
    await page.evaluate(() => window.resolveCamera());
    await page.waitForFunction(() => cameraTracks.length && cameraTracks.every(t => t.readyState === 'ended'));
    assert.ok(await page.locator('#intro').isVisible(), 'late permission must not reopen a closed session');
    await page.locator('#startBtn').click();
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    await page.evaluate(() => window.resolveCamera());
    await page.waitForFunction(() => cameraTracks.every(t => t.readyState === 'ended'));
    assert.match(await page.locator('#sourceLabel').innerText(), /写真/);
    await page.locator('#pauseBtn').click();
    await page.evaluate(() => window.resolveCamera());
    await page.waitForFunction(() => document.getElementById('sourceLabel').textContent.includes('ライブ'));
    await page.locator('#pauseBtn').click();
    assert.match(await page.locator('#sourceLabel').innerText(), /一時停止/);
    await page.locator('#pauseBtn').click();
    await page.waitForFunction(() => document.getElementById('sourceLabel').textContent.includes('ライブ'));
    await page.locator('#closeBtn').click();
    assert.ok(await page.evaluate(() => cameraTracks.every(t => t.readyState === 'ended')));
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    });
    await page.locator('#pauseBtn').click();
    await page.locator('#error').waitFor({ state: 'visible', timeout: 12000 });
    assert.match(await page.locator('#sourceLabel').innerText(), /写真/);
    assert.ok(await page.locator('#frame').isVisible(), 'camera without frames preserves the photo');
    assert.equal(await page.locator('#pauseBtn').isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: demo, responsive layout, modes, invalid images, camera denial, input races, pause/resume, track cleanup.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
