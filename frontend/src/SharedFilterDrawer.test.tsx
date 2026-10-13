import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SharedFilterDrawer,type DrawerFilterField} from './SharedFilterDrawer';

const noop=()=>{};
const fields:DrawerFilterField[]=[
  {key:'project',label:'Project',values:['A','B'],selected:[],onChange:noop},
  {key:'month',label:'Assessment month',values:['2026-01'],selected:['2026-01','2025-12'],onChange:noop,
    formatCaption:value=>`Month ${value}`,note:<small>Showing 1 of 20 values</small>},
];
const render=(props:Partial<Parameters<typeof SharedFilterDrawer>[0]>={})=>renderToStaticMarkup(
  <SharedFilterDrawer title="Filter records" eyebrow="RECORD FILTERS" fields={fields} onClose={noop} onReset={noop} {...props}/>,
);

describe('Shared full filter drawer',()=>{
  it('keeps field order and lazy sections while retaining selected and unavailable values',()=>{
    const markup=render();
    expect(markup.indexOf('<span>Project</span>')).toBeLessThan(markup.indexOf('<span>Assessment month</span>'));
    expect(markup).not.toContain('Only A');
    expect(markup).toContain('Only Month 2026-01');
    expect(markup).toContain('Exclude Month 2026-01');
    expect(markup).toContain('Remove unavailable Month 2025-12');
    expect(markup).toContain('Showing 1 of 20 values');
    expect(markup).toContain('<b>2</b>');
  });
  it('uses the same searchable shell and Reset/Done footer for every owner',()=>{
    const markup=render();
    expect(markup).toContain('case-filter-drawer shared-filter-drawer');
    expect(markup).toContain('placeholder="Search filters"');
    expect(markup).toContain('aria-label="Close filters"');
    expect(markup).toContain('aria-label="Close filter records"');
    expect(markup).toMatch(/<footer>.*Reset<\/button><button[^>]*>Done<\/button><\/footer>/);
    expect(markup).not.toContain('Apply filters');
    expect(markup).not.toContain('app-select-trigger');
  });
  it('supports controlled field search and hides the closed drawer',()=>{
    const markup=render({search:' ASSESSMENT ',onSearchChange:noop});
    expect(markup).not.toContain('<span>Project</span>');
    expect(markup).toContain('<span>Assessment month</span>');
    expect(render({open:false})).toBe('');
  });
});
