import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TableSelectionActions} from './TableSelectionActions';
import {ColumnFilterChips,type RecordFilterControl} from './ColumnFilterControls';

describe('record table reset',()=>{
  it.each([
    [false,false,true],
    [true,false,false],
    [false,true,false],
    [true,true,false],
  ])('selection=%s filters=%s disables reset=%s',(selection,filters,disabled)=>{
    const selected=new Map<string,Record<string,unknown>>(selection?[['1',{ID:'1'}]]:[]);
    const markup=renderToStaticMarkup(<TableSelectionActions selected={selected} filename="records.xlsx" onClear={()=>{}} onResetFilters={()=>{}} hasActiveFilters={filters} onDownloadAll={async()=>{}} iconOnly/>);
    const reset=markup.match(/<button[^>]*aria-label="Clear filters and selection"[^>]*>/)?.[0];
    expect(reset).toBeDefined();
    expect(reset?.includes('disabled=""')).toBe(disabled);
    expect(reset).toContain('title="Clear filters and selection"');
  });

  it('keeps selection-only controls compatible',()=>{
    const markup=renderToStaticMarkup(<TableSelectionActions selected={new Map()} filename="records.xlsx" onClear={()=>{}}/>);
    expect(markup).toContain('aria-label="Clear selected records"');
    expect(markup).not.toContain('Clear filters and selection');
  });

  const control:RecordFilterControl={filters:[{column:'Project',type:'text',values:['Erbil']}],onChange:()=>{},loadValues:async()=>({values:[],total:0,offset:0})};
  it('hides only the redundant clear-all action when a toolbar reset is available',()=>{
    const markup=renderToStaticMarkup(<ColumnFilterChips control={{...control,showClearAll:false}}/>);
    expect(markup).not.toContain('Clear all');
    expect(markup).toContain('Remove filter');
    expect(markup).toContain('Project');
  });
  it('retains clear-all for tables without a download toolbar',()=>{
    expect(renderToStaticMarkup(<ColumnFilterChips control={control}/>)).toContain('Clear all');
  });
});
