import {placeQuestions} from './koboFieldPlacement';
import type {KoboMapping,KoboForm,KoboReviewConfig,KoboQuestion} from './koboTypes';
export const emptyReviewConfig:KoboReviewConfig={addedQuestions:[],choiceOverrides:{}};
export function reviewForm(form:KoboForm,config:KoboReviewConfig):KoboForm{
 const added:KoboQuestion[]=config.addedQuestions.map(q=>({placement:q.placement,id:q.id,name:q.id,labels:{en:q.label},kind:q.kind,type:({category:'select_one',multiple:'select_multiple',number:'decimal'} as Record<string,string>)[q.kind]||q.kind,group:q.group??q.repeat,repeat:q.repeat,metadata:false,identifying:false,addedFromData:true,choices:q.choices}));
 const questions=[...form.questions,...added].filter(q=>!config.excludedQuestionIds?.includes(q.id));
 let ordered=questions;try{ordered=placeQuestions(questions)}catch{/* Keep invalid saved placements editable; server validation blocks confirmation. */}
 return {...form,questions:ordered.map(q=>{
  const override=config.choiceOverrides[q.id];return override&&override.mode!=='form'?{...q,choices:override.choices}:q;
 })};
}

/** Validate this complete candidate before publishing either part to review state. */
export function questionExclusionCandidate(config:KoboReviewConfig,mappings:KoboMapping[],id:string,ignore:boolean){
 const excluded=new Set(config.excludedQuestionIds||[]);if(ignore)excluded.add(id);else excluded.delete(id);
 return {config:{...config,excludedQuestionIds:[...excluded]},mappings:ignore?mappings.map(m=>m.question===id?{...m,question:'',option:'',status:'excluded',answerMap:{},mergeMode:'' as const}:m):mappings};
}
