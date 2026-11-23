import {questionDefaults,type KoboPercentageMode,type KoboQuestionSettings,type KoboSettings} from './koboTypes';
export function percentageBasisChange(percentageMode:KoboPercentageMode):Partial<KoboQuestionSettings>{
 return percentageMode==='legacy-respondents'?{percentageMode}:{percentageMode,percentageBase:'question',connectedPercentageMode:'adjust'};
}
const compatible=(settings:KoboSettings,id:string)=>!settings.questions[id]?.calculation||['count','sum'].includes(settings.questions[id].calculation!.operation);
export function sharedPercentageBasis(settings:KoboSettings,ids:readonly string[]){
 const eligible=ids.filter(id=>compatible(settings,id));
 if(eligible.some(id=>settings.questions[id]?.answerFilters?.some(rule=>rule.values.length)))return 'mixed';
 const values=eligible.map(id=>({mode:settings.questions[id]?.percentageMode||settings.percentageDefault||'legacy-respondents',level:settings.questions[id]?.percentageGroupLevel||1}));
 return values.every(value=>value.mode===values[0]?.mode&&(value.mode!=='breakdown-group'||value.level===1))?values[0]?.mode||settings.percentageDefault||'legacy-respondents':'mixed';
}
export function replacePercentageBasis(settings:KoboSettings,ids:readonly string[],percentageMode:KoboPercentageMode):KoboSettings{
 return {...settings,percentageDefault:percentageMode,questions:{...settings.questions,...Object.fromEntries(ids.filter(id=>compatible(settings,id)).map(id=>[id,{...questionDefaults,...settings.questions[id],...percentageBasisChange(percentageMode),answerFilters:[],percentageGroupLevel:1}]))}};
}
