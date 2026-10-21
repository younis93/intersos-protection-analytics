import {questionDefaults,type KoboSettings,type KoboProject} from './koboTypes';
import {appearanceDefaults} from './koboAppearance';
import type {KoboSavedView,KoboViewSnapshot} from './koboSavedViewTypes';

const defaults={language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,percentageDecimals:0,questionSort:'form',questions:{},viewMode:'charts'} as const;
const questionDefault={...questionDefaults,palette:null,chart:null,pointColors:{},trendDateField:'',trendUnit:'month' as const,appearance:appearanceDefaults};
export function viewSnapshot(settings:KoboSettings|KoboViewSnapshot):KoboViewSnapshot{
 const snapshot=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,settings[key as keyof KoboViewSnapshot]??value])) as KoboViewSnapshot;
 snapshot.questions=Object.fromEntries(Object.entries(snapshot.questions).map(([id,cfg])=>[id,{...questionDefault,...cfg,appearance:{...appearanceDefaults,...cfg.appearance}}]));
 return structuredClone(snapshot);
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
export function viewSignature(settings:KoboSettings|KoboViewSnapshot){
 const snapshot=viewSnapshot(settings);snapshot.hidden.sort();snapshot.filters=snapshot.filters.map(f=>({...f,minimum:f.minimum??null,maximum:f.maximum??null,values:[...f.values].sort()})).sort((a,b)=>a.field.localeCompare(b.field));
 for(const [id,cfg] of Object.entries(snapshot.questions))if(JSON.stringify(canonical(cfg))===JSON.stringify(canonical(questionDefault)))delete snapshot.questions[id];
 return JSON.stringify(canonical(snapshot));
}
export function activeSavedView(settings:KoboSettings){return settings.savedViews?.find(view=>view.id===settings.activeViewId)}
export function defaultViewSnapshot(project:KoboProject):KoboViewSnapshot{
 return viewSnapshot({...defaults,filters:[],filterFields:[],hidden:project.form.questions.filter(q=>q.identifying).map(q=>q.id),questions:Object.fromEntries(project.form.questions.map(q=>[q.id,{...questionDefaults,palette:'Blue'}]))});
}
export function isDefaultView(project:KoboProject,settings:KoboSettings){return !activeSavedView(settings)&&viewSignature(settings)===viewSignature(defaultViewSnapshot(project))}
export function viewModified(settings:KoboSettings){const active=activeSavedView(settings);return !!active&&viewSignature(settings)!==viewSignature(active.snapshot)}
export function createSavedView(project:KoboProject,settings:KoboSettings,name:string,description=''):KoboSavedView{return {id:crypto.randomUUID(),name:name.trim(),description:description.trim(),snapshot:viewSnapshot(settings),updatedAt:new Date().toISOString(),reviewIssues:[],questionKinds:Object.fromEntries(project.form.questions.map(q=>[q.id,q.kind]))}}
export function savedViewNameError(name:string,views:KoboSavedView[],except=''){return !name.trim()?'Enter a view name.':name.trim().length>160?'Use a name of 160 characters or fewer.':views.some(view=>view.id!==except&&view.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase())?'A view already uses this name. Choose a different name.':''}
export function copyViewName(view:KoboSavedView,views:KoboSavedView[]){let count=1,name='';do{name=view.name.slice(0,140)+(count===1?' (copy)':` (copy ${count})`);count++}while(savedViewNameError(name,views));return name}
export function verifySavedViews(expected:KoboSavedView[],actual:KoboSavedView[]|undefined){
 const normalize=(items:KoboSavedView[])=>items.map(view=>({...view,questionKinds:view.questionKinds||{},snapshot:viewSignature(view.snapshot)}));
 if(JSON.stringify(canonical(normalize(expected)))!==JSON.stringify(canonical(normalize(actual||[]))))throw new Error('The server did not retain the saved views. Your changes are still open. Restart the backend with the latest version and retry.');
}
