import {koboLabel,type KoboAnalysis,type KoboQuestion} from './koboTypes';

const aliases:Record<string,string>={
 gender:'sex',governate:'governorate',governorates:'governorate',province:'governorate',provinces:'governorate',
 documentation:'documents',agegroup:'age band',
};
const ignored=new Set('a an the of in on at is was were are do does did by to for and or with what which who how many can you me please give show compare check calculate question field answer answers response responses respondent respondents survey data result results percent percentage count distribution breakdown chart pivot explain'.split(' '));
const tokenize=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const tokens=(text:string)=>tokenize(text).flatMap(word=>(aliases[word]||word).split(' '));
const significant=(text:string)=>tokens(text).filter(word=>word.length>=3&&!ignored.has(word)&&!/^[0-9]+$/.test(word));

function distance(left:string,right:string){
 let previous=Array.from({length:right.length+1},(_,index)=>index);
 for(let index=0;index<left.length;index++){
  const row=[index+1];
  for(let offset=0;offset<right.length;offset++)row.push(Math.min(row[offset]+1,previous[offset+1]+1,previous[offset]+Number(left[index]!==right[offset])));
  previous=row;
 }
 return previous[right.length];
}

export function searchSurveyDictionary(fields:KoboQuestion[],analysis:KoboAnalysis,question:string,prior:string[]=[]){
 const raw=tokenize(question).join(' ');
 const query=significant(question);
 const numbered=new Set([...question.matchAll(/\bq(?:uestion\s*)?(\d+)\b|^\s*(\d+)[.):]/gi)].map(match=>Number(match[1]||match[2])));
 const labels=new Map(analysis.questions.map(result=>[result.id,result.label]));
 const contains=(phrase:string)=>phrase.length>=3&&` ${raw} `.includes(` ${phrase} `);
 const ranked=fields.map((field,index)=>{
  const label=koboLabel(field,'en'),seenLabel=labels.get(field.id)||'';
  const number=label.match(/^\s*(\d+)[.):]/)?.[1];
  const names=[label,field.name,field.id,seenLabel].map(significant).filter(words=>words.length);
  const score=Math.max(0,...names.map(words=>{
   const shared=words.filter(word=>query.includes(word)).length;
   const fuzzy=words.length===1&&query.some(word=>word.length>=6&&words[0].length>=6&&
    Math.abs(word.length-words[0].length)<=2&&distance(word,words[0])<=(Math.max(word.length,words[0].length)>=9?2:1));
   return shared===words.length?20+shared*4:shared?shared*3:fuzzy?10:0;
  }));
  const choices=(field.choices||[]).filter(choice=>!analysis.settings.questions[field.id]?.hiddenAnswers?.includes(choice.name))
   .map(choice=>({code:choice.name,label:koboLabel(choice,'en')}));
  const matchingChoices=choices.filter(choice=>contains(tokenize(choice.label).join(' '))||contains(tokenize(choice.code).join(' ')));
  const hit=number!=null&&numbered.has(Number(number))?90:contains(tokenize(field.id).join(' '))?45:score;
  return {field,label,index,hit,rank:hit+Math.min(8,matchingChoices.length*4)+(prior.includes(field.id)?2:0),
   choices:[...new Set([...matchingChoices,...choices])]};
 });
 return ranked.sort((a,b)=>b.rank-a.rank||a.index-b.index);
}

export function surveyInterpretationCatalog(fields:KoboQuestion[],analysis:KoboAnalysis,prompt:string,prior:string[],custom:boolean){
 const ranked=searchSurveyDictionary(fields.filter(field=>field.kind!=='text'),analysis,prompt,prior);
 const relevant=ranked.filter(entry=>entry.rank>0);
 const chosen=(relevant.length?relevant:ranked.length<=16?ranked:[]).slice(0,16);
 return chosen.map(({field,label,choices})=>({
  id:field.id,label:label.slice(0,160),name:field.name.slice(0,100),kind:field.kind,repeat:!!field.repeat,
  breakdown:field.kind==='category'&&!field.repeat,hasDisplayRule:!!(field.relevant||field.inheritedRelevant?.length),
  answers:custom||field.addedFromData||field.localDerived?[]:choices.slice(0,8),
 }));
}
