import {questionDefaults,type KoboPercentageMode,type KoboSettings} from './koboTypes';
const compatible=(settings:KoboSettings,id:string)=>!settings.questions[id]?.calculation||['count','sum'].includes(settings.questions[id].calculation!.operation);
export function sharedPercentageBasis(settings:KoboSettings,ids:readonly string[]){
 const values=ids.filter(id=>compatible(settings,id)).map(id=>({mode:settings.questions[id]?.percentageMode||settings.percentageDefault||'legacy-respondents',level:settings.questions[id]?.percentageGroupLevel||1}));
 return values.every(value=>value.mode===values[0]?.mode&&(value.mode!=='breakdown-group'||value.level===1))?values[0]?.mode||settings.percentageDefault||'legacy-respondents':'mixed';
}
export function replacePercentageBasis(settings:KoboSettings,ids:readonly string[],percentageMode:KoboPercentageMode):KoboSettings{
 return {...settings,percentageDefault:percentageMode,questions:{...settings.questions,...Object.fromEntries(ids.filter(id=>compatible(settings,id)).map(id=>[id,{...questionDefaults,...settings.questions[id],percentageMode,percentageGroupLevel:1}]))}};
}
