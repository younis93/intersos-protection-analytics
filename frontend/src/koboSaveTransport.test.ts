import {afterEach,describe,it,expect,vi} from 'vitest';
import {keepaliveBodyAllowed,koboApi,koboRequest} from './koboApi';
import type {KoboSettings} from './koboTypes';

afterEach(()=>vi.unstubAllGlobals());
describe('Kobo settings save transport',()=>{
 it('uses regular fetch for saves larger than the keepalive limit',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response('{"saved":true}',{status:200}));vi.stubGlobal('fetch',fetch);
  const settings={filters:[{field:'q',kind:'category',values:['ع'.repeat(45000)]}]} as KoboSettings;
  await koboApi.save('project',settings);
  const options=fetch.mock.calls[0][1];expect(new TextEncoder().encode(options.body).byteLength).toBeGreaterThan(82000);expect(options.keepalive).toBe(false);expect(options.method).toBe('PUT');expect(JSON.parse(options.body)).toEqual(settings);
 });
 it('checks exact UTF-8 boundaries rather than character count',()=>{
  expect(keepaliveBodyAllowed('x'.repeat(65535))).toBe(true);expect(keepaliveBodyAllowed('x'.repeat(65536))).toBe(true);expect(keepaliveBodyAllowed('x'.repeat(65537))).toBe(false);
  expect(keepaliveBodyAllowed('ع'.repeat(32768))).toBe(true);expect(keepaliveBodyAllowed('ع'.repeat(32769))).toBe(false);
 });
 it('restricts page-close saves to one bounded request and never sends oversized bodies',async()=>{
  let finish!:(value:Response)=>void;const fetch=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve}));vi.stubGlobal('fetch',fetch);
  expect(koboApi.saveOnPageHide('project',{hidden:['x'.repeat(70000)]} as KoboSettings)).toBe(false);expect(fetch).not.toHaveBeenCalled();
  expect(koboApi.saveOnPageHide('project',{} as KoboSettings)).toBe(true);expect(fetch.mock.calls[0][1].keepalive).toBe(true);
  expect(koboApi.saveOnPageHide('project',{} as KoboSettings)).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
  finish(new Response('{"saved":true}'));await vi.waitFor(()=>expect(koboApi.saveOnPageHide('another',{} as KoboSettings)).toBe(true));finish(new Response('{"saved":true}'));await new Promise(resolve=>setTimeout(resolve,0));
 });
 it('returns actionable errors for failed saves without hiding validation failures',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));await expect(koboApi.save('project',{} as KoboSettings)).rejects.toThrow('Could not confirm');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"detail":"Invalid saved filter"}',{status:400})));await expect(koboApi.save('project',{} as KoboSettings)).rejects.toThrow('Invalid saved filter');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('Aborted','AbortError')));await expect(koboRequest('/analysis',{},'POST',new AbortController().signal)).rejects.toMatchObject({name:'AbortError'});
 });
});
