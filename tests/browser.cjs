// Optional browser checks: install Playwright (or playwright-core) and provide an existing browser.
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('playwright-core')); }
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.addInitScript(() => {
      window.cameraTracks = [];
      window.cameraRequests = [];
      window.mockFacing = 'environment';
      window.mockDevices = [{ kind: 'videoinput', deviceId: 'back' }, { kind: 'videoinput', deviceId: 'front' }];
      navigator.mediaDevices.enumerateDevices = async () => window.mockDevices;
      window.makeStream = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, 320, 480);
        const stream = canvas.captureStream(10);
        for (const track of stream.getTracks()) {
          track.getSettings = () => ({ facingMode: window.mockFacing, deviceId: window.mockFacing === 'user' ? 'front' : 'back' });
          window.cameraTracks.push(track);
        }
        return stream;
      };
      navigator.mediaDevices.getUserMedia = (constraints) => new Promise((resolve, reject) => {
        window.cameraRequests.push(constraints);
        window.rejectCamera = () => reject(new DOMException('denied', 'NotAllowedError'));
        window.resolveCamera = () => resolve(window.makeStream());
      });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
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
      assert.ok(await page.locator('#shootBtn').isVisible());
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Saving the crop downloads a timestamped JPEG of the current frame.
    assert.equal(await page.locator('#shootBtn').innerText(), 'この枠で保存');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#shootBtn').click()]);
    assert.match(download.suggestedFilename(), /^weight-finder_\d{8}_\d{6}\.jpg$/);
    const saved = path.join(output, 'crop.jpg');
    await download.saveAs(saved);
    assert.ok(fs.statSync(saved).size > 1000);
    assert.equal(fs.readFileSync(saved).readUInt16BE(0), 0xFFD8, 'saved file is a JPEG');
    await page.locator('#toast.show').waitFor();
    assert.equal(await page.locator('#toast').innerText(), '保存しました');
    const [spaceDownload] = await Promise.all([page.waitForEvent('download'), page.locator('body').press(' ')]);
    assert.match(spaceDownload.suggestedFilename(), /\.jpg$/);

    // Mode and ratio survive a reload.
    await page.reload();
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    assert.equal(await page.locator('[data-mode="thirds"]').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#ratioVal').innerText(), '3:2');
    await page.locator('[data-mode="balance"]').click();
    await page.locator('#mapBtn').click();

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
    assert.ok(await page.locator('#strip').isHidden(), 'a single photo shows no comparison strip');

    // Several photos are scored side by side; the best one is marked and can be selected.
    const centred = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 960; c.height = 640;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#cddde0'; ctx.fillRect(0, 0, 960, 640);
      ctx.fillStyle = '#e6ad49'; ctx.beginPath(); ctx.arc(480, 320, 90, 0, Math.PI * 2); ctx.fill();
      return c.toDataURL('image/png');
    });
    const second = { name: 'centred.png', mimeType: 'image/png', buffer: Buffer.from(centred.split(',')[1], 'base64') };
    await page.locator('#fileIn').setInputFiles([file, second, { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('nope') }]);
    await page.locator('#strip').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#strip button').count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll('#strip .badge')].every(b => /^(\d+|--|×)$/.test(b.textContent)));
    const badges = await page.locator('#strip .badge').allInnerTexts();
    assert.match(badges[0], /^\d+$/); assert.match(badges[1], /^\d+$/); assert.equal(badges[2], '×');
    assert.ok(Number(badges[1]) > Number(badges[0]), 'the centred subject scores higher on balance');
    assert.equal(await page.locator('#strip .badge.best').count(), 1);
    assert.equal(await page.locator('#strip button').nth(0).getAttribute('aria-current'), 'true');
    await page.locator('#strip button').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('#strip button')[1].getAttribute('aria-current') === 'true');
    await page.waitForFunction(() => Number(document.getElementById('score').textContent) >= 90);
    await page.locator('#ratioBtn').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#strip .badge')].every(b => /^(\d+|--|×)$/.test(b.textContent)));
    await page.screenshot({ path: path.join(output, 'mobile-compare.png') });
    await page.locator('#photoBtn').focus();
    await page.locator('#strip button').nth(1).focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelectorAll('#strip button')[0].getAttribute('aria-current') === 'true');

    // Dropping files loads them like the picker does.
    const dropped = await page.evaluateHandle(([a, b]) => {
      const dt = new DataTransfer();
      const toFile = (d, name) => { const bin = atob(d.split(',')[1]); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new File([arr], name, { type: 'image/png' }); };
      dt.items.add(toFile(a, 'a.png')); dt.items.add(toFile(b, 'b.png'));
      return dt;
    }, [photo, centred]);
    await page.dispatchEvent('#vf', 'dragenter', { dataTransfer: dropped });
    assert.ok(await page.locator('.drop-hint').isVisible());
    await page.dispatchEvent('#vf', 'drop', { dataTransfer: dropped });
    assert.ok(await page.locator('.drop-hint').isHidden());
    await page.waitForFunction(() => document.querySelectorAll('#strip button').length === 2);

    // Camera: denial, late permission, input races, flip with mirroring, pause and cleanup.
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
    assert.ok(await page.locator('#strip').isHidden(), 'closing clears the comparison strip');
    await page.locator('#startBtn').click();
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    await page.evaluate(() => window.resolveCamera());
    await page.waitForFunction(() => cameraTracks.every(t => t.readyState === 'ended'));
    assert.match(await page.locator('#sourceLabel').innerText(), /写真/);
    await page.locator('#pauseBtn').click();
    await page.evaluate(() => window.resolveCamera());
    await page.waitForFunction(() => document.getElementById('sourceLabel').textContent.includes('ライブ'));
    assert.equal(await page.locator('#shootBtn').innerText(), '撮影');
    await page.locator('#flipBtn').waitFor({ state: 'visible' });
    assert.ok(!await page.locator('#frame').evaluate(el => el.classList.contains('mirror')));
    const [shot] = await Promise.all([page.waitForEvent('download'), page.locator('#shootBtn').click()]);
    assert.match(shot.suggestedFilename(), /\.jpg$/);
    await page.evaluate(() => { window.mockFacing = 'user'; navigator.mediaDevices.getUserMedia = async (c) => { window.cameraRequests.push(c); return window.makeStream(); }; });
    await page.locator('#flipBtn').click();
    await page.waitForFunction(() => document.getElementById('frame').classList.contains('mirror'));
    const last = await page.evaluate(() => window.cameraRequests[window.cameraRequests.length - 1]);
    assert.equal(last.video.facingMode.ideal, 'user');
    await page.evaluate(() => { window.mockFacing = 'environment'; });
    await page.locator('#flipBtn').click();
    await page.waitForFunction(() => !document.getElementById('frame').classList.contains('mirror'));
    await page.locator('#pauseBtn').click();
    assert.match(await page.locator('#sourceLabel').innerText(), /一時停止/);
    await page.screenshot({ path: path.join(output, 'mobile-camera-paused.png') });
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
    // Manual subjects work even on a uniform image, survive crops, and reset explicitly.
    await page.locator('[data-mode="thirds"]').click();
    while (await page.locator('#ratioVal').innerText() !== 'フル') await page.locator('#ratioBtn').click();
    const transparent = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400;
      return c.toDataURL('image/png').split(',')[1];
    });
    const clearFile = { name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') };
    await page.locator('#fileIn').setInputFiles([clearFile, { ...clearFile, name: 'second.png' }]);
    await page.waitForFunction(() => document.getElementById('score').textContent === '--');
    const preview = page.locator('#frame');
    const rect = await preview.boundingBox();
    await preview.click({ position: { x: rect.width * 2 / 3, y: rect.height / 3 } });
    const manualScore = await page.locator('#score').innerText();
    assert.ok(Number(manualScore) >= 98, 'tap coordinates may round to display pixels');
    assert.match(await page.locator('#status').innerText(), /手動指定/);
    await page.waitForFunction(() => document.querySelector('#strip button:last-child').textContent === '--');
    assert.equal(await page.locator('#strip button').first().innerText(), manualScore);
    await page.locator('#strip button').last().click();
    await page.waitForFunction(() => document.getElementById('autoSubjectBtn').hidden);
    assert.equal(await page.locator('#score').innerText(), '--');
    await page.locator('#strip button').first().click();
    await page.waitForFunction(score => document.getElementById('score').textContent === score, manualScore);
    const newRect = await preview.boundingBox();
    await preview.click({ position: { x: newRect.width * 0.05, y: newRect.height / 2 } });
    while (await page.locator('#ratioVal').innerText() !== '1:1') await page.locator('#ratioBtn').click();
    assert.equal(await page.locator('#score').innerText(), '--');
    assert.match(await page.locator('#status').innerText(), /枠外/);
    await preview.focus(); await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('#score').innerText(), /^\d+$/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#score').innerText(), '--');
    assert.ok(await page.locator('#autoSubjectBtn').isHidden());
    // Transparent input is flattened to the same white in preview, analysis and JPEG.
    const [whiteDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#shootBtn').click()]);
    const whitePath = path.join(output, 'transparent-white.jpg');
    await whiteDownload.saveAs(whitePath);
    const whiteJpeg = fs.readFileSync(whitePath).toString('base64');
    const rgb = await page.evaluate(async (data) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + data; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 1;
      c.getContext('2d').drawImage(img, 0, 0, 1, 1);
      return Array.from(c.getContext('2d').getImageData(0, 0, 1, 1).data);
    }, whiteJpeg);
    assert.ok(rgb.slice(0, 3).every(v => v >= 254));
    await page.locator('#closeBtn').click();
    await page.locator('#demoBtn').click();
    await page.waitForFunction(() => !document.body.classList.contains('no-source'));
    await preview.focus(); await page.keyboard.press('ArrowRight');
    for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const bounds = await preview.boundingBox();
      assert.ok(bounds.width > 10 && bounds.height > 10, 'manual controls leave room for the photo');
      assert.ok(await page.locator('#autoSubjectBtn').isVisible());
    }
    await page.screenshot({ path: path.join(output, 'manual-subject.png') });
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: demo, responsive layout, modes, save/download, preferences, invalid images, photo comparison, drag & drop, camera denial, input races, flip/mirror, pause/resume, track cleanup.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
