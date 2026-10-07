const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const fixture = path.join(root, 'frontend/src/valueAlignmentCheck.tsx');
const html = path.join(root, 'frontend/value-alignment-check.html');
const created = [];

(async () => {
  let browser;
  try {
    assert(!fs.existsSync(fixture) && !fs.existsSync(html), 'Alignment fixture already exists');
    created.push(fixture);
    fs.writeFileSync(fixture, `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ValueTable} from './ValueTable';import './styles.css';
      function Fixture(){const [name,setName]=useState('عبدالهادي موفق حسين'),[more,setMore]=useState(false);return <main className="legal-shell" style={{padding:20}}><button onClick={()=>setName('Ahmed Hassan')}>English name</button><button onClick={()=>setName('محمد أحمد')}>Arabic name</button><button onClick={()=>setMore(true)}>Load row</button><div className="glass hierarchical-case-table"><ValueTable><thead><tr><th><input type="checkbox" aria-label="Select all"/></th><th><button><span>Lawyer</span><b>↕</b></button></th><th>Case ID</th><th>Name</th><th>Project</th><th>Date of birth</th><th>Connected records</th></tr></thead><tbody><tr><td data-testid="checkbox"><input type="checkbox"/></td><td data-testid="english">Noor Ismail</td><td data-testid="number"><button className="table-action">15974<svg><title>Open case</title></svg></button></td><td data-testid="name">{name}</td><td>UNHCR 2026 - Erbil</td><td data-testid="date">2002-January-28</td><td data-testid="counts"><div className="case-connected-summary"><span><b>1</b><small>Assessments</small></span><span><b>2</b><small>Services</small></span></div></td></tr>{more&&<tr><td/><td data-testid="loaded">العراق</td><td>-1,234.50</td><td>٣٤٥</td><td>Urban</td><td>25.5%</td><td/></tr>}</tbody></ValueTable></div><div className="indicator-reporting"><ValueTable className="indicator-matrix"><thead><tr><th>Project</th><th>الموقع</th><th>0-4</th></tr></thead><tbody><tr><td data-testid="matrix-label">English project</td><td data-testid="matrix-arabic">بغداد</td><td data-testid="matrix-number">500</td></tr></tbody></ValueTable></div><ValueTable><tbody><tr><td data-testid="hidden-label"><span hidden>English hidden label</span>محمد</td><td><ValueTable><tbody><tr><td data-testid="nested">Nested English</td></tr></tbody></ValueTable></td></tr></tbody></ValueTable></main>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
    created.push(html);
    fs.writeFileSync(html, '<div id="root"></div><script type="module" src="/src/valueAlignmentCheck.tsx"></script>');
    browser = await chromium.launch({executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto((process.env.APP_TEST_URL || 'http://127.0.0.1:5186') + '/value-alignment-check.html');
    async function check(testId, alignment, direction) {
      await page.waitForFunction(({testId, alignment}) => document.querySelector('[data-testid="'+testId+'"]')?.getAttribute('data-value-align') === alignment, {testId, alignment});
      const style = await page.getByTestId(testId).evaluate(node => ({alignment: getComputedStyle(node).textAlign, direction: getComputedStyle(node).direction}));
      assert.deepEqual(style, {alignment, direction}, testId);
    }
    await check('english', 'left', 'ltr');
    await check('number', 'center', 'ltr');
    await check('name', 'right', 'rtl');
    await check('date', 'center', 'ltr');
    await check('counts', 'center', 'ltr');
    await check('checkbox', 'center', 'ltr');
    await check('matrix-label', 'left', 'ltr');
    await check('matrix-arabic', 'right', 'rtl');
    await check('matrix-number', 'center', 'ltr');
    await check('hidden-label', 'right', 'rtl');
    await check('nested', 'left', 'ltr');
    assert.equal(await page.getByTestId('counts').locator('div').evaluate(node => getComputedStyle(node).justifyContent), 'center');
    await page.getByRole('button', {name: 'English name', exact: true}).click();
    await check('name', 'left', 'ltr');
    await page.getByRole('button', {name: 'Arabic name', exact: true}).click();
    await check('name', 'right', 'rtl');
    await page.getByRole('button', {name: 'Load row', exact: true}).click();
    await check('loaded', 'right', 'rtl');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 700});
      await page.screenshot({path: path.join(root, 'output/value-table-alignment-'+width+'.png'), fullPage: true});
    }
    assert.deepEqual(errors, []);
    console.log('Value alignment passed: English, Arabic, numbers, dates, headers, controls, updated values, inserted rows, hidden labels, and nested tables.');
  } finally {
    if (browser) await browser.close();
    for (const file of created) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
