import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Pager,pageCount,RowSelectionCheckbox,SortableHeader,TableState} from './TableControls';
import {FilterDrawerShell,FilterSection} from './FilterDrawerShell';
import {chartGrid,chartInk,plotConfig} from './ChartPrimitives';

describe('shared table controls',()=>{
  it.each([[0,100,1],[100,100,1],[101,100,2],[31,15,3]])('counts %i rows at %i per page',(total,size,pages)=>expect(pageCount(total,size)).toBe(pages));
  it('disables both directions for an empty table',()=>{
    const markup=renderToStaticMarkup(<Pager page={1} total={0} onChange={()=>{}}/>);
    expect(markup).toContain('Page 1 of 1');expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
  it('uses the supplied page size for reconciliation',()=>{
    const markup=renderToStaticMarkup(<Pager variant="reconciliation" page={2} total={31} pageSize={15} onChange={()=>{}}/>);
    expect(markup).toContain('Page 2 of 3');expect(markup).not.toContain('disabled=""');
  });
  it.each([['asc','ascending'],['desc','descending'],[undefined,'none']] as const)('announces sort direction %s',(direction,label)=>{
    expect(renderToStaticMarkup(<table><thead><tr><SortableHeader direction={direction} onSort={()=>{}}>Date</SortableHeader></tr></thead></table>)).toContain(`aria-sort="${label}"`);
  });
  it('does not select an empty group',()=>expect(renderToStaticMarkup(<RowSelectionCheckbox total={0} selectedCount={0} label="Select findings" onChange={()=>{}}/>)).not.toContain('checked=""'));
  it('announces loading and errors',()=>{
    expect(renderToStaticMarkup(<TableState>Loading</TableState>)).toContain('role="status"');
    expect(renderToStaticMarkup(<TableState error>Failed</TableState>)).toContain('role="alert"');
  });
});

describe('shared filter and chart primitives',()=>{
  it('preserves drawer slots and expanded filter groups',()=>{
    const markup=renderToStaticMarkup(<FilterDrawerShell className="case-filter-drawer review-filters-drawer" aria-label="Review filters" backdrop={<button>Close</button>} header={<header>Review</header>} footer={<footer>Apply</footer>}><FilterSection label="Project" badge={<b>1</b>} open><div>Options</div></FilterSection></FilterDrawerShell>);
    expect(markup).toContain('<button>Close</button><aside');expect(markup).toContain('review-filters-drawer');expect(markup).toContain('<details open="">');expect(markup).toContain('<summary><span>Project</span><b>1</b>');expect(markup).toContain('<footer>Apply</footer></aside>');
  });
  it('retains existing chart colors and interaction defaults',()=>{
    expect(chartInk('glass-dark')).toBe('#edf7ff');expect(chartInk('glass-light')).toBe('#263746');expect(chartGrid('glass-dark')).toBe('rgba(190,215,232,.13)');
    expect(plotConfig).toEqual({displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false});
  });
});
