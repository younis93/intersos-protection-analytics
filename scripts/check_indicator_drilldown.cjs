// Run against the Vite dev server with synthetic drill-down records only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'frontend/src/indicatorDrilldownCheck.tsx');
const html = path.join(root, 'frontend/indicator-drilldown-check.html');
const output = path.join(root, 'output/indicator-drilldown');

(async () => {
  let browser, createdEntry = false, createdHtml = false;
  try {
    assert(!fs.existsSync(entry) && !fs.existsSync(html), 'Harness paths already exist');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(entry, `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BeneficiaryIdModal} from './LegalIndicatorsPage';
import './styles.css';
import './workspace.css';
import './indicators.css';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'unhcr';
const rows = [
  ['73024', '67944', 'صالح مسافر عطية', 'legalservices.csv'],
  ['73781', '68689', 'عبدالله ابراهيم محمد احمد عبدالرحمن حسن', 'legalservices-with-a-very-long-source-filename-and-no-spaces.csv'],
  ['BEN-123456789012345678901234567890', '68690', 'A long beneficiary name with multiple words', 'assessments.csv'],
];
const ids = rows.map(([id, assessment, name, source]) => id + '  |  Assessment ID: ' + assessment + '  |  Name: ' + name + '  |  Source: ' + source);
const records = rows.map((_, rowIndex) => ({dataset:params.has('deportation')?'deportationrecords' as const:'assessments' as const,rowIndex}));
createRoot(document.getElementById('root')!).render(<BeneficiaryIdModal ids={params.has('missingIds')?[]:ids} count={3} records={records} revision="drill-test-revision" title={params.has('deportation') ? 'persons deported from detention' : '# of secured civil documentation'} onClose={()=>{}} onCopy={()=>{}} onOpenCase={params.has('plain')?undefined:(id)=>{(window as any).openedCase=id}}/>);
`);
    createdEntry = true;
    fs.writeFileSync(html, '<div id="root"></div><script type="module" src="/src/indicatorDrilldownCheck.tsx"></script>');
    createdHtml = true;
    browser = await chromium.launch({
      executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });
    const page = await browser.newPage();
    const errors = [], results = [];
    const exports = [];
    await page.route('**/api/legal/indicators/records-export', route => {
      exports.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'synthetic export' });
    });
    page.on('pageerror', error => errors.push(String(error)));
    for (const theme of ['unhcr', 'glass-dark']) {
      for (const width of [1440, 837, 390]) {
        for (const deportation of [false, true]) {
          await page.setViewportSize({ width, height: 918 });
          await page.goto(`${process.env.APP_TEST_URL || 'http://127.0.0.1:5174'}/indicator-drilldown-check.html?theme=${theme}${deportation ? '&deportation=1' : ''}`);
          await page.locator('.drill-source').first().waitFor();
          await page.locator('td[dir="rtl"]').first().waitFor();
          const layout = await page.locator('.drilldown-table').evaluate(table => {
            const failures = [];
            for (const cell of table.querySelectorAll('tbody td')) {
              const bounds = cell.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(cell);
              for (const rect of range.getClientRects()) {
                if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(cell.textContent);
              }
            }
            const source = table.querySelector('.drill-source');
            const style = getComputedStyle(source.parentElement);
            return {
              failures,
              sourceWidth: source.getBoundingClientRect().width,
              cellWidth: source.parentElement.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
              bodyOverflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          assert.deepEqual(layout.failures, [], 'Text crossed a column boundary');
          assert(Math.abs(layout.sourceWidth - layout.cellWidth) < 1, 'Source label does not fill its cell');
          assert(!layout.bodyOverflow, 'Modal overflowed the viewport');
          await page.getByRole('button', { name: 'Source', exact: true }).click();
          assert((await page.locator('tbody tr').count()) === 3, 'Sorting lost records');
          if (deportation) {
            assert.equal(await page.getByRole('button', { name: /^Open case / }).count(), 0);
          } else {
            const openCase = page.getByRole('button', { name: 'Open case 73024', exact: true });
            await openCase.click();
            assert.equal(await page.evaluate(() => window.openedCase), '73024');
            await page.evaluate(() => { window.openedCase = ''; });
            await openCase.focus();
            await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => window.openedCase), '73024');
          }
          if (!deportation) await page.screenshot({ path: path.join(output, `${theme}-${width}.png`) });
          const download = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
          assert.equal((await download).suggestedFilename(), 'indicator-source-records.xlsx');
          assert.deepEqual(exports.at(-1), { revision: 'drill-test-revision', records: [0, 1, 2].map(rowIndex => ({dataset:deportation?'deportationrecords':'assessments',rowIndex})) });
          results.push({ theme, width, deportation, contained: true });
        }
      }
    }
    await page.goto(`${process.env.APP_TEST_URL || 'http://127.0.0.1:5174'}/indicator-drilldown-check.html?plain=1`);
    await page.locator('.drill-source').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /^Open case / }).count(), 0, 'Unavailable case review must leave IDs as text');
    await page.goto(`${process.env.APP_TEST_URL || 'http://127.0.0.1:5174'}/indicator-drilldown-check.html?missingIds=1`);
    await page.getByText('No Beneficiary ID is available for these matching records.').waitFor();
    const missingIdDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await missingIdDownload;
    assert.equal(exports.at(-1).records.length, 3, 'Missing beneficiary IDs must not prevent source export');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, results, pageErrors: errors }));
  } finally {
    if (browser) await browser.close();
    if (createdEntry && fs.existsSync(entry)) fs.unlinkSync(entry);
    if (createdHtml && fs.existsSync(html)) fs.unlinkSync(html);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
