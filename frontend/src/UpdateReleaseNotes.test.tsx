import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseReleaseNotes,UpdateReleaseNotes} from './UpdateReleaseNotes';

describe('update release notes',()=>{
  it('extracts titles and descriptions from numbered Markdown notes',()=>{
    expect(parseReleaseNotes('# Release\r\n\r\n1. **Performance:** Faster loading.\r\n2. **Email:** Prepare and review emails.')).toEqual([
      {title:'Performance',description:'Faster loading.'},{title:'Email',description:'Prepare and review emails.'},
    ]);
  });
  it('retains older paragraph notes and handles bullet lists without requiring headings',()=>{
    expect(parseReleaseNotes('An older update description.\n- Navigation improvements.')).toEqual([
      {title:'',description:'An older update description.'},{title:'',description:'Navigation improvements.'},
    ]);
  });
  it('renders untrusted notes as text and preserves the approved content',()=>{
    const html=renderToStaticMarkup(<UpdateReleaseNotes notes={'1. Performance: <script>alert(1)</script>\n2. Email: Preview & edit.'} sizeBytes={84183192}/>);
    expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Preview &amp; edit.');expect(html).toContain('84.2 MB');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
  it('provides a fallback for missing notes without inventing features',()=>{
    const html=renderToStaticMarkup(<UpdateReleaseNotes/>);
    expect(html).toContain('A new signed version of Iraq Data Analysis is ready to install.');
    expect(html).not.toContain(' MB');
  });
});
