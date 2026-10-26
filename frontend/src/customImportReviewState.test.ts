import {describe,expect,it} from 'vitest';
import {delimiterLabel,delimiterOptions,delimiterPreset,delimiterPresets,reviewColumns} from './customImportReviewState';
import type {CustomColumn,CustomConfig,CustomProfile} from './CustomColumnSetup';

const column=(patch:Partial<CustomColumn>={}):CustomColumn=>({id:'a',index:0,header:'A',label:'A',kind:'number',included:true,group:'',dateFormat:'auto',separator:'',categories:{},invalidAsMissing:false,includeTime:false,timeLabel:'',...patch});
const profile=(patch:Partial<CustomProfile>={}):CustomProfile=>({id:'a',detected:'number',missing:0,distinct:3,values:[],valuesTruncated:false,samples:[],invalid:2,ambiguous:false,timeCount:0,examples:[],preview:[],...patch});
const config=(columns:CustomColumn[]):CustomConfig=>({worksheet:'CSV',headerRow:1,dateFormat:'auto',columns,filterFields:[]});

describe('custom import review',()=>{
 it('maps every preset to the exact persisted delimiter',()=>{
  expect(delimiterPresets.map(p=>p.value)).toEqual([',',';','|','\t','\n',' ']);
  for(const preset of delimiterPresets){expect(delimiterPreset(preset.value)).toBe(preset.id);expect(delimiterLabel(preset.value)).toBe(preset.label)}
  expect(delimiterPreset('')).toBe('');expect(delimiterPreset('::')).toBe('custom');
  expect(delimiterOptions.at(-1)).toEqual(['custom','Custom']);expect(delimiterLabel('::')).toContain('::');
 });
 it('distinguishes blockers, ready columns and exclusions',()=>{
  const columns=[column(),column({id:'b',index:1,label:'B'}),column({id:'c',index:2,label:'C',included:false})];
  const issues=[{question:'a',message:'Invalid values',count:2},{question:'c',message:'Ignored invalid values',count:1}];
  const rows=reviewColumns(config(columns),[profile(),profile({id:'b',invalid:0}),profile({id:'c',invalid:1})],issues);
  expect(rows.map(r=>r.status)).toEqual(['Needs attention','Ready','Excluded']);
  expect(rows[2].problems).toEqual([]);expect(rows[2].acceptedInvalid).toBe(0);
 });
 it('counts accepted invalid values without accepting ambiguous dates',()=>{
  expect(reviewColumns(config([column({invalidAsMissing:true})]),[profile()],[])[0]).toMatchObject({status:'Ready',acceptedInvalid:2});
  expect(reviewColumns(config([column({kind:'date',invalidAsMissing:true})]),[profile({ambiguous:true})],[{question:'a',message:'Choose UK or US',count:2}])[0]).toMatchObject({status:'Needs attention',acceptedInvalid:0});
 });
});
