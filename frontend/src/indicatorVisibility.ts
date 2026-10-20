import {checkedFilterValues} from './filterSelection';
import type {IndicatorReport,IndicatorReportItem} from './types';

export const durableSolutionsKey='idp/durable-solutions-summary';
export const indicatorKey=(groupId:string,item:IndicatorReportItem)=>`${groupId}/${item.id}`;

export function indicatorVisibilityOptions(report:IndicatorReport) {
  const options:{value:string;label:string}[]=[];
  const visit=(groupId:string,label:string,item:IndicatorReportItem)=>{
    options.push({value:indicatorKey(groupId,item),label:`${label} - ${item.title}`});
    item.children.forEach(child=>visit(groupId,label,child));
  };
  report.groups.forEach(group=>group.indicators.forEach(item=>visit(group.id,group.label,item)));
  if(report.groups.some(group=>group.id==='idp'))options.push({value:durableSolutionsKey,label:'IDP - Durable solutions summary'});
  return options;
}

export function visibleIndicatorReport(report:IndicatorReport,selection:string[]|null):IndicatorReport {
  if(selection===null)return report;
  const visible=new Set(checkedFilterValues(selection,indicatorVisibilityOptions(report).map(option=>option.value)));
  const visit=(groupId:string,item:IndicatorReportItem):IndicatorReportItem[]=>{
    const children=item.children.flatMap(child=>visit(groupId,child));
    // A selected subindicator remains accessible when its parent is hidden.
    return visible.has(indicatorKey(groupId,item))?[{...item,children}]:children;
  };
  return {...report,groups:report.groups.map(group=>({...group,indicators:group.indicators.flatMap(item=>visit(group.id,item))})).filter(group=>group.indicators.length>0)};
}
