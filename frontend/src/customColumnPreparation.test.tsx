import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import CustomColumnPreparation from './CustomColumnPreparation';
import {activePreparation,preparationControls,preparationDefaults} from './customPreparationState';
import type {CustomColumn,CustomConfig,CustomPreview} from './CustomColumnSetup';

const column:CustomColumn={id:'col_value',index:0,header:'Value',label:'Value',kind:'text',included:true,group:'',dateFormat:'auto',separator:',',categories:{},invalidAsMissing:false,includeTime:false,timeLabel:'',preparation:{...preparationDefaults,trim:true,letterCase:'upper',currency:'EUR'}};
function render(kind:CustomColumn['kind']){
 const config:CustomConfig={worksheet:'CSV',headerRow:1,dateFormat:'uk',columns:[{...column,kind}],filterFields:[]};
 const preview:CustomPreview={token:'test',config,worksheets:['CSV'],sourcePreview:[],rows:1,profiles:[{id:column.id,detected:'text',missing:0,distinct:1,values:['Ali'],valuesTruncated:false,samples:['Ali'],invalid:0,ambiguous:false,timeCount:0,examples:[],preview:[{original:'Ali',prepared:'ALI',value:'ALI'}]}],issues:[],changes:[]};
 return renderToStaticMarkup(<CustomColumnPreparation config={config} preview={preview} onChange={()=>{}} busy={false} selected={column.id} onSelect={()=>{}} query="" onQuery={()=>{}}/>);
}
describe('type-aware column preparation',()=>{
 it.each(['text','category','multiple'] as const)('shows text tools only for %s',kind=>{
  const html=render(kind);expect(html).toContain('Trim leading and trailing spaces');expect(html).toContain('Letter case');expect(html).not.toContain('Currency token');expect(html).not.toContain('Column date convention');
 });
 it('shows dates without number or text tools',()=>{
  const html=render('date');expect(html).toContain('Column date convention');expect(html).toContain('File convention:');expect(html).toContain('Include time in a separate column');expect(html).not.toContain('Currency token');expect(html).not.toContain('Trim leading');expect(html).not.toContain('Letter case');
 });
 it('shows number interpretation without text or date tools',()=>{
  const html=render('number');expect(html).toContain('Number format');expect(html).toContain('Currency token');expect(html).not.toContain('Trim leading');expect(html).not.toContain('Column date convention');
 });
 it('offers delimiters only for multiple choice and labels for choice types',()=>{
  expect(render('multiple')).toContain('Answer delimiter');expect(render('category')).not.toContain('Answer delimiter');expect(render('category')).toContain('Edit value labels');expect(render('text')).not.toContain('Edit value labels');
 });
 it.each(['text','number','date','category','multiple'] as const)('shows type editing, counts, source position and missing tokens for %s',kind=>{
  const html=render(kind);expect(html).toContain('Column type');expect(html).toContain('Source column 1');expect(html).toContain('Missing value tokens');expect(html).toContain('Changed by cleanup');expect(preparationControls(kind)).toContain('missingTokens');
 });
 it('pauses incompatible settings without mutating saved settings',()=>{
  const date={...column,kind:'date' as const};expect(activePreparation(date)).toEqual(preparationDefaults);expect(date.preparation?.trim).toBe(true);expect(activePreparation(column).trim).toBe(true);expect(activePreparation(column).currency).toBe('');
 });
});
