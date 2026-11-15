import {afterEach,describe,expect,it,vi} from 'vitest';

const project={id:'survey',name:'Assessment',updated:'2026-11-09'};
const response=(projects:typeof project[])=>new Response(JSON.stringify(projects));

async function freshLists(){
 vi.resetModules();
 return (await import('./koboProjectListCache')).koboProjectLists;
}

afterEach(()=>vi.unstubAllGlobals());

describe('project list cache',()=>{
 it('shares reads and retains the last successful list through a failed refresh',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response([project])).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch',fetch);
  const {kobo,custom}=await freshLists();
  expect(kobo.getSnapshot().projects).toBeNull();
  const opening=kobo.refresh();
  expect(kobo.refresh()).toBe(opening);
  await opening;
  await kobo.refresh();
  expect(kobo.getSnapshot()).toMatchObject({projects:[project],error:'Offline'});
  expect(custom.getSnapshot().projects).toBeNull();
  await kobo.refresh();
  expect(kobo.getSnapshot()).toMatchObject({projects:[],error:''});
  expect(fetch).toHaveBeenCalledTimes(3);
 });

 it('discards a list read that began before a successful mutation',async()=>{
  let resolveStale!:(result:Response)=>void;
  const stale=new Promise<Response>(resolve=>{resolveStale=resolve});
  const updated={...project,name:'New name'};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response([project])).mockReturnValueOnce(stale).mockResolvedValueOnce(response([updated])));
  const {kobo}=await freshLists();
  await kobo.refresh();
  const previous=kobo.refresh();
  const latest=kobo.changed(()=>[updated]);
  expect(kobo.getSnapshot().projects).toEqual([updated]);
  await latest;
  resolveStale(response([project]));
  await previous;
  expect(kobo.getSnapshot().projects).toEqual([updated]);
 });
});
