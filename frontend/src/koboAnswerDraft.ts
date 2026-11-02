export type ManagedAnswer={id:string;label:string;count:number};
export const normalizedAnswerLabel=(value:string)=>value.normalize('NFC').trim();
export function renameAnswerError(options:ManagedAnswer[],id:string,label:string){
 const source=options.find(option=>option.id===id),value=normalizedAnswerLabel(label);
 if(!source)return 'Choose an answer to rename.';
 if(!value)return 'Enter an answer label.';
 if(value.length>1000)return 'Use 1,000 characters or fewer.';
 if(value===normalizedAnswerLabel(source.label))return 'Enter a different label.';
 if(options.some(option=>option.id!==id&&normalizedAnswerLabel(option.label)===value))return 'This label is already used. Use Merge to combine answers.';
 return '';
}
