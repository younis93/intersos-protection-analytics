import type {KoboForm,KoboReviewConfig,KoboQuestion} from './koboTypes';
export const emptyReviewConfig:KoboReviewConfig={addedQuestions:[],choiceOverrides:{}};
export function reviewForm(form:KoboForm,config:KoboReviewConfig):KoboForm{
 const added:KoboQuestion[]=config.addedQuestions.map(q=>({id:q.id,name:q.id,labels:{en:q.label},kind:q.kind,type:({category:'select_one',multiple:'select_multiple',number:'decimal'} as Record<string,string>)[q.kind]||q.kind,group:q.repeat,repeat:q.repeat,metadata:false,identifying:false,choices:q.choices}));
 return {...form,questions:[...form.questions,...added].filter(q=>!config.excludedQuestionIds?.includes(q.id)).map(q=>{
  const override=config.choiceOverrides[q.id];return override&&override.mode!=='form'?{...q,choices:override.choices}:q;
 })};
}
