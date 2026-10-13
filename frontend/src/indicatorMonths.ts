import {filterValue,matchesSelection} from './filterSelection';

export function monthMatchesQuarters(month:string,quarters:string[]):boolean{
  if(!quarters.length)return true;
  const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(filterValue(month));
  return Boolean(match&&matchesSelection(`${match[1]}-Q${Math.ceil(Number(match[2])/3)}`,quarters));
}

export const monthsInQuarters=(months:string[],quarters:string[])=>months.filter(month=>monthMatchesQuarters(month,quarters));
