import {analysisColumns} from './customPreparationState';
import type {CustomColumn,CustomConfig,CustomProfile,CustomPreview} from './CustomColumnSetup';

export const delimiterPresets=[
 {id:'comma',label:'Comma',value:','},
 {id:'semicolon',label:'Semicolon',value:';'},
 {id:'pipe',label:'Pipe',value:'|'},
 {id:'tab',label:'Tab',value:'\t'},
 {id:'newline',label:'New line',value:'\n'},
 {id:'space',label:'Space',value:' '},
];
export const delimiterOptions:[string,string][]=[['','Choose delimiter'],...delimiterPresets.map(({id,label}):[string,string]=>[id,label]),['custom','Custom']];
export const delimiterPreset=(separator:string)=>!separator?'':delimiterPresets.find(p=>p.value===separator)?.id||'custom';
export const delimiterLabel=(separator:string)=>!separator?'Not selected':delimiterPresets.find(p=>p.value===separator)?.label||`Custom: ${JSON.stringify(separator)}`;
export const customKindLabel=(kind:CustomColumn['kind'])=>({text:'Text',number:'Number',date:'Date',category:'Category',multiple:'Multiple choice'})[kind];
export function reviewColumns(config:CustomConfig,profiles:CustomProfile[],issues:CustomPreview['issues']){
 const byId=new Map(profiles.map(p=>[p.id,p]));
 return analysisColumns(config).map(column=>{
  const profile=byId.get(column.id),problems=column.included?issues.filter(i=>i.question===column.id):[];
  const status=!column.included?'Excluded':problems.length?'Needs attention':'Ready';
  const acceptedInvalid=column.included&&column.invalidAsMissing&&!profile?.ambiguous?(profile?.invalid||0):0;
  return {column,profile,problems,status,acceptedInvalid};
 });
}
