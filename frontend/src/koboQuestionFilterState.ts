import {dateFilterActive} from './dateFilters';
import {type KoboFilter,type KoboQuestionSettings} from './koboTypes';

export function questionFilterSettings(initial:KoboQuestionSettings,rules:KoboFilter[]):KoboQuestionSettings{
 return {...initial,filterMode:rules.some(dateFilterActive)?'additional':'page',ownFilters:rules};
}
export function visibleQuestionFilterRules(settings:KoboQuestionSettings){
 const rules=settings.ownFilters||[];
 // Legacy page mode can retain disabled independent rules. Keep those inactive
 // until the user explicitly applies the simplified field selector.
 return settings.filterMode==='page'&&rules.some(dateFilterActive)?[]:rules;
}

export const questionFilterNote=(mode?:string)=>mode==='own'?'Uses own filters; page filters do not apply.':mode==='additional'?'Question filters applied with page filters.':'';
