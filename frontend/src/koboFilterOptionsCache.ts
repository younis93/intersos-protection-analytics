import {analysisWorkspace,koboApi} from './koboApi';
import type {KoboProject} from './koboTypes';
const caches=new WeakMap<object,Map<string,Promise<string[]>>>();
export function loadKoboFilterOptions(project:KoboProject,field:string,fetcher=()=>koboApi.options(project.id,field)){
 let cache=caches.get(project.form);if(!cache){cache=new Map();caches.set(project.form,cache)}
 const key=JSON.stringify([analysisWorkspace(),project.id,project.dataRevision||0,field]);
 const existing=cache.get(key);if(existing)return existing;
 if(cache.size>=64)cache.delete(cache.keys().next().value!);
 const pending=Promise.resolve().then(fetcher).catch(error=>{if(cache!.get(key)===pending)cache!.delete(key);throw error});cache.set(key,pending);return pending;
}
