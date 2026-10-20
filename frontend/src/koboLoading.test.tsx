import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {KoboLoadError,KoboModuleLoading,KoboProjectSkeleton} from './KoboLoading';

describe('Kobo initial loading',()=>{
 it('shows a branded module card with one accessible status',()=>{
  const html=renderToStaticMarkup(<KoboModuleLoading/>);
  expect(html).toContain('Opening Kobo Analysis');
  expect(html).toContain('Preparing your workspace');
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html).toContain('aria-busy="true"');
 });
 it('keeps skeleton decoration out of accessibility announcements and reveals the header independently',()=>{
  const opening=renderToStaticMarkup(<KoboProjectSkeleton stage="project"/>);
  const preparing=renderToStaticMarkup(<KoboProjectSkeleton stage="analysis" showHeader={false}/>);
  expect(opening).toContain('Opening project');
  expect(opening).toContain('kobo-skeleton-header');
  expect(preparing).not.toContain('kobo-skeleton-header');
  expect(preparing).toContain('Preparing analysis');
  for(const html of [opening,preparing]){
   expect(html).toContain('aria-hidden="true"');
   expect(html.match(/role="status"/g)).toHaveLength(1);
   for(const panel of ['filters','toolbar','question'])expect(html).toContain(`kobo-skeleton-${panel}`);
   expect(html).not.toContain('Project could not be opened');
  }
 });
 it('identifies the failed request and exposes its own retry action',()=>{
  for(const stage of ['project','analysis'] as const){
   const html=renderToStaticMarkup(<KoboLoadError stage={stage} message="Request failed" onRetry={()=>{}}/>);
   expect(html).toContain('role="alert"');expect(html).toContain('Request failed');
   expect(html).toContain(stage==='project'?'Retry opening project':'Retry analysis');
   expect(html).not.toContain('kobo-project-skeleton');
  }
 });
});
