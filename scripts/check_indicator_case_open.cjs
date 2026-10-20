// Exercise the real workspace and case modal using synthetic API responses.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors = [], cases = [], queries = [], exports = [];
    let failExport = false;
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedIds = text; } } });
    });
    const ids = [
      '73024  |  Assessment ID: 67944  |  Name: صالح مسافر عطية  |  Source: legalservices.csv',
      '73781  |  Assessment ID: 68689  |  Name: عبدالله ابراهيم محمد  |  Source: assessments.csv',
    ];
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      let body = {};
      if (url.includes('/legal/metadata')) {
        const datasets = ['beneficiaries', 'assessments', 'legalservices'];
        body = { ready: true, loading: false, revision: 'case-open-test', source: 'Synthetic records', warnings: [],
          availability: Object.fromEntries(datasets.map(id => [id, true])), features: { detention: false, awareness: false, deportation: false },
          sheets: datasets.map(id => ({ id, name: id, rows: 2, columns: ['Beneficiary ID'] })), months: [], reviewCounts: {} };
      } else if (url.endsWith('/legal/indicators')) {
        const query = route.request().postDataJSON();
        queries.push(query);
        const values = [2, ...Array(11).fill(0), 2];
        const rowIds = [ids, ...Array.from({ length: 11 }, () => []), ids];
        const refs = [{ dataset: 'legalservices', rowIndex: 0 }, { dataset: 'assessments', rowIndex: 1 }];
        const sourceRecords = [refs, ...Array.from({ length: 11 }, () => []), refs];
        body = { revision: 'case-open-test', fromDate: '', toDate: '', ageGroups: ['0-4', '5-11', '12-17', '18-24', '25-59', '60+'],
          filterOptions: { projects: ['Project A', 'Project B'], locations: [], locationsByProject: {}, years: [], quarters: [], months: [], communityTypes: [] },
          activeFilters: { projects: query.projects, locations: query.projectLocations, years: [], quarters: query.quarters, months: query.months, communityTypes: query.communityTypes },
          groups: [{ id: 'all', label: 'All beneficiaries', indicators: [{ id: 'case-open-check', title: 'Synthetic civil documentation', source: 'legalservices.csv', dateField: 'Service date', rule: 'Synthetic test', population: 'All', total: 2, contributions: {}, children: [],
            sections: [{ id: 'refugee', label: 'Refugees', total: 2, totals: values, totalBeneficiaryIds: rowIds, totalSourceRecords: sourceRecords,
              warnings: { unclassified: 0, unknownLocation: 0 }, rows: [{ project: 'Project A', location: 'Test location', values, beneficiaryIds: rowIds, sourceRecords }] }] }] }] };
      } else if (url.endsWith('/legal/case')) {
        const query = route.request().postDataJSON();
        cases.push(query.query);
        body = { query: query.query, cases: [], rows: [], columns: [], availableColumns: [], totalCases: 0, totalRows: 0, page: 1, pageSize: 100 };
      } else if (url.endsWith('/legal/indicators/records-export')) {
        exports.push(route.request().postDataJSON());
        await new Promise(resolve => setTimeout(resolve, 200));
        if (failExport) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'The imported data has changed. Refresh Indicator Reporting and reopen the figure before downloading.' }) });
        return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'synthetic export response' });
      } else if (url.includes('duplicate-exclusions')) body = { rows: [] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${process.env.APP_TEST_URL || 'http://127.0.0.1:5174'}/#/legal/indicators`);
    await page.locator('.indicator-card').waitFor();
    await page.locator('.indicator-filter-bar').getByRole('button', { name: 'All projects', exact: true }).click();
    const filtered = page.waitForResponse(response => response.url().endsWith('/legal/indicators') && response.request().postDataJSON().projects.includes('Project A'));
    await page.getByRole('checkbox', { name: 'Project A', exact: true }).check();
    await page.locator('.indicator-filter-bar').getByRole('button', { name: 'Project (1)', exact: true }).click();
    await filtered;

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const fullView of [true, false]) {
        if (fullView) await page.getByRole('button', { name: 'View full disaggregation', exact: true }).click();
        const report = fullView ? page.getByRole('dialog', { name: 'Full view: Synthetic civil documentation', exact: true }) : page.locator('.indicator-card');
        const figures = fullView && width === 390 ? report.locator('.indicator-gender-group .indicator-value-button') : report.locator('.indicator-value-button');
        await figures.first().click();
        const drill = page.getByRole('dialog', { name: 'Beneficiary and Assessment IDs', exact: true });
        await drill.getByRole('button', { name: 'Source', exact: true }).click();
        await drill.getByRole('button', { name: 'Copy IDs', exact: true }).click();
        const expected = '73781\t68689\tعبدالله ابراهيم محمد\tassessments.csv\n73024\t67944\tصالح مسافر عطية\tlegalservices.csv';
        assert.equal(await page.evaluate(() => window.copiedIds), expected);
        const download = page.waitForEvent('download');
        await drill.getByRole('button', { name: 'Download Excel', exact: true }).click();
        assert.equal(await drill.getByRole('button', { name: 'Preparing Excel download', exact: true }).isDisabled(), true);
        assert.equal((await download).suggestedFilename(), 'indicator-source-records.xlsx');
        assert.deepEqual(exports.at(-1), { revision: 'case-open-test', records: [{ dataset: 'legalservices', rowIndex: 0 }, { dataset: 'assessments', rowIndex: 1 }] });
        const action = drill.getByRole('button', { name: 'Open case 73024', exact: true });
        if (fullView) await action.click();
        else { await action.focus(); await page.keyboard.press('Enter'); }
        const caseModal = page.getByRole('dialog', { name: 'Case 73024', exact: true });
        await caseModal.getByRole('heading', { name: 'Case not found', exact: true }).waitFor();
        await caseModal.getByRole('heading', { name: 'Case 73024', exact: true }).waitFor();
        assert(cases.includes('73024'));
        assert.equal(await page.locator('.indicator-modal:visible').count(), 0, 'An indicator dialog covered the case');
        if (fullView) await caseModal.getByRole('button', { name: 'Close case review', exact: true }).click();
        else await page.keyboard.press('Escape');
        assert.equal(await page.locator('.case-review-modal').count(), 0);
        await drill.waitFor({ state: 'visible' });
        assert.equal(await action.evaluate(button => document.activeElement === button), true, 'Focus did not return to the originating ID');
        assert.equal(await drill.locator('tbody tr').first().locator('td').first().innerText(), '73781', 'Returning reset the Source sort');
        await drill.getByRole('button', { name: 'Copy IDs', exact: true }).click();
        assert.equal(await page.evaluate(() => window.copiedIds), expected, 'Returning changed the drill-down records');
        // Reopening another case from the restored drill-down must also return here.
        await drill.getByRole('button', { name: 'Open case 73781', exact: true }).click();
        const secondCase = page.getByRole('dialog', { name: 'Case 73781', exact: true });
        await secondCase.getByRole('heading', { name: 'Case not found', exact: true }).waitFor();
        await secondCase.getByRole('button', { name: 'Close case review', exact: true }).click();
        await drill.waitFor({ state: 'visible' });
        assert.equal(await page.locator('.indicator-card').count(), 1);
        assert.equal(await page.locator('.indicator-filter-bar').getByRole('button', { name: 'Project (1)', exact: true }).count(), 1);
        assert.deepEqual(queries.at(-1).projects, ['Project A']);
        assert(page.url().endsWith('#/legal/indicators'));
        await drill.getByRole('button', { name: 'Close IDs', exact: true }).last().click();
        if (fullView) await page.getByRole('button', { name: 'Close full view', exact: true }).last().click();
      }
    }
    // A stale import must produce an actionable inline error instead of a download.
    failExport = true;
    await page.locator('.indicator-card .indicator-value-button').first().click();
    const drill = page.getByRole('dialog', { name: 'Beneficiary and Assessment IDs', exact: true });
    await drill.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await drill.getByRole('alert').filter({ hasText: 'Refresh Indicator Reporting' }).waitFor();
    failExport = false;
    const retriedDownload = page.waitForEvent('download');
    await drill.getByRole('button', { name: 'Download Excel', exact: true }).click();
    await retriedDownload;
    assert.equal(await drill.getByRole('alert').count(), 0, 'A successful retry must clear the export error');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, caseQueries: cases, filtersPreserved: true, drillDownRestored: true, sortAndFocusPreserved: true, closeButtonAndEscape: true, mouseAndKeyboard: true, copyUnchanged: true, sourceRecordExport: true, staleExportError: true, genderGroups: true, desktopAndMobile: true, pageErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
