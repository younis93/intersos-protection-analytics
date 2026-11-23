import type {MouseEvent} from 'react';

export function clickPivotHeader(event:MouseEvent<HTMLTableSectionElement>){
 const target=event.target;
 if(!(target instanceof Element)||target.closest('button,a,input,select,textarea'))return;
 const header=target.closest('th');
 if(!header||header.closest('thead')!==event.currentTarget)return;
 header.querySelector<HTMLButtonElement>('.kobo-pivot-sort')?.click();
}
