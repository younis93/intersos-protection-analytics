import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import LegalPlatform from './LazyLegalPlatform';

afterEach(()=>vi.unstubAllGlobals());

describe('workspace module handoff',()=>{
 it('does not create a second desktop preparation surface while pending',()=>{
  vi.stubGlobal('window',{location:{search:'?startupEpoch=123456'}});
  const markup=renderToStaticMarkup(<LegalPlatform/>);
  expect(markup).not.toContain('app-startup-loading');
  expect(markup).not.toContain('Preparing your workspace');
  expect(markup).toContain('legal-upload-overlay');
  expect(markup).toContain('Processing records');
  expect(markup).not.toContain('legal-skeleton');
  expect(markup).not.toContain('Loading legal workspace');
 });
 it.each(['','?startupEpoch=invalid','?startupEpoch=0'])('leaves browser startup to RootApp: %s',search=>{
  vi.stubGlobal('window',{location:{search}});
  const markup=renderToStaticMarkup(<LegalPlatform/>);
  expect(markup).not.toContain('app-startup-loading');
  expect(markup).not.toContain('Loading legal workspace');
 });
});
