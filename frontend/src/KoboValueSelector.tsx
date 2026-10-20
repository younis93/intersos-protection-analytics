import {selectedValueDisplay,type ValueDisplay} from './koboValueDisplay';
import type {KoboQuestionSettings} from './koboTypes';
import KoboSegmentedControl from './KoboSegmentedControl';
export default function KoboValueSelector({settings,language,question,onChange}:{settings:KoboQuestionSettings;language:'en'|'ar';question:string;onChange:(value:ValueDisplay)=>void}){
 const active=selectedValueDisplay(settings),arabic=language==='ar';
 const options=[['count','#',arabic?'الأعداد':'Counts'],['percent','%',arabic?'النسب المئوية':'Percentages'],['both',arabic?'كلاهما':'Both',arabic?'الأعداد والنسب المئوية':'Counts and percentages']] as const;
 return <div className="kobo-value-control"><KoboSegmentedControl label={`${arabic?'عرض القيم':'Table and chart values'}: ${question}`} value={active} options={options} onChange={onChange}/>{active===null&&<span className="kobo-value-custom" title={arabic?'إعدادات الجدول والرسم مخصصة':'Table and chart use custom display settings'}>{arabic?'مخصص':'Custom'}</span>}</div>;
}
