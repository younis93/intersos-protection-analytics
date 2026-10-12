const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({json: route.request().url().includes('/legal/metadata')
      ? {ready: false, availability: {}, sheets: [], features: {}}
      : {available: false}}));
    await page.clock.install();
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');
    const reveal = page.getByRole('button', {name: 'Reveal the cartoon boy'});
    const boy = page.getByRole('button', {name: 'Cartoon boy: click to wave, or drag to move'});
    await reveal.click();
    assert.equal(await boy.count(), 1);
    assert.equal(await boy.getAttribute('data-activity'), 'greeting');
    await page.clock.fastForward(2500);
    assert.equal(await boy.getAttribute('data-activity'), 'idle');
    await boy.focus();
    await page.keyboard.press('Enter');
    assert.equal(await boy.getAttribute('data-activity'), 'greeting');
    await page.clock.fastForward(2500);
    await page.clock.fastForward(8100);
    assert.equal(await boy.getAttribute('data-activity'), 'thinking');
    await page.clock.fastForward(4100);
    assert.equal(await boy.getAttribute('data-activity'), 'reading');
    await page.clock.fastForward(6600);
    assert.equal(await boy.getAttribute('data-activity'), 'idle');
    await page.clock.fastForward(4600);
    assert.equal(await boy.getAttribute('data-activity'), 'walking');
    assert(await boy.locator('.boy-leg').evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 1)));
    assert(await boy.evaluate(node => {
      const parts = [...node.querySelectorAll('.boy-leg,.boy-shin')].flatMap(part => part.getAnimations());
      for (let time = 0; time < 780; time += 40) {
        parts.forEach(animation => {animation.pause();animation.currentTime = time});
        const front = node.querySelector('.boy-shin-front path:nth-child(2)').getBoundingClientRect();
        const back = node.querySelector('.boy-shin-back path:nth-child(2)').getBoundingClientRect();
        if (front.x + front.width / 2 >= back.x + back.width / 2) return false;
      }
      parts.forEach(animation => animation.play());
      return true;
    }), 'The front-facing walk must keep the feet from crossing through each other');
    await page.clock.fastForward(15000);
    await page.clock.fastForward(4600);
    assert.equal(await boy.getAttribute('data-activity'), 'playing');
    const ballTravel = await boy.locator('.boy-ball').evaluate(node => {
      const animation = node.getAnimations().find(item => item.animationName === 'boy-ball-bounce');
      animation.pause();animation.currentTime = 0;
      const before = node.querySelector('circle').getBoundingClientRect();
      animation.currentTime = 540;
      const after = node.querySelector('circle').getBoundingClientRect();
      return Math.hypot(after.x + after.width / 2 - before.x - before.width / 2, after.y + after.height / 2 - before.y - before.height / 2);
    });
    assert(ballTravel > 15 && ballTravel < 40, 'Ball must bounce beside the foot rather than orbit around the SVG origin');
    await page.clock.fastForward(4600);
    assert.equal(await boy.getAttribute('data-activity'), 'sitting');
    await page.clock.fastForward(5100);
    assert.equal(await boy.getAttribute('data-activity'), 'idle');
    await page.clock.fastForward(4600);
    assert.equal(await boy.getAttribute('data-activity'), 'stretching');
    await page.clock.fastForward(3300);
    assert.equal(await boy.getAttribute('data-activity'), 'looking');
    await page.clock.fastForward(3700);
    assert.equal(await boy.getAttribute('data-activity'), 'celebrating');
    await page.clock.fastForward(2300);
    await boy.evaluate(node => node.getAnimations({subtree: true}).forEach(animation => {
      if (animation.effect.getTiming().iterations !== Infinity) animation.finish();
    }));
    const box = await boy.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 130, {steps: 8});
    assert.equal(await boy.getAttribute('data-dragging'), 'true');
    await page.mouse.up();
    assert.equal(await boy.getAttribute('data-landing'), 'true');
    const landingTiming = await boy.evaluate(node => ({
      fall: parseFloat(getComputedStyle(node).getPropertyValue('--boy-drop-ms')),
      impact: node.querySelector('.boy-rig').getAnimations().find(animation => animation.animationName === 'boy-fall-tumble').effect.getTiming().delay,
    }));
    assert.equal(landingTiming.fall, landingTiming.impact, 'The landing reaction must start when the feet reach the floor');
    const completeRecovery = async (targetPage, targetBoy) => {
      await targetPage.waitForFunction(() => document.querySelector('.cartoon-home-avatar').dataset.recovery === 'falling');
      await targetPage.clock.fastForward(1150);
      assert.equal(await targetBoy.getAttribute('data-recovery'), 'down');
      await targetPage.clock.fastForward(700);
      assert.equal(await targetBoy.getAttribute('data-recovery'), 'getting-up');
      await targetPage.clock.fastForward(1300);
      assert.equal(await targetBoy.getAttribute('data-recovery'), null);
    };
    await completeRecovery(page, boy);
    assert.equal(await boy.getAttribute('data-landing'), null);
    for (const theme of ['glass-light', 'glass-dark', 'unhcr', 'multicolor', 'executive']) {
      await page.evaluate(value => {document.documentElement.dataset.theme = value}, theme);
      await boy.focus();
      await page.keyboard.press('Space');
      assert.equal(await boy.getAttribute('data-activity'), 'greeting');
    }
    const startWalking = async () => {
      await page.getByRole('button', {name: 'Hide the cartoon boy'}).click();
      await reveal.click();
      for (const time of [2500, 8100, 4100, 6600, 4600]) await page.clock.fastForward(time);
      assert.equal(await boy.getAttribute('data-activity'), 'walking');
      await page.waitForFunction(() => document.querySelector('.cartoon-home-avatar').getAnimations().some(animation => animation.constructor.name === 'CSSTransition'));
      await boy.evaluate(node => {
        const travel = node.getAnimations().find(animation => animation.constructor.name === 'CSSTransition');
        travel.pause();travel.currentTime = Number(travel.effect.getTiming().duration) * .75;
      });
    };
    await startWalking();
    const walkingBox = await boy.boundingBox();
    await boy.focus();await page.keyboard.press('Enter');
    assert.equal(await boy.getAttribute('data-activity'), 'greeting');
    assert(Math.abs((await boy.boundingBox()).x - walkingBox.x) < 1, 'A wave must stop the walk at its current position');
    assert(await boy.evaluate(node => !node.getAnimations().some(animation => animation.constructor.name === 'CSSTransition')));
    await startWalking();
    const backgroundBox = await boy.boundingBox();
    await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true});document.dispatchEvent(new Event('visibilitychange'))});
    await page.waitForFunction(() => document.querySelector('.cartoon-home-avatar').dataset.paused === 'true');
    assert(Math.abs((await boy.boundingBox()).x - backgroundBox.x) < 1, 'Hiding the tab must stop travel');
    await page.evaluate(() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
    await page.waitForFunction(() => !document.querySelector('.cartoon-home-avatar').dataset.paused);
    await startWalking();
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForFunction(() => document.querySelector('.cartoon-home-avatar').dataset.activity === 'idle');
    const mobile = await boy.boundingBox();
    assert(mobile.x >= 0 && mobile.x + mobile.width <= 390 && mobile.y >= 0 && mobile.y + mobile.height <= 844, JSON.stringify(mobile));
    const lift = async () => {
      const rect = await boy.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width / 2 - 50, rect.y + rect.height / 2 - 110, {steps: 5});
      assert.equal(await boy.getAttribute('data-dragging'), 'true');
      assert.equal(await boy.locator('.boy-shadow').evaluate(node => getComputedStyle(node).opacity), '0');
    };
    await lift();
    await boy.evaluate(node => node.releasePointerCapture(1));
    await page.mouse.up();
    await completeRecovery(page, boy);
    assert.equal(await boy.getAttribute('data-dragging'), null);
    await boy.click();
    assert.equal(await boy.getAttribute('data-activity'), 'greeting', 'A fresh click after lost capture must not be swallowed');
    await lift();
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.waitForFunction(() => document.querySelector('.cartoon-home-avatar').dataset.activity === 'idle');
    assert.equal(await boy.getAttribute('data-dragging'), null);
    assert.equal(await boy.getAttribute('data-landing'), null);
    await page.mouse.up();
    await boy.focus();
    await page.keyboard.press('Enter');
    assert.equal(await boy.evaluate(node => node.getAnimations({subtree: true}).length), 0);
    await page.getByRole('button', {name: 'Hide the cartoon boy'}).click();
    assert.equal(await boy.count(), 0);
    await reveal.click();
    assert.equal(await boy.count(), 1);
    await page.getByRole('link', {name: /Enter workspace/}).click();
    await page.waitForURL('**/#/legal/overview');
    assert.equal(await boy.count(), 0);
    assert.deepEqual(errors, []);
    const touchPage = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.route('**/api/**', route => route.fulfill({json: {available: false}}));
    await touchPage.clock.install();
    await touchPage.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');
    await touchPage.getByRole('button', {name: 'Reveal the cartoon boy'}).tap();
    const touchBoy = touchPage.locator('.cartoon-home-avatar');
    const touchBox = await touchBoy.boundingBox();
    const client = await touchPage.context().newCDPSession(touchPage);
    const start = {x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2, id: 1};
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [start]});
    await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{...start, x: start.x + 60, y: start.y - 120}]});
    assert.equal(await touchBoy.getAttribute('data-dragging'), 'true');
    await client.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    await completeRecovery(touchPage, touchBoy);
    assert.equal(await touchBoy.getAttribute('data-dragging'), null);
    assert.equal(await touchBoy.getAttribute('data-landing'), null);
    await touchBoy.tap();
    assert.equal(await touchBoy.getAttribute('data-activity'), 'greeting');
    assert.deepEqual(errors, []);
    console.log('PASS: all poses, foot/ball geometry, walking interruptions, background pause, resize during travel, mouse/touch drag and cancellation, synchronized landing, reduced-motion changes, keyboard, themes, show/hide, and route cleanup.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1});
