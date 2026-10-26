const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const legalExportMonth=(date=new Date())=>`${date.getFullYear()}-${months[date.getMonth()]}`;
export const legalProjectFilename=(date=new Date())=>`Legal Platform export ${legalExportMonth(date)}.zip`;
