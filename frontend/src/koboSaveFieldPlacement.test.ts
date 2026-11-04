import {beforeEach,expect,it,vi} from 'vitest';
import {prepareDataEdit} from './KoboDataEditing';
import {koboApi,koboRequest} from './koboApi';
import {saveFieldPlacement} from './koboSaveFieldPlacement';
import type {KoboProject} from './koboTypes';

vi.mock('./KoboDataEditing',()=>({prepareDataEdit:vi.fn()}));
vi.mock('./koboApi',()=>({koboApi:{get:vi.fn()},koboRequest:vi.fn()}));

const project=()=>({id:'p',updated:'before-autosave',form:{questions:[{id:'a',group:'',repeat:''},{id:'b',group:'',repeat:''}],groups:[]},settings:{hidden:[]}} as unknown as KoboProject);
const location={field:'b',group:'',placement:{position:'before' as const,reference:'a'}};
beforeEach(()=>vi.resetAllMocks());

it('waits for pending settings saves and moves with the fresh timestamp',async()=>{
 const base=project(),latest={...base,updated:'after-autosave',settings:{...base.settings,hidden:['a']}};
 let finish!:()=>void;
 vi.mocked(prepareDataEdit).mockReturnValue(new Promise<void>(resolve=>{finish=resolve}));
 vi.mocked(koboApi.get).mockResolvedValue(latest);
 vi.mocked(koboRequest).mockResolvedValue(latest);
 const saving=saveFieldPlacement(base,location);
 expect(prepareDataEdit).toHaveBeenCalledWith('p');
 expect(koboApi.get).not.toHaveBeenCalled();
 expect(koboRequest).not.toHaveBeenCalled();
 finish();
 expect(await saving).toBe(latest);
 expect(koboRequest).toHaveBeenCalledWith('/projects/p/placement',{...location,updated:'after-autosave'});
});

it('also lets Undo use the latest timestamp after another settings save',async()=>{
 const base=project();base.form.questions.reverse();
 const latest={...base,updated:'after-next-autosave'};
 vi.mocked(koboApi.get).mockResolvedValue(latest);
 vi.mocked(koboRequest).mockResolvedValue(latest);
 await saveFieldPlacement(base,{...location,placement:{position:'last'}});
 expect(koboRequest).toHaveBeenCalledWith('/projects/p/placement',{field:'b',group:'',placement:{position:'last'},updated:latest.updated});
});

it('blocks stale previews when question order or groups changed',async()=>{
 const base=project(),latest=structuredClone(base);latest.updated='external-move';latest.form.questions.reverse();
 vi.mocked(koboApi.get).mockResolvedValue(latest);
 await expect(saveFieldPlacement(base,location)).rejects.toThrow('questions changed');
 expect(koboRequest).not.toHaveBeenCalled();
});

it('does not move when pending settings fail to save',async()=>{
 vi.mocked(prepareDataEdit).mockRejectedValue(new Error('Save failed'));
 await expect(saveFieldPlacement(project(),location)).rejects.toThrow('Save failed');
 expect(koboApi.get).not.toHaveBeenCalled();
 expect(koboRequest).not.toHaveBeenCalled();
});

it('preserves the server conflict if another edit races the placement request',async()=>{
 vi.mocked(koboApi.get).mockResolvedValue(project());
 vi.mocked(koboRequest).mockRejectedValue(new Error('The project changed. Reload before moving this field.'));
 await expect(saveFieldPlacement(project(),location)).rejects.toThrow('The project changed');
 expect(koboRequest).toHaveBeenCalledTimes(1);
});
