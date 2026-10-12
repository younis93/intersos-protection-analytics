import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import RootApp from './RootApp';

vi.mock('./LegalPlatform',()=>({default:()=> <div>Legal workspace</div>}));
vi.mock('./Welcome',()=>({default:()=> <div>Welcome</div>}));
vi.mock('./GuardianFox',()=>({GUARDIAN_FOX_STORAGE_KEY:'guardian-fox'}));
afterEach(()=>vi.unstubAllGlobals());

function render(search:string){
 vi.stubGlobal('window',{location:{hash:'#/legal/overview',search}});
 vi.stubGlobal('localStorage',{getItem:()=>null});
 return renderToStaticMarkup(<RootApp/>);
}
describe('workspace startup handoff',()=>{
 it('does not repeat the launcher splash or hide the workspace during desktop startup',()=>{
  const markup=render('?appTheme=glass-light&startupEpoch=123456');
  expect(markup).not.toContain('Preparing your workspace');
  expect(markup).not.toContain('app-startup-loading');
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
