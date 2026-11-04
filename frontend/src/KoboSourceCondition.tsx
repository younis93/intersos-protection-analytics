import {conditionSummary} from './koboConnectionHealth';
import {KoboOriginalConnections} from './KoboConnections';
import {koboLabel,type KoboProject,type KoboResult} from './koboTypes';

// Prefer verified source evidence over the project's possibly incomplete connection.
export default function KoboSourceCondition({project,question,language,result}:{project:KoboProject;question:string;language:'en'|'ar';result?:KoboResult|null}){
 const target=project.form.questions.find(q=>q.id===question);
 if(!target)return null;
 const pending=target.connectionSetup;
 const source=pending?.recovered??target;
 const rules=[...(source.relevant?[{source:question,expression:source.relevant}]:[]),...(source.inheritedRelevant||[])];
 const conditions=rules.map(rule=>{
  const evaluated=result?.connections?.conditions.find(c=>c.source===rule.source&&c.expression===rule.expression);
  const metadata=target.conditionReview?.find(c=>c.source===rule.source&&c.expression===rule.expression);
  return {...rule,...metadata,...evaluated,readable:evaluated?.readable??(project.settings?.language===language?metadata?.readable:null)??null,supported:evaluated?.supported??metadata?.supported??true,ignoredParts:(evaluated?.ignoredRules||metadata?.ignoredRules)?.map(rule=>conditionSummary(rule,project.form.questions,language))||evaluated?.ignoredParts||metadata?.ignoredParts};
 });
 const refs=[...new Set(rules.flatMap(rule=>[...rule.expression.matchAll(/\$\{([^}]+)\}/g)].map(match=>match[1])))];
 const parents=refs.flatMap(ref=>{const q=project.form.questions.find(q=>q.id===ref)||project.form.questions.find(q=>q.name===ref);return q?[{id:q.id,name:q.name,label:koboLabel(q,language),hidden:false,compatible:true,triggers:[]}]:[]});
 if(pending&&!pending.recovered)return <section className="kobo-original-connections"><h4>{language==='ar'?'شرط كوبو الأصلي':'Original Kobo condition'}</h4><p>{language==='ar'?'تعذّر التحقق من شرط الاستمارة الأصلية. راجع ملف المصدر قبل إعداد الارتباط.':'The original form condition could not be verified. Check the source workbook before configuring the connection.'}</p></section>;
 const display={id:question,connections:{conditions,parents,originalParents:parents,issues:[],unresolvedReferences:[]}} satisfies Pick<KoboResult,'id'|'connections'>;
 return <KoboOriginalConnections result={display} language={language}/>;
}
