import type {KoboIndicatorDefinition} from './koboIndicatorTypes';

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
function definitions(items:KoboIndicatorDefinition[]){return items.map(item=>({...item,mode:item.mode||'score',conditionMatch:item.conditionMatch||'all',questions:item.questions.map(question=>({...question,selectedCodes:question.selectedCodes||[]}))}));}
export function verifySavedIndicators(expected:KoboIndicatorDefinition[],actual:KoboIndicatorDefinition[]|undefined){
 if(JSON.stringify(canonical(definitions(expected)))!==JSON.stringify(canonical(definitions(actual||[]))))throw new Error('The server did not retain the indicator definition. Your changes are still open. Restart the application backend with the latest version, then choose Retry save.');
}
