import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboPivotTable from './KoboPivotTable';
import type {KoboResult} from './koboTypes';
const result:KoboResult={id:'q',name:'q',label:'Question',group:'',kind:'multiple',repeat:'',denominator:40,missing:0,total:40,rows:Array.from({length:3},(_,i)=>({id:String(i),label:`Answer ${i}`,count:i,percent:i*2.5})),statistics:{},breakdowns:[],percentageBasis:'Answered respondents',chart:'bar',colors:{}};

describe('pivot totals rendering',()=>{
 it.each(['count','percent','both'] as const)('renders independent totals and drilldown in %s mode',display=>{
  for(const rows of [0,1,3])for(const columns of [0,1,3]){
   const pivot={...result,rows:result.rows.slice(0,rows),breakdowns:Array.from({length:columns},(_,i)=>({id:`b${i}`,label:`B${i}`,denominator:10}))};
   const html=renderToStaticMarkup(<KoboPivotTable result={pivot} language="en" display={display} limit={1} onDrilldown={()=>{}}/>);
   expect(html.includes('<tfoot>')).toBe(rows>1);
   expect(html.includes('>Total</th>')).toBe(rows>1||columns>1);
   if(rows&&columns>1){
    expect(html).toContain(`data-answer="${rows-1}"`);
    if(rows>1)expect(html).toContain('All answered responses');
   }
  }
 });
});


describe('default pivot sorting',()=>{
 it('shows largest counts first before applying the visible row limit',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={result} language="en" limit={1}/>);
  expect(html).toContain('aria-sort="descending"');expect(html).toContain('>Answer 2</th>');expect(html).not.toContain('>Answer 0</th>');
 });
 it('preserves an explicitly saved form order',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={{...result,answerSort:'form'}} language="en" limit={1}/>);
  expect(html).toContain('>Answer 0</th>');expect(html).not.toContain('aria-sort="descending"');
 });
});
