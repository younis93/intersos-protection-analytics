import {ChartColumnIncreasing,FileText,LayoutDashboard,MapPinned} from 'lucide-react';
import {AppSelect} from './SelectionControls';
export type KoboWorkspaceSection='overview'|'analysis'|'geography'|'report';
export const koboWorkspaceSections=[
 {id:'analysis',label:'Analysis',Icon:ChartColumnIncreasing},
 {id:'overview',label:'Overview',Icon:LayoutDashboard},
 {id:'geography',label:'Geography',Icon:MapPinned},
 {id:'report',label:'Reporting',Icon:FileText},
] as const;
export function KoboMobileWorkspaceSelector({value,onChange}:{value:KoboWorkspaceSection;onChange:(value:KoboWorkspaceSection)=>void}){
 const active=koboWorkspaceSections.find(section=>section.id===value)!;
 return <div className="kobo-mobile-workspace"><AppSelect label="Workspace" ariaLabel="Workspace" icon={active.Icon} value={value} options={koboWorkspaceSections.map(section=>[section.id,section.label])} onChange={next=>onChange(next as KoboWorkspaceSection)}/></div>;
}
