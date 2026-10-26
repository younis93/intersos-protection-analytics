import {afterEach,describe,expect,it,vi} from 'vitest';
import {analysisWorkspace,analysisRoute,createKoboApi,koboRequest} from './koboApi';

afterEach(()=>vi.unstubAllGlobals());
describe('analysis workspace routing',()=>{
 it('routes custom requests separately and keeps captured clients bound after navigation',async()=>{
  const location={hash:'#/custom/project'};
  vi.stubGlobal('window',{location});
  const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({id:'p'}),{status:200,headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetcher);
  expect(analysisWorkspace()).toBe('custom');expect(analysisRoute()).toBe('#/custom');
  const captured=createKoboApi('custom');
  await captured.get('p');expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/custom\/projects\/p$/);
  location.hash='#/kobo';
  await captured.job('j');expect(fetcher.mock.calls[1][0]).toMatch(/\/api\/custom\/exports\/j$/);
  await koboRequest('/projects');expect(fetcher.mock.calls[2][0]).toMatch(/\/api\/kobo\/projects$/);
 });
 it('recognizes exact route boundaries',()=>{
  vi.stubGlobal('window',{location:{hash:'#/customized'}});expect(analysisWorkspace()).toBe('kobo');
  vi.stubGlobal('window',{location:{hash:'#/custom'}});expect(analysisWorkspace()).toBe('custom');
 });
});
