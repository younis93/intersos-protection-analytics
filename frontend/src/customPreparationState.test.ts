import {describe,expect,it} from 'vitest';
import {analysisColumns,preparationFields,prunePreparationFilters,type CalculatedColumn} from './customPreparationState';
import type {CustomConfig,CustomColumn} from './CustomColumnSetup';

const source:CustomColumn={id:'col_source',index:0,header:'Date',label:'Date',kind:'date',included:true,group:'',dateFormat:'auto',separator:'',categories:{},invalidAsMissing:false,includeTime:true,timeLabel:''};
const first:CalculatedColumn={id:'calc_first',label:'First',operation:'days_between',left:'col_source',right:'col_source',useLiteral:false,literal:'',included:true,invalidAsMissing:false};
const config:CustomConfig={worksheet:'CSV',headerRow:1,dateFormat:'auto',columns:[source],filterFields:['col_source','col_source__time','calc_first'],calculatedColumns:[first,{...first,id:'calc_second',label:'Second'}]};

describe('preparation state',()=>{
 it('adds calculated columns to the analysis model without changing source identifiers',()=>{
  const result=analysisColumns(config);
  expect(result.map(c=>c.id)).toEqual(['col_source','calc_first','calc_second']);
  expect(result[1]).toMatchObject({kind:'number',calculated:true});expect(config.columns).toHaveLength(1);
 });
 it('limits calculation operands to source columns and earlier calculations',()=>{
  expect(preparationFields(config,'calc_first').map(c=>c.id)).toEqual(['col_source']);
  expect(preparationFields(config,'calc_second').map(c=>c.id)).toEqual(['col_source','calc_first']);
 });
 it('removes stale time and calculated filters while preserving valid selections',()=>{
  expect(prunePreparationFilters({...config,columns:[{...source,includeTime:false}],calculatedColumns:[]}).filterFields).toEqual(['col_source']);
  expect(prunePreparationFilters(config).filterFields).toEqual(config.filterFields);
 });
});
