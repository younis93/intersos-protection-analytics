import {prepareDataEdit} from './KoboDataEditing';
import {koboApi,koboRequest} from './koboApi';
import type {KoboFieldPlacement,KoboProject} from './koboTypes';

export async function saveFieldPlacement(project:KoboProject,location:{field:string;group:string;placement:KoboFieldPlacement|null}){
 // Settings autosaves also change updated, without refreshing the manager's project.
 await prepareDataEdit(project.id);
 const latest=await koboApi.get(project.id);
 if(JSON.stringify(latest.form)!==JSON.stringify(project.form))throw new Error('The questions changed. Reopen Manage questions before moving this field.');
 return koboRequest<KoboProject>(`/projects/${project.id}/placement`,{...location,updated:latest.updated});
}
