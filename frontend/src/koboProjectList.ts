export type KoboProjectListItem={id:string;name:string;updated:string};
export type KoboProjectSort='date-desc'|'date-asc'|'name-asc'|'name-desc';
const names=new Intl.Collator(['en','ar'],{numeric:true,sensitivity:'base'});
const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase();

function dates(left:KoboProjectListItem,right:KoboProjectListItem,direction:number){
 const a=Date.parse(left.updated),b=Date.parse(right.updated);
 if(Number.isNaN(a))return Number.isNaN(b)?0:1;
 if(Number.isNaN(b))return -1;
 return (a-b)*direction;
}

export function matchingKoboProjects(projects:readonly KoboProjectListItem[],query:string,sort:KoboProjectSort){
 const search=normalized(query);
 return projects.filter(project=>normalized(project.name).includes(search)).sort((left,right)=>{
  const byName=names.compare(left.name,right.name);
  const primary=sort.startsWith('name')?byName*(sort==='name-asc'?1:-1):dates(left,right,sort==='date-asc'?1:-1);
  return primary||(sort.startsWith('name')?dates(left,right,-1):byName)||left.id.localeCompare(right.id);
 });
}
