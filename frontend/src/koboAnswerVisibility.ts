import type {KoboAnalysis,KoboSettings} from './koboTypes';

function withoutHiddenAnswers(settings:KoboSettings){
 return {...settings,questions:Object.fromEntries(Object.entries(settings.questions).map(([id,{hiddenAnswers:_,hiddenAnswerPercentageMode:__,...config}])=>[id,config]))};
}

/** Answer visibility and percentage-base changes keep the edited card in place. */
export function retainAnswerVisibilityOrder(previous:KoboAnalysis|null,next:KoboAnalysis):KoboAnalysis{
 if(!previous||JSON.stringify(previous.settings)===JSON.stringify(next.settings)||JSON.stringify(withoutHiddenAnswers(previous.settings))!==JSON.stringify(withoutHiddenAnswers(next.settings)))return next;
 const remaining=new Map(next.questions.map(question=>[question.id,question]));
 const questions=previous.questions.flatMap(question=>{const updated=remaining.get(question.id);remaining.delete(question.id);return updated?[updated]:[]});
 return {...next,questions:[...questions,...remaining.values()]};
}
