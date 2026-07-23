export type Page = 'executive'|'assessment'|'services'|'deportation'|'studio'|'quality';
export type Theme = 'glass-light'|'glass-dark'|'unhcr'|'executive'|'multicolor';
export type Measure = 'records'|'beneficiaries';
export type Display = 'both'|'count'|'percent';
export type Filters = Record<string,string[]>;
export interface Metadata {ready:boolean;source:string|null;loadedAt:string|null;pages:Record<string,{rows:number;filters:Record<string,string[]>;dimensions?:string[]}>}
export interface Row {label:string;count:number;percent:number}
export interface Chart {id:string;title:string;kind:string;rows:Row[];multiChoice:boolean}
export interface Dashboard {page:string;measure:string;total:number;filteredRows:number;kpis:{label:string;value:number;format:string}[];trend:Row[];openTrend?:Row[];closedTrend?:Row[];completionTrend?:Row[];flow?:{source:string;target:string;count:number}[];charts:Chart[]}
export interface QualityRow {page:string;severity:string;check:string;count:number;rate:number;impact:string}
export interface StudioCell {row:string;column:string;count:number;percent:number}
export interface StudioResult {page:string;rowDimension:string;columnDimension?:string;measure:string;total:number;cells:StudioCell[]}
export interface UpdateCheck {enabled:boolean;currentVersion:string;available:boolean;latestVersion?:string;notes?:string;publishedAt?:string;message?:string}
export interface UpdateStatus {phase:'idle'|'downloading'|'verifying'|'installing'|'restarting'|'error';progress:number;error?:string|null;currentVersion:string}
