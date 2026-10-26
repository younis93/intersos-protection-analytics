import {describe,expect,it} from 'vitest';
import {koboPalettes,resolveKoboColors,calculationKey,colorEntries,customizeDraft,defaultKoboColor,normalizeHex,paletteColors} from './koboCustomizeOptions';
import {questionDefaults,type KoboResult,type KoboSettings} from './koboTypes';

describe('customization drafts',()=>{
 it('normalizes valid HEX and rejects unsupported input',()=>{
  expect(normalizeHex(' abc ')).toBe('#AABBCC');expect(normalizeHex('#1683d8')).toBe('#1683D8');
  for(const value of ['#12','red','#AABBCCDD','#GGGGGG',''])expect(normalizeHex(value)).toBeNull();
 });
 it('keeps palettes tied to stable IDs when answers are reordered',()=>{
  const original={hidden:'#123456'};
  expect(paletteColors(['b','a'],['#111111','#222222'],original)).toEqual(paletteColors(['a','b'],['#111111','#222222'],original));
  expect(original).toEqual({hidden:'#123456'});
  expect(paletteColors(['c','b','a'],['#111111','#222222'])).toEqual({a:'#111111',b:'#222222',c:'#111111'});
 });
 it('does not include presentation settings in calculation requests',()=>{
  expect(calculationKey(questionDefaults)).toBe(calculationKey({...questionDefaults,chart:'pie',colors:{a:'#112233'},breakdownDisplay:'count'}));
  expect(calculationKey({...questionDefaults,bins:3})).not.toBe(calculationKey(questionDefaults));
  expect(calculationKey({...questionDefaults,breakdowns:['b','a']})).not.toBe(calculationKey({...questionDefaults,breakdowns:['a','b']}));
 });
 it('copies colors and upgrades legacy breakdowns without editing saved settings',()=>{
  const settings={questions:{q:{...questionDefaults,breakdown:'gender',colors:{a:'#112233'}}}} as unknown as KoboSettings;
  const draft=customizeDraft({id:'q',chart:'bar'} as KoboResult,settings);draft.colors.a='#445566';
  expect(draft.breakdowns).toEqual(['gender']);expect(settings.questions.q.colors.a).toBe('#112233');
 });
 it('uses series colors for line charts and skips blank answers',()=>{
  const result:KoboResult={id:'q',name:'q',label:'Question',group:'',kind:'category',repeat:'',denominator:1,missing:0,total:1,statistics:{},chart:'bar',breakdowns:[],rows:[{id:'a',label:'Answer',count:1,percent:100},{id:'__blank__',label:'Blank',count:0,percent:null}],percentageBasis:'Respondents',colors:{}};
  expect(colorEntries(result).map(entry=>entry.id)).toEqual(['a']);expect(defaultKoboColor(result,'a')).toBe('#2166AC');
  expect(colorEntries({...result,chart:'line'})).toEqual([{id:'series',label:'Line series'}]);
 });
});

it('offers coordinated palettes, resolves every series, and preserves explicit color overrides',()=>{
 const result={rows:[{id:'a'},{id:'b'}],breakdowns:[{id:'f'}]} as KoboResult;
 for(const palette of koboPalettes){
  expect(palette.description).toBeTruthy();
  for(const color of palette.colors)expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  const resolved=resolveKoboColors(result,palette.name as NonNullable<Parameters<typeof resolveKoboColors>[1]>,{});
  expect(Object.keys(resolved)).toEqual(['a','b','f','series']);
  expect(resolveKoboColors(result,palette.name as NonNullable<Parameters<typeof resolveKoboColors>[1]>,{a:'#ABCDEF'}).a).toBe('#ABCDEF');
 }
 expect(new Set(Object.values(resolveKoboColors(result,'Solid blue',{})))).toEqual(new Set(['#1683D8']));
 expect(resolveKoboColors(result,null,{})).toEqual({});
});
