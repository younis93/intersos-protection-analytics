import type {LegalMetadata} from './types';

export const hasLegalCore = (metadata: LegalMetadata) =>
  ['beneficiaries', 'assessments', 'legalservices'].every(dataset => metadata.availability[dataset]);

export function isLegalPageAvailable(metadata: LegalMetadata, page: string): boolean {
  const has = (dataset: string) => Boolean(metadata.availability[dataset]);
  switch (page) {
    case 'awareness': return has('awareness');
    case 'deportation': return has('deportationrecords');
    case 'hotline':
    case 'legalhotlines': return has('legalhotlines');
    case 'explorer': return metadata.sheets.length > 0;
    case 'send-issues': return hasLegalCore(metadata) || has('awareness') || has('legalhotlines');
    case 'detention': return hasLegalCore(metadata) && Boolean(metadata.features?.detention);
    default: return hasLegalCore(metadata);
  }
}

export function resolveLegalPage(metadata: LegalMetadata, page: string): string {
  if (isLegalPageAvailable(metadata, page)) return page;
  return ['overview', 'deportation', 'awareness', 'hotline'].find(candidate => isLegalPageAvailable(metadata, candidate)) || 'explorer';
}
