const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const url = process.env.APP_URL || 'http://127.0.0.1:5189/';
const executablePath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function checkWeather(browser, width, theme) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  try {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({
      json: route.request().url().includes('export-recovery')
        ? []
        : {enabled: true, available: false, currentVersion: '1.0.67'},
    }));
    let remoteMode = null;
    await page.route('**/api/home/weather', route => remoteMode === null
      ? route.fulfill({status: 503, json: {detail: 'Offline'}})
      : route.fulfill({json: {mode: remoteMode}}));
    await page.addInitScript(theme => {
      const setInterval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        if (delay === 60_000) window.refreshWeatherPoll = callback;
        return setInterval(callback, delay, ...args);
      };
      localStorage.setItem('app-startup-page', 'home');
      localStorage.setItem('app-theme', theme);
      window.weatherAudioContexts = [];
      const OriginalAudioContext = window.AudioContext;
      window.AudioContext = class extends OriginalAudioContext {
        constructor(...args) {
          super(...args);
          window.weatherAudioContexts.push(this);
        }
        createGain() {
          const node = super.createGain();
          const connect = node.connect.bind(node);
          node.connect = (destination, ...args) => {
            if (destination === this.destination) {
              const analyser = this.createAnalyser();
              (this.weatherOutputs ??= []).push(analyser);
              connect(analyser);
            }
            return connect(destination, ...args);
          };
          return node;
        }
      };
      window.weatherOutputLevels = () => window.weatherAudioContexts[0]?.weatherOutputs?.map(analyser => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
      });
    }, theme);
    const initialRequest = page.waitForResponse('**/api/home/weather');
    await page.goto(`${url}?startupEpoch=123#/`);
    assert.equal((await initialRequest).status(), 503);
    const refreshMode = async mode => {
      remoteMode = mode;
      const response = page.waitForResponse('**/api/home/weather');
      await page.evaluate(() => window.refreshWeatherPoll());
      await response;
      if (['off', 'rain', 'snow'].includes(mode)) await page.waitForFunction(expected =>
        (document.querySelector('.welcome-page')?.dataset.homeWeather ?? 'off') === expected, mode);
    };
    const rain = page.getByRole('button', {name: 'Rain', exact: true});
    const snow = page.getByRole('button', {name: 'Snow', exact: true});
    const mute = page.getByRole('button', {name: 'Mute weather sound', exact: true});
    const sky = page.locator('.home-weather-sky');
    const surfaces = page.locator('.home-weather-surface');
    const snowman = page.getByRole('group', {name: 'Snowman', exact: true});
    const card = page.getByRole('link', {name: /Legal Platform/});
    await card.waitFor();
    for (const button of [rain, snow, mute]) assert.equal(await button.count(), 0);
    assert.equal(await sky.count(), 0);
    await refreshMode('off');
    await refreshMode('rain');
    assert.equal(await snowman.count(), 0);
    assert.equal(await surfaces.count(), 8);
    await refreshMode(null);
    await refreshMode('invalid');
    assert.equal(await sky.count(), 1);
    const logo = page.getByRole('button', {name: 'Animate INTERSOS home logo'});
    const logoSurface = logo.locator('.home-logo-weather-border > canvas');
    assert.equal(await logoSurface.evaluate(canvas => getComputedStyle(canvas).pointerEvents), 'none');
    await page.waitForFunction(() => window.weatherAudioContexts.length > 0);
    await logo.click();
    await page.waitForFunction(() => window.weatherAudioContexts[0]?.state === 'running');
    await page.waitForFunction(() => {
      const [rain, snow] = window.weatherOutputLevels() || [];
      return rain > 0.003 && snow < 0.001;
    });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.home-weather-sky');
      return canvas && canvas.width >= 390 && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(value => value !== 0);
    });
    const originalFrame = await sky.evaluate(canvas => canvas.toDataURL());
    await page.waitForFunction(original => document.querySelector('.home-weather-sky').toDataURL() !== original, originalFrame);

    for (const label of ['Open on launch', 'Application theme']) {
      const trigger = page.getByRole('button', {name: label, exact: true});
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      const menu = page.getByRole('listbox');
      await menu.waitFor();
      assert.equal(await menu.locator('.home-weather-surface').evaluate(canvas => getComputedStyle(canvas).pointerEvents), 'none');
      await page.keyboard.press('Escape');
      await menu.waitFor({state: 'hidden'});
      assert(await trigger.evaluate(element => element === document.activeElement));
    }

    await page.setViewportSize({width, height: 265});
    const themeTrigger = page.getByRole('button', {name: 'Application theme'});
    await themeTrigger.click();
    const scrollMenu = page.getByRole('listbox');
    assert(await scrollMenu.evaluate(menu => {
      menu.scrollTop = 60;
      return menu.scrollTop > 0;
    }), 'Theme menu scrolls in a short viewport');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[role=listbox] .home-weather-surface');
      const menu = canvas?.parentElement;
      return menu && Math.abs(canvas.getBoundingClientRect().top - menu.getBoundingClientRect().top - menu.clientTop) < 2;
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({width, height: 900});

    const layout = page.locator('.welcome-header-compact, .workspace-cards');
    const layoutPositions = () => layout.evaluateAll(elements => elements.map(element => {
      const {x, y, width, height} = element.getBoundingClientRect();
      return [x, y, width, height];
    }));
    const homePositions = await layoutPositions();
    await refreshMode('snow');
    assert.equal(await page.locator('main.welcome-page').getAttribute('data-home-weather'), 'snow');
    await snowman.waitFor();
    assert.deepEqual(await layoutPositions(), homePositions);
    const snowmanBounds = await snowman.boundingBox();
    assert.equal(snowmanBounds.y + snowmanBounds.height, 900);
    await page.waitForFunction(() => (window.weatherOutputLevels()?.[2] ?? 0) > 0.015);
    await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'magic', null, {timeout: 15000});
    await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.facing === 'left', null, {timeout: 15000});
    const hat = snowman.getByRole('button', {name: /hat/});
    await page.keyboard.press('Tab');
    await hat.focus();
    assert(await hat.evaluate(button => button.matches(':focus-visible')));
    const keyboardPosition = await snowman.evaluate(element => element.style.transform);
    for (const part of ['hat', 'face', 'belly']) {
      await snowman.locator(`[data-part="${part}"]`).press('Enter');
      assert.equal(await snowman.getAttribute('data-animation'), part);
      await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'walk');
    }
    assert.equal(await snowman.evaluate(element => element.style.transform), keyboardPosition);
    await hat.focus();
    const grab = await hat.boundingBox();
    const grabX = grab.x + grab.width / 2;
    const grabY = grab.y + grab.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'pickup', null, {timeout: 2000});
    await page.mouse.move(grabX - 60, grabY - 240, {steps: 8});
    assert((await snowman.boundingBox()).y < snowmanBounds.y - 180);
    await page.mouse.up();
    assert.equal(await snowman.getAttribute('data-animation'), 'falling');
    await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'landing', null, {timeout: 2000});
    const landed = await snowman.boundingBox();
    assert.equal(landed.y, snowmanBounds.y);
    assert(landed.x < grabX - 60);
    await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'walk', null, {timeout: 3000});
    await logo.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.home-logo-weather-border > canvas');
      const ctx = canvas?.getContext('2d');
      if (!ctx) return false;
      const x = Math.floor(canvas.width / 2);
      return ctx.getImageData(x, 1, 1, 1).data[3] > 100
        && ctx.getImageData(x, Math.floor(canvas.height / 2), 1, 1).data[3] === 0;
    });
    await logo.click();
    await page.waitForFunction(() => {
      const [rain, snow] = window.weatherOutputLevels() || [];
      return rain < 0.001 && snow > 0.003;
    });
    const cardSurface = card.locator('.home-weather-surface');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.workspace-card .home-weather-surface');
      return canvas?.getContext('2d').getImageData(4, 2, canvas.width - 8, 1).data.some((value, index) => index % 4 === 3 && value > 100);
    }, null, {timeout: 12000});
    const bounds = await cardSurface.boundingBox();
    await page.mouse.move(bounds.x + 10, bounds.y + 6);
    await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + 6, {steps: 8});
    assert(await cardSurface.evaluate(canvas => Math.abs(canvas.getBoundingClientRect().top - canvas.parentElement.getBoundingClientRect().top) < 3));

    await themeTrigger.click();
    const nextTheme = theme === 'glass-dark' ? 'Liquid Glass Light' : 'Liquid Glass Dark';
    await page.getByRole('option', {name: nextTheme}).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'glass-dark' ? 'glass-light' : 'glass-dark');

    await page.getByRole('button', {name: 'Check for updates'}).click();
    const dialog = page.getByRole('dialog', {name: 'Application update'});
    await dialog.waitFor();
    assert.equal(await sky.count(), 0);
    assert.equal(await snowman.count(), 0);
    await dialog.getByRole('button', {name: 'Close'}).click();
    await sky.waitFor();

    await page.emulateMedia({reducedMotion: 'reduce'});
    await sky.waitFor({state: 'hidden'});
    assert.equal(await cardSurface.evaluate(canvas => getComputedStyle(canvas).visibility), 'hidden');
    assert.equal(await card.evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(179, 207, 228)');
    await page.waitForFunction(() => {
      const element = document.querySelector('.home-snowman');
      if (!element) return false;
      const actor = element.getBoundingClientRect();
      const strip = element.parentElement.getBoundingClientRect();
      return Math.abs(actor.left - strip.left - (strip.width - actor.width) / 2) <= 1;
    }, null, {timeout: 2000});
    for (const part of ['hat', 'face', 'belly']) {
      await snowman.locator(`[data-part="${part}"]`).click();
      assert.equal(await snowman.getAttribute('data-animation'), part);
      assert.match(await snowman.locator('.home-snowman-sprite').evaluate(element => element.style.backgroundPosition), /^60%/);
      await page.waitForFunction(() => document.querySelector('.home-snowman')?.dataset.animation === 'walk');
    }
    await page.getByRole('button', {name: 'Turn on Halloween mode'}).click();
    await page.locator('.halloween-hud').waitFor();
    assert.equal(await sky.count(), 0);
    await page.getByRole('button', {name: 'Turn off Halloween mode'}).click();
    await page.locator('.halloween-transition').waitFor({state: 'detached'});

    await refreshMode('off');
    assert.equal(await surfaces.count(), 0);
    assert.equal(await snowman.count(), 0);
    await page.waitForFunction(() => window.weatherAudioContexts[0]?.state === 'closed');
    await refreshMode('snow');
    await snowman.waitFor();
    await card.click();
    await page.waitForURL(url => url.hash === '#/legal/overview');
    await sky.waitFor({state: 'detached'});
    await snowman.waitFor({state: 'detached'});
    await page.waitForFunction(() => window.weatherAudioContexts.at(-1)?.state === 'closed');
    remoteMode = 'rain';
    const reentry = page.waitForResponse('**/api/home/weather');
    await page.goBack();
    await reentry;
    await page.waitForFunction(() => document.querySelector('.welcome-page')?.dataset.homeWeather === 'rain');
    remoteMode = 'off';
    const foreground = page.waitForResponse('**/api/home/weather');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await foreground;
    await sky.waitFor({state: 'detached'});
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({executablePath});
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['glass-light', 'glass-dark']) {
        await checkWeather(browser, width, theme);
        console.log(`Home weather passed at ${width}px in ${theme}`);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
