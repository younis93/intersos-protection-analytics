import {describe,expect,it} from 'vitest';
import {transformStudioResult} from './studioChart';
import type {StudioChartOptions,StudioResult} from './types';

const result:StudioResult={page:'assessment',rowDimension:'project',columnDimension:'status',measure:'records',total:21,cells:[
  {row:'Bravo',column:'Open',count:5,percent:0},{row:'Bravo',column:'Closed',count:1,percent:0},
  {row:'Alpha',column:'Open',count:2,percent:0},{row:'Alpha',column:'Closed',count:8,percent:0},
  {row:'Charlie',column:'Open',count:3,percent:0},{row:'Charlie',column:'Closed',count:2,percent:0},
]};
const options=(overrides:Partial<StudioChartOptions>={}):StudioChartOptions=>({sort:'source',topN:'all',valueMode:'count',labelMode:'auto',orientation:'horizontal',...overrides});

describe('transformStudioResult',()=>{
  it('preserves source order and raw counts',()=>{
    const view=transformStudioResult(result,options());
    expect(view.rows).toEqual(['Bravo','Alpha','Charlie']);
    expect(view.cells.find(cell=>cell.row==='Alpha'&&cell.column==='Closed')?.value).toBe(8);
  });

  it('sorts by totals and labels in both directions',()=>{
    expect(transformStudioResult(result,options({sort:'value-desc'})).rows).toEqual(['Alpha','Bravo','Charlie']);
    expect(transformStudioResult(result,options({sort:'value-asc'})).rows).toEqual(['Charlie','Bravo','Alpha']);
    expect(transformStudioResult(result,options({sort:'label-asc'})).rows).toEqual(['Alpha','Bravo','Charlie']);
    expect(transformStudioResult(result,options({sort:'label-desc'})).rows).toEqual(['Charlie','Bravo','Alpha']);
  });

  it('aggregates excluded categories into Other for every series',()=>{
    const expanded={...result,total:29,cells:[...result.cells,
      {row:'Delta',column:'Open',count:4,percent:0},{row:'Delta',column:'Closed',count:0,percent:0},
      {row:'Echo',column:'Open',count:1,percent:0},{row:'Echo',column:'Closed',count:2,percent:0},
      {row:'Foxtrot',column:'Open',count:1,percent:0},{row:'Foxtrot',column:'Closed',count:0,percent:0},
    ]};
    const view=transformStudioResult(expanded,options({topN:5,sort:'value-desc'}));
    expect(view.rows).toEqual(['Alpha','Bravo','Charlie','Delta','Echo','Other']);
    expect(view.cells.find(cell=>cell.row==='Other'&&cell.column==='Open')?.count).toBe(1);
    expect(view.cells.find(cell=>cell.row==='Other'&&cell.column==='Closed')?.count).toBe(0);
  });

  it('calculates total, series, and row percentages',()=>{
    expect(transformStudioResult(result,options({valueMode:'percent-total'})).cells.find(cell=>cell.row==='Alpha'&&cell.column==='Closed')?.value).toBeCloseTo(38.095);
    expect(transformStudioResult(result,options({valueMode:'percent-series'})).cells.find(cell=>cell.row==='Alpha'&&cell.column==='Closed')?.value).toBeCloseTo(72.727);
    expect(transformStudioResult(result,options({valueMode:'percent-row'})).cells.find(cell=>cell.row==='Alpha'&&cell.column==='Closed')?.value).toBe(80);
  });

  it('returns finite zero percentages for empty totals',()=>{
    const empty={...result,total:0,cells:result.cells.map(cell=>({...cell,count:0}))};
    expect(transformStudioResult(empty,options({valueMode:'percent-total'})).cells.every(cell=>cell.value===0&&cell.totalShare===0)).toBe(true);
  });
});
