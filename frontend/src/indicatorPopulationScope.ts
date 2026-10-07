import {matchesSelection} from './filterSelection';

export function indicatorPopulationScope(locationsByProject:Record<string,string[]>,projects:string[],locations:string[]) {
  const scopedProjects=Object.entries(locationsByProject).filter(([project,options])=>matchesSelection(project,projects)&&options.some(location=>matchesSelection(location,locations))).map(([project])=>project);
  return {idp:scopedProjects.includes('UNHCR 2026 - AMAL CAMP'),refugee:scopedProjects.some(project=>project!=='UNHCR 2026 - AMAL CAMP')};
}
