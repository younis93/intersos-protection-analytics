import {describe,expect,it} from 'vitest';
import {koboTableData,koboTableText,koboTableHtml} from './koboTableData';
import {sortPivotRows} from './koboPivotSort';
import type {KoboResult} from './koboTypes';

export const result:KoboResult={id:'q',name:'q',label:'Needs\tassessment\nالاحتياجات',group:'',kind:'multiple',repeat:'',denominator:40,missing:2,total:42,rows:Array.from({length:40},(_,index)=>({id:String(index),label:`Answer ${index}`,count:index,percent:index*2.5})),statistics:{},breakdowns:[],percentageBasis:'Answered respondents',chart:'bar',colors:{}};
describe('Excel table serialization',()=>{
 it.each(['count','percent','both'] as const)('uses %s columns for ordinary pivots and formatted copies',mode=>{
  const headers=mode==='both'?['Count','Percent']:[mode==='count'?'Count':'Percent'];
  const table=koboTableData(result,mode);
  expect(table[0]).toEqual(['Answer',...headers]);
  expect(table.every(row=>row.length===headers.length+1)).toBe(true);
  const html=koboTableHtml(result,mode);
  expect(html.includes('>#</th>')).toBe(mode!=='percent');
  expect(html.includes('>%</th>')).toBe(mode!=='count');
  expect(koboTableText(result,mode)).toContain(['Answer',...headers].join('\t'));
 });
 it('includes title, all rows, and denominator totals without grouping or localized digits',()=>{
  const text=koboTableText(result);
  expect(text.split('\r\n')).toHaveLength(43);
  expect(text).toContain('Needs assessment الاحتياجات\r\nAnswer\tCount\tPercent');
  expect(text).toContain('Answer 39\t39\t98%');
  expect(text).toMatch(/Total\t40\t100%$/);
 });
 it('copies full sorted rows without changing the denominator',()=>{
  const sorted=sortPivotRows(result,{id:'count',label:'Count',metric:'count',direction:'desc'},'ar');
  expect(koboTableData(result,'both',sorted)[1]).toEqual(['Answer 39','39','98%']);
  expect(koboTableData(result,'count',sorted).at(-1)).toEqual(['Total','40']);
 });
 it('flattens nested headers and follows the selected metrics',()=>{
  const pivot={...result,breakdownFields:[{id:'sex',label:'Sex'},{id:'area',label:'Area'}],breakdowns:[{id:'f',label:'Female / North',labels:['Female','North'],denominator:3}],rows:[{id:'a',label:'A\nB\tC',count:1,percent:2.5,series:[{id:'f',count:1,percent:33.3333}]}]};
  expect(koboTableData(pivot,'both')).toEqual([['Answer','Sex: Female / Area: North - Count','Sex: Female / Area: North - Percent'],['A B C','1','33%']]);
  expect(koboTableData(pivot,'percent')[0]).toHaveLength(2);
  expect(koboTableData(pivot,'count')[1]).toEqual(['A B C','1']);
  expect(koboTableText(pivot,'count')).toContain('Breakdowns: Sex / Area\r\nAnswer\tFemale / North - Count');
  expect(koboTableText(pivot,'count')).not.toContain('Sex: Female');
 });
 it('handles zero responses, missing series, and blank percentages',()=>{
  expect(koboTableData({...result,denominator:0,rows:[]})).toEqual([['Answer','Count','Percent']]);
  expect(koboTableData({...result,breakdowns:[{id:'x',label:'X',denominator:0}],rows:[{id:'blank',label:'Blank',count:2,percent:null}]})[1]).toEqual(['Blank','-','-']);
 });
});

describe('formatted pivot copy',()=>{
 it('includes all sorted rows, numeric spreadsheet types, professional colors, and totals',()=>{
  const html=koboTableHtml(result,'both',[...result.rows].reverse());
  expect(html).toContain('bgcolor="#234b70"');
  expect(html).toContain('bgcolor="#dce9f5"');
  expect(html).toContain('x:num="0.98"');
  expect(html).toContain('mso-number-format:');
  expect(html.indexOf('Answer 39')).toBeLessThan(html.indexOf('Answer 0'));
  expect(html.match(/<tr>/g)).toHaveLength(43);
  expect(html).toContain('Total');
  expect(html).not.toContain('<button');
 });
 it('escapes user text, preserves Arabic and missing values, and respects percentage-only display',()=>{
  const pivot={...result,label:'<img src=x onerror=alert(1)> العربية',breakdowns:[{id:'x',label:'A & B',denominator:2}],rows:[{id:'a',label:'<script>"test"</script>',count:1,percent:50,series:[{id:'x',count:1,percent:50}]},{id:'b',label:'Blank',count:0,percent:null}]};
  const html=koboTableHtml(pivot,'percent');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<script>');
  expect(html).toContain('العربية');
  expect(html).toContain('A &amp; B</th>');
  expect(html).toContain('>%</th>');
  expect(html).not.toContain('>#</th>');
  expect(html).toContain('x:num="0.5"');
  expect(html).toContain('>-</td>');
 });
 it.each(['count','percent','both'] as const)('merges three levels by category identity in %s mode',display=>{
  const breakdowns=[['f','camp','yes'],['f','camp','no'],['f','host','yes'],['m','camp','yes']].map((values,index)=>({id:String(index),values,labels:[values[0]==='f'?'Female':'Male',values[1]==='camp'?'Camp':'Hosted',values[2]==='yes'?'Yes':'No'],label:values.join('/'),denominator:4}));
  const pivot={...result,breakdownFields:[{id:'sex',label:'Sex of respondent'},{id:'settlement',label:'Settlement type'},{id:'status',label:'Status'}],breakdowns,rows:[{id:'a',label:'18-24 years',count:3,percent:75,series:breakdowns.map(column=>({id:column.id,count:3,percent:75}))}]};
  const html=koboTableHtml(pivot,display),metrics=display==='both'?2:1;
  expect(html).toContain('rowspan="4"');
  expect(html).toContain(`colspan="${3*metrics}" bgcolor="#234b70" dir="auto"`);
  expect(html).toContain(`colspan="${2*metrics}" bgcolor="#234b70" dir="auto"`);
  expect(html.match(/Sex of respondent/g)).toHaveLength(1);
  expect(html.match(/Settlement type/g)).toHaveLength(1);
  expect(html.match(/>Female<\/th>/g)).toHaveLength(1);
  expect(html.match(/>Camp<\/th>/g)).toHaveLength(2);
  expect(html.match(/<td /g)).toHaveLength(5*metrics);
  if(display!=='percent')expect(html).toContain("mso-number-format:'#,##0'");
  expect(html).not.toContain('#,##0.##');
  expect(html.includes('>#</th>')).toBe(display!=='percent');
  expect(html.includes('>%</th>')).toBe(display!=='count');
 });
 it('keeps identically labelled categories separate and preserves missing and zero values',()=>{
  const breakdowns=[{id:'a',values:['a'],labels:['Other'],label:'Other',denominator:0},{id:'b',values:['b'],labels:['Other'],label:'Other',denominator:2}];
  const html=koboTableHtml({...result,breakdowns,rows:[{id:'zero',label:'Zero',count:0,percent:0,series:[{id:'a',count:0,percent:null}]}]});
  expect(html.match(/>Other<\/th>/g)).toHaveLength(2);
  expect(html).toContain('x:num="0"');expect(html).toContain('>-</td>');
  expect(html).toContain('rowspan="2"');
 });
 it('merges two levels and escapes field and category labels without altering shared report headers',()=>{
  const pivot={...result,breakdownFields:[{id:'sex',label:'Sex & gender'},{id:'area',label:'مكان <الإقامة>'}],breakdowns:[{id:'f',values:['f','a'],labels:['Female','A & B'],label:'Female / A & B',denominator:2}]};
  const html=koboTableHtml(pivot);
  expect(html).toContain('rowspan="3"');expect(html).toContain('Sex &amp; gender / مكان &lt;الإقامة&gt;');
  expect(html).not.toContain('Sex &amp; gender: Female');
  expect(koboTableData(pivot)[0][1]).toBe('Sex & gender: Female / مكان <الإقامة>: A & B - Count');
 });
});


describe('conditional pivot totals',()=>{
 it.each(['count','percent','both'] as const)('evaluates axes independently in %s mode',display=>{
  const metrics=display==='both'?2:1;
  for(const rowCount of [0,1,3])for(const categoryCount of [0,1,3]){
   const pivot={...result,rows:result.rows.slice(0,rowCount),breakdowns:Array.from({length:categoryCount},(_,i)=>({id:String(i),label:`Category ${i}`,denominator:10}))};
   const table=koboTableData(pivot,display);
   expect(table.length).toBe(1+rowCount+Number(rowCount>1));
   expect(table.every(row=>row.length===1+(Math.max(1,categoryCount)+Number(categoryCount>1))*metrics)).toBe(true);
   const html=koboTableHtml(pivot,display);
   expect(html.includes('border-top:2px solid #47759b')).toBe(rowCount>1);
   expect(table[0].some(label=>label.startsWith('Total -'))).toBe(categoryCount>1);
   expect(koboTableText(pivot,display).includes('Total -')).toBe(categoryCount>1);
  }
 });
 it('uses overall values rather than adding overlapping category counts and percentages',()=>{
  const pivot={...result,percentageDecimals:1 as const,breakdowns:[{id:'a',label:'A',denominator:30},{id:'b',label:'B',denominator:30}],rows:[{id:'x',label:'X',count:20,percent:50,displayPercent:49.9,series:[{id:'a',count:20,percent:66.7},{id:'b',count:20,percent:66.7}]},{id:'y',label:'Y',count:30,percent:75}]};
  const data=koboTableData(pivot);
  expect(data[1].slice(-2)).toEqual(['20','49.9%']);
  expect(data.at(-1)?.slice(-2)).toEqual(['40','100.0%']);
  const limited=koboTableData(pivot,'count',pivot.rows.slice(0,1));
  expect(limited.at(-1)).toEqual(['Total','30','30','40']);
  expect(koboTableHtml({...pivot,rows:pivot.rows.slice(0,1)})).not.toContain('border-top:2px solid #47759b');
 });
});
