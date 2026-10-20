import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NavLoadStatus} from './LegalPlatform';

describe('sidebar loading indicators on entry',()=>{
  it('does not replay completion for an already loaded page',()=>{
    expect(renderToStaticMarkup(<NavLoadStatus label="Assessments" status="ready"/>)).toBe('');
  });
  it.each(['queued','loading','error'] as const)('preserves an initial %s indicator',status=>{
    const markup=renderToStaticMarkup(<NavLoadStatus label="Assessments" status={status}/>);
    expect(markup).toContain(`nav-load-${status}`);
    expect(markup).toContain(`aria-label="Assessments ${status}"`);
  });
  it('does not show an idle indicator',()=>{
    expect(renderToStaticMarkup(<NavLoadStatus label="Assessments" status="idle"/>)).toBe('');
  });
});
