import {koboRequest} from './koboApi';
import type {KoboSettings} from './koboTypes';
import type {KoboIndicatorDefinition,KoboIndicatorResult} from './koboIndicatorTypes';
export const koboIndicatorApi={
 results:(pid:string,settings:KoboSettings,signal?:AbortSignal)=>koboRequest<KoboIndicatorResult[]>(`/projects/${pid}/indicators/results`,{settings},'POST',signal),
 preview:(pid:string,settings:KoboSettings,indicator:KoboIndicatorDefinition,signal?:AbortSignal)=>koboRequest<KoboIndicatorResult>(`/projects/${pid}/indicators/preview`,{settings,indicator},'POST',signal),
 records:(pid:string,settings:KoboSettings,indicator:KoboIndicatorDefinition,status:'all'|'complete'|'incomplete',page:number,signal?:AbortSignal)=>koboRequest<KoboIndicatorResult>(`/projects/${pid}/indicators/records`,{settings,indicator,status,page,pageSize:25},'POST',signal),
};
