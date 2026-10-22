import type {KoboGeographyConfig} from './koboTypes';
export type GeographyValue={field:string;raw:string|null;label:string;total:number;filtered:number;automatic:string;governorate:string;status:'Matched'|'Unmatched'|'Missing'|'Excluded';override:string|null};
export type GeographyRow={field?:string;raw?:string|null;label:string;count:number;governorate?:string;status?:string};
export type GeographyResult={total:number;mapped:number;missing:number;invalid:number;excluded:number;unmapped:number;primaryMissing?:number;fallbackUsed:number;spatial:boolean;governorates:Record<string,number>;matches:{source:string;governorate:string}[];rows:GeographyRow[];cells:{lat:number;lon:number;count:number}[];reviewValues:GeographyValue[];warnings:string[];governorateOptions:string[];percentageBasis?:string};
export const emptyGeographyConfig=():KoboGeographyConfig=>({fallbackField:'',mappings:{}});
