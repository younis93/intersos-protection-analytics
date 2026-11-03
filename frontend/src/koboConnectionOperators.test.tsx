import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {connectionOperators} from './koboConnectionOperators';
import {ruleIssue,conditionSummary} from './koboConnectionHealth';
import KoboConnectionRuleEditor from './KoboConnectionRuleEditor';
import type {KoboQuestion,KoboConnectionRule} from './koboTypes';
const field=(kind:KoboQuestion['kind'])=>({id:'source',name:'Source',kind,labels:{en:'Source'},choices:[],repeat:''} as unknown as KoboQuestion);
it('provides only applicable operators for each stored field type',()=>{
 for(const kind of ['number','date'] as const)expect(connectionOperators(kind,'en').map(([op])=>op)).toEqual(['eq','neq','gt','gte','lt','lte','between','not-between','blank','not-blank']);
 expect(connectionOperators('text','en').map(([op])=>op)).toContain('contains');
 expect(connectionOperators('category','en').map(([op])=>op)).not.toContain('contains');
 expect(connectionOperators('multiple','en').map(([op])=>op)).toEqual(['selected','not-selected','blank','not-blank']);
});
it('validates ranges including zero, incomplete input, reversed bounds and invalid dates',()=>{
 const node:KoboConnectionRule={type:'rule',field:'source',operator:'between',value:-2.5,value2:0};
 expect(ruleIssue(node,[field('number')])).toBe('');
 expect(ruleIssue({...node,value2:''},[field('number')])).toBe('missing-rule-range');
 expect(ruleIssue({...node,value:1},[field('number')])).toBe('reversed-rule-range');
 expect(ruleIssue({...node,value:'2026-02-30',value2:'2026-03-01'},[field('date')])).toBe('invalid-rule-date');
 expect(ruleIssue({...node,operator:'contains'},[field('number')])).toBe('incompatible-rule-operator');
 expect(conditionSummary(node,[field('number')],'en')).toContain('between “-2.5” and “0”');
});
it('renders two correctly typed inputs and inclusive-boundary guidance in both languages',()=>{
 for(const language of ['en','ar'] as const)for(const kind of ['number','date'] as const){
 const node:KoboConnectionRule={type:'rule',field:'source',operator:'between',value:'',value2:''};
 const html=renderToStaticMarkup(<KoboConnectionRuleEditor node={node} fields={[field(kind)]} language={language} onChange={()=>{}}/>);
 expect(html.match(new RegExp(`type="${kind==='number'?'number':'date'}"`,'g'))).toHaveLength(2);
 expect(html).toContain(language==='en'?'Range includes both boundaries.':'يشمل النطاق كلا الحدين.');
 }
});
