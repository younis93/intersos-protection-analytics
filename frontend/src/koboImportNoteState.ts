import type {KoboImportNote} from './koboTypes';

export const importNoteKey=(note:KoboImportNote)=>`${note.id}:${note.fingerprint}`;
export function importNoteDescription(message:string){
 if(message.includes('choice filter depends on an ignored question'))return 'Answers will be checked against all available choices because the related filter question is ignored.';
 if(message.includes('ambiguous choice label'))return 'Some answer labels match more than one choice. Review the answer choices to decide how to interpret them.';
 if(/unknown .*choice/.test(message))return 'Some answers do not match the available choices. Review the answer choices or accept those answers as blank.';
 if(message.includes('is absent from the replacement data'))return 'A previously linked source column is missing from this file. Review its question link or ignore the question.';
 if(message.includes('invalid numeric answer'))return 'Some answers cannot be read as numbers. Review the source values and question type.';
 if(message.includes('invalid date answer'))return 'Some answers cannot be read as dates. Review the source values and date format.';
 return message;
}
export function reviewedNotes(notes:KoboImportNote[],accepted:string[]=[]):KoboImportNote[]{
 const keys=new Set(accepted);
 return notes.map(note=>({...note,reviewed:note.reviewed||keys.has(importNoteKey(note))}));
}
