import {describe,it,expect} from 'vitest';
import {legalExportMonth,legalProjectFilename} from './legalProjectBackup';

describe('Legal Platform project filenames',()=>{
 it.each([
  [new Date(2026,9,25),'Legal Platform export 2026-Oct.zip'],
  [new Date(2026,11,31,23,59),'Legal Platform export 2026-Dec.zip'],
  [new Date(2027,0,1),'Legal Platform export 2027-Jan.zip'],
 ])('uses the local export month: %s',(date,filename)=>{
  expect(legalProjectFilename(date)).toBe(filename);
  expect(filename).toContain(legalExportMonth(date));
 });
});
