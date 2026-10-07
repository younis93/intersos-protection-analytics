import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import IssueNotice from './IssueNotice';

describe('Send Issues notifications',()=>{
  it('shows one dismissible error using the shared reporting notification style',()=>{
    const markup=renderToStaticMarkup(<IssueNotice message="Previous success" error="Unable to open WhatsApp" onDismiss={()=>{}}/>);
    expect(markup.match(/role="alert"/g)).toHaveLength(1);
    expect(markup.match(/Unable to open WhatsApp/g)).toHaveLength(1);
    expect(markup).toContain('legal-copy-toast-error');
    expect(markup).toContain('Action needed');
    expect(markup).toContain('Dismiss notification');
    expect(markup).not.toContain('Previous success');
  });
  it('keeps success announcements polite and hides empty notifications',()=>{
    expect(renderToStaticMarkup(<IssueNotice message="Contacts saved"/>)).toContain('role="status"');
    expect(renderToStaticMarkup(<IssueNotice message=""/>)).toBe('');
  });
});
