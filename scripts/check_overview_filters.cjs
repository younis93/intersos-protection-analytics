const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const created = [];
const temporary = ['frontend/src/overviewCheckComponent.tsx', 'frontend/src/overviewCheck.tsx', 'frontend/overview-check.html'].map(name => path.join(root, name));

(async () => {
  let browser;
  try {
    for (const file of temporary) assert(!fs.existsSync(file), `Temporary file already exists: ${file}`);
    created.push(temporary[0]);
    fs.writeFileSync(temporary[0], fs.readFileSync(path.join(root, 'frontend/src/LegalPlatform.tsx'), 'utf8') + '\nexport {Overview};\n');
    created.push(temporary[1]);
    fs.writeFileSync(temporary[1], `import React from 'react';import {createRoot} from 'react-dom/client';import {Overview} from './overviewCheckComponent';import './styles.css';
      const metadata:any={ready:true,revision:'test',features:{awareness:true,detention:false,deportation:false},overview:{beneficiaries:10,assessments:8,services:6,fees:2,followups:3,awareness:4}};
      createRoot(document.getElementById('root')!).render(<div className="app-shell legal-shell"><aside className="sidebar"><nav><button>Overview</button><button>Indicator Reporting</button></nav></aside><main className="main"><header className="topbar legal-header"><h1>Overview</h1><div id="legal-header-scroll-controls"/></header><section className="content legal-content"><Overview metadata={metadata} theme="glass-light"/></section></main></div>);`);
    created.push(temporary[2]);
    fs.writeFileSync(temporary[2], '<div id="root"></div><script type="module" src="/src/overviewCheck.tsx"></script>');
    browser = await chromium.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
    const page = await browser.newPage();
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(String(error)));
    const groups = [{dataset: 'beneficiaries', label: 'Beneficiary', columns: [{key: 'beneficiaries::Nationality', name: 'Nationality', values: ['Iraq', 'Syria']}]}, {dataset: 'legalfees', label: 'Legal fee', columns: [{key: 'legalfees::Fee ID', name: 'Fee ID', values: ['F1']}]}];
    await page.route('**/api/legal/overview', async route => {
      const selection = route.request().postDataJSON();
      calls.push(selection);
      if (selection.projects.includes('Fail')) return route.fulfill({status: 500, contentType: 'application/json', body: '{"detail":"Overview test failure"}'});
      const advanced = Object.values(selection.filters).some(values => values.length);
      const filtered = selection.projects.length || selection.locations.length || selection.months.length || advanced;
      const overview = {beneficiaries: filtered ? 1 : 10, assessments: filtered ? 2 : 8, services: filtered ? 3 : 6, fees: 2, followups: 3, awareness: advanced ? null : 4};
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({overview, filterOptions: {projects: ['P1', 'P2', 'Fail'], locations: ['L1', 'L2'], months: ['2026-01', '2026-02'], groups}, unavailable: advanced ? ['awareness'] : []})});
    });
    const url = (process.env.APP_TEST_URL || 'http://127.0.0.1:5185') + '/overview-check.html';
    const waitForRefresh = async () => {
      await page.waitForFunction(() => !document.querySelector('.overview-filter-status'));
    };
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(url);
    await page.getByRole('button', {name: 'All project', exact: true}).waitFor();
    await waitForRefresh();
    const toolbar = page.locator('.overview-filter-bar');
    const toolbarBox = await toolbar.boundingBox();
    const contentBox = await page.locator('.legal-content').boundingBox();
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    assert(toolbarBox.x >= sidebarBox.x + sidebarBox.width, 'Toolbar overlaps left navigation');
    assert(toolbarBox.x >= contentBox.x && toolbarBox.x + toolbarBox.width <= contentBox.x + contentBox.width + 1, 'Toolbar exceeds content pane');
    await toolbar.getByRole('button', {name: 'All project', exact: true}).click();
    await page.getByRole('checkbox', {name: 'P1', exact: true}).check();
    await page.locator('h1').click();
    await waitForRefresh();
    assert.equal(calls.at(-1).projects[0], 'P1');
    assert.equal(await page.locator('.executive-kpi').first().locator('strong').textContent(), '1');
    await toolbar.getByRole('button', {name: /Filters/}).click();
    await page.locator('.case-filter-drawer').getByPlaceholder('Search filters').fill('Nationality');
    assert.equal(await page.locator('.case-filter-drawer details').count(), 1);
    await page.locator('.case-filter-drawer summary').click();
    await page.getByRole('checkbox', {name: 'Iraq', exact: true}).check();
    await page.getByRole('button', {name: 'Apply filters', exact: true}).click();
    await waitForRefresh();
    assert.deepEqual(calls.at(-1).filters, {'beneficiaries::Nationality': ['Iraq']});
    await page.getByText('Unavailable for selected case filters', {exact: true}).waitFor();
    await page.locator('.active-filters button').filter({hasText: 'Beneficiary'}).click();
    await waitForRefresh();
    assert.deepEqual(calls.at(-1).filters['beneficiaries::Nationality'], []);
    await toolbar.getByRole('button', {name: 'Reset all', exact: true}).click();
    await waitForRefresh();
    assert.equal(await page.locator('.executive-kpi').first().locator('strong').textContent(), '10');
    await toolbar.getByRole('button', {name: 'All project', exact: true}).click();
    await page.getByRole('checkbox', {name: 'Fail', exact: true}).check();
    await page.locator('h1').click();
    await page.getByRole('alert').waitFor();
    await toolbar.getByRole('button', {name: 'Reset all', exact: true}).click();
    await waitForRefresh();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({width, height: 900});
      await page.goto(url);
      await page.getByRole('button', {name: 'All project', exact: true}).waitFor();
      await waitForRefresh();
      const box = await toolbar.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1, `Toolbar overflow at ${width}`);
      await toolbar.getByRole('button', {name: 'All project', exact: true}).click();
      const menu = page.locator('.checkbox-multi-menu');
      const menuBox = await menu.boundingBox();
      assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1, `Dropdown overflow at ${width}`);
      await page.locator('h1').click();
      await page.screenshot({path: path.join(root, `output/overview-filters-${width}.png`), fullPage: true});
    }
    // Trigger the same compact header controls used by Indicator Reporting.
    await page.locator('.legal-content').evaluate(node => {node.style.height = '400px'; node.style.overflow = 'auto'; node.scrollTop = 300;});
    await page.locator('#legal-header-scroll-controls .header-filter-actions').waitFor({timeout: 5000});
    assert.equal(await page.locator('#legal-header-scroll-controls .checkbox-multi-select').count(), 3);
    assert.deepEqual(errors, []);
    console.log('Overview filters: selection, drawer, apply, remove, reset, errors, desktop/mobile layout, dropdowns, and compact scroll controls passed.');
  } finally {
    if (browser) await browser.close();
    for (const file of created) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
