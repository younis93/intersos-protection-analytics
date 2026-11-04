import type {KoboImportNote} from './koboTypes';

export const importNoteKey=(note:KoboImportNote)=>`${note.id}:${note.fingerprint}`;
export function importNoteDescription(message:string,language:'en'|'ar'='en'){
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 if(message.includes('choice filter depends on an ignored question'))return t('Answers will be checked against all available choices because the related filter question is ignored.','سيتم فحص الإجابات مقابل جميع الخيارات المتاحة لأن سؤال التصفية المرتبط مُتجاهَل.');
 if(message.includes('ambiguous choice label'))return t('Some answer labels match more than one choice. Review the answer choices to decide how to interpret them.','تطابق بعض تسميات الإجابات أكثر من خيار. راجع الخيارات لتحديد كيفية تفسيرها.');
 if(/unknown .*choice/.test(message))return t('Some answers do not match the available choices. Review the answer choices or accept those answers as blank.','بعض الإجابات لا تطابق الخيارات المتاحة. راجع خيارات الإجابة أو اقبل هذه الإجابات كقيم فارغة.');
 if(message.includes('is absent from the replacement data'))return t('A previously linked source column is missing from this file. Review its question link or ignore the question.','عمود مصدر مرتبط سابقاً غير موجود في هذا الملف. راجع ارتباطه بالسؤال أو تجاهل السؤال.');
 if(message.includes('invalid numeric answer'))return t('Some answers cannot be read as numbers. Review the source values and question type.','لا يمكن قراءة بعض الإجابات كأرقام. راجع قيم المصدر ونوع السؤال.');
 if(message.includes('invalid date answer'))return t('Some answers cannot be read as dates. Review the source values and date format.','لا يمكن قراءة بعض الإجابات كتواريخ. راجع قيم المصدر وتنسيق التاريخ.');
 return message;
}
export function reviewedNotes(notes:KoboImportNote[],accepted:string[]=[]):KoboImportNote[]{
 const keys=new Set(accepted);
 return notes.map(note=>({...note,reviewed:note.reviewed||keys.has(importNoteKey(note))}));
}
