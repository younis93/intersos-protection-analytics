import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import RootApp from './RootApp';

vi.mock('./LazyLegalPlatform',()=>({default:()=> <div>Legal workspace</div>}));
vi.mock('./Welcome',()=>({default:()=> <div>Welcome</div>}));
vi.mock('./GuardianFox',()=>({GUARDIAN_FOX_STORAGE_KEY:'guardian-fox'}));
afterEach(()=>vi.unstubAllGlobals());

function render(search:string,hash='#/legal/overview'){
 vi.stubGlobal('window',{location:{hash,search}});
 vi.stubGlobal('localStorage',{getItem:()=>null});
 return renderToStaticMarkup(<RootApp/>);
}
describe('workspace startup handoff',()=>{
 it('routes Kobo projects without opening the Legal workspace',()=>{
  const markup=render('','#/kobo/example/report');
  expect(markup).toContain('Opening Kobo Analysis');
  expect(markup).toContain('kobo-loading-card');
  expect(markup).not.toContain('Legal workspace');
 });
 it('never recreates the native preparation screen during desktop startup',()=>{
  const markup=render('?appTheme=glass-light&startupEpoch=123456');
  expect(markup).not.toContain('Preparing your workspace');
  expect(markup).not.toContain('app-startup-loading');
  expect(markup).not.toContain('startup-app-content');
  expect(markup).toContain('aria-hidden="false"');
  expect(markup).not.toContain('inert=""');
  expect(markup).toContain('Legal workspace');
 });
 it('retains the loading screen for direct browser launches',()=>{
  const markup=render('');
  expect(markup).toContain('Preparing your workspace');
  expect(markup).toContain('aria-hidden="true"');
 });
 it.each(['?startupEpoch=invalid','?startupEpoch=0','?startupEpoch=-1'])('does not treat an invalid marker as a desktop handoff: %s',search=>{
  expect(render(search)).toContain('Preparing your workspace');
 });
});
