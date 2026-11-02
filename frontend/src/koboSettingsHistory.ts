import type {KoboSettings} from './koboTypes';

export class KoboSettingsHistory{
 past:KoboSettings[]=[];
 future:KoboSettings[]=[];
 private group:unknown;
 private time=0;
 reset(){this.past=[];this.future=[];this.endGroup()}
 endGroup(){this.group=undefined;this.time=0}
 record(before:KoboSettings,next:KoboSettings,group?:unknown,now=Date.now()){
  if(JSON.stringify(before)===JSON.stringify(next))return false;
  if(!group||group!==this.group||now-this.time>=500){this.past.push(structuredClone(before));if(this.past.length>100)this.past.shift()}
  this.future=[];this.group=group;this.time=now;return true;
 }
 undo(current:KoboSettings){const previous=this.past.pop();if(!previous)return null;this.future.push(structuredClone(current));this.endGroup();return structuredClone(previous)}
 redo(current:KoboSettings){const next=this.future.pop();if(!next)return null;this.past.push(structuredClone(current));this.endGroup();return structuredClone(next)}
}
export function settingsHistoryInput(target:EventTarget|null){
 return target instanceof HTMLElement&&(target.matches('input,textarea,select')||target.isContentEditable);
}
