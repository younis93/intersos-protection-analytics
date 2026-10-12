import {describe, expect, it} from 'vitest';
import {hasLegalCore, isLegalPageAvailable, resolveLegalPage} from './legalAvailability';
import {taskManifest} from './legalLoadScheduler';
import type {LegalMetadata} from './types';

const independent = ['deportationrecords', 'awareness', 'legalhotlines'];
const metadata = (datasets: string[]): LegalMetadata => ({
  ready: true, source: 'test', warnings: [], months: [], reviewCounts: {},
  availability: Object.fromEntries(datasets.map(dataset => [dataset, true])),
  features: {detention: false, deportation: false, awareness: false},
  sheets: datasets.map(id => ({id, name: id, rows: 2, columns: []})),
});

describe('independent legal page availability', () => {
  for (let mask = 1; mask < 8; mask++) {
    const datasets = independent.filter((_, index) => mask & (1 << index));
    it(`shows and schedules the imported pages for ${datasets.join(', ')}`, () => {
      const source = metadata(datasets);
      const pages = taskManifest(source).map(task => task.page);
      const expected = [['deportation', 'deportationrecords'], ['awareness', 'awareness'], ['hotline', 'legalhotlines'], ['legalhotlines', 'legalhotlines']];
      for (const [page, dataset] of expected) {
        expect(isLegalPageAvailable(source, page)).toBe(datasets.includes(dataset));
        expect(pages.includes(page)).toBe(datasets.includes(dataset));
        if (datasets.includes(dataset)) expect(resolveLegalPage(source, page)).toBe(page);
      }
      for (const page of ['overview', 'beneficiaries', 'assessments', 'legalservices', 'cases', 'indicators', 'studio', 'detention', 'lawyer-intelligence']) {
        expect(isLegalPageAvailable(source, page)).toBe(false);
        expect(pages).not.toContain(page);
      }
      expect(pages).toContain('explorer');
      expect(pages.includes('send-issues')).toBe(datasets.includes('awareness'));
      const fallback = datasets.includes('deportationrecords') ? 'deportation' : datasets.includes('awareness') ? 'awareness' : 'hotline';
      expect(resolveLegalPage(source, 'overview')).toBe(fallback);
    });
  }

  it('resolves routes after replacement and restoration while preserving available pages', () => {
    const initial = metadata(independent);
    expect(resolveLegalPage(initial, 'hotline')).toBe('hotline');
    const replaced = metadata(['awareness']);
    expect(resolveLegalPage(replaced, 'hotline')).toBe('awareness');
    expect(resolveLegalPage(JSON.parse(JSON.stringify(replaced)), 'cases')).toBe('awareness');
    expect(resolveLegalPage(replaced, 'explorer')).toBe('explorer');
  });

  it('requires the complete core for case pages and keeps independent pages despite project features', () => {
    const partial = metadata(['assessments', 'awareness']);
    expect(hasLegalCore(partial)).toBe(false);
    expect(taskManifest(partial).map(task => task.page)).not.toContain('assessments');
    const full = metadata(['beneficiaries', 'assessments', 'legalservices', ...independent]);
    expect(resolveLegalPage(full, 'overview')).toBe('overview');
    expect(isLegalPageAvailable(full, 'detention')).toBe(false);
    expect(isLegalPageAvailable(full, 'deportation')).toBe(true);
    expect(isLegalPageAvailable(full, 'awareness')).toBe(true);
  });

  for (const dataset of ['beneficiaries', 'assessments', 'legalservices', 'awareness']) {
    it(`enables Send Issues with only ${dataset}, even with zero findings`, () => {
      const source = metadata([dataset]);
      expect(isLegalPageAvailable(source, 'send-issues')).toBe(true);
      expect(resolveLegalPage(source, 'send-issues')).toBe('send-issues');
      expect(taskManifest(source).some(task => task.page === 'send-issues')).toBe(true);
    });
  }

  for (const datasets of [[], ['legalhotlines'], ['deportationrecords'], ['legalhotlines', 'deportationrecords'], ['legalfees']]) {
    it(`hides and does not schedule Send Issues for ${datasets.join(', ') || 'no data'}`, () => {
      const source = metadata(datasets);
      expect(isLegalPageAvailable(source, 'send-issues')).toBe(false);
      expect(taskManifest(source).some(task => task.page === 'send-issues')).toBe(false);
      expect(resolveLegalPage(source, 'send-issues')).not.toBe('send-issues');
    });
  }

  it('leaves Send Issues after replacement with Hotline-only data and restores it with relevant data', () => {
    expect(resolveLegalPage(metadata(['awareness', 'legalhotlines']), 'send-issues')).toBe('send-issues');
    expect(resolveLegalPage(metadata(['legalhotlines']), 'send-issues')).toBe('hotline');
    expect(resolveLegalPage(metadata(['deportationrecords']), 'send-issues')).toBe('deportation');
    expect(resolveLegalPage(metadata(['beneficiaries']), 'send-issues')).toBe('send-issues');
  });
});
