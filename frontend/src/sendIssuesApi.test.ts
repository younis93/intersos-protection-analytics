import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {getCachedIssuesSnapshot,loadIssues,saveIssueContacts} from './sendIssuesApi';
import {invalidateLegalQueries,setLegalRevision} from './legalQueryCache';
const snapshot={revision:'r1',lawyers:['Alice'],rows:[{id:'eligible'}],total:1,contacts:{Alice:'old@example.org'},whatsappNumbers:{}};
beforeEach(()=>{setLegalRevision('r1');invalidateLegalQueries()});
afterEach(()=>{vi.unstubAllGlobals();invalidateLegalQueries()});
it('reuses sequentially preloaded findings while refreshing saved contacts',async()=>{
  let contact='first@example.org';const network=vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/contacts')?{contacts:{Alice:contact},whatsappNumbers:{Alice:'+9647701234567'}}:snapshot)));
  vi.stubGlobal('fetch',network);
  await loadIssues();contact='updated@example.org';const opened=await loadIssues();
  expect(network.mock.calls.filter(([url])=>String(url).endsWith('/findings'))).toHaveLength(1);
  expect(opened.contacts.Alice).toBe('updated@example.org');expect(opened.whatsappNumbers?.Alice).toBe('+9647701234567');
});
it('bypasses the preload cache for exclusions and message-delivery checks',async()=>{
  let response=snapshot;const network=vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/contacts')?{contacts:snapshot.contacts}:response)));
  vi.stubGlobal('fetch',network);await loadIssues();response={...snapshot,revision:'r2',rows:[],total:0};
  const fresh=await loadIssues(undefined,true);expect(fresh.rows).toEqual([]);expect(fresh.revision).toBe('r2');
  invalidateLegalQueries();expect((await loadIssues()).rows).toEqual([]);
});

it('exposes the completed snapshot synchronously and clears it on invalidation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/contacts')?{contacts:snapshot.contacts}:snapshot))));
  expect(getCachedIssuesSnapshot()).toBeNull();
  const loaded=await loadIssues();expect(getCachedIssuesSnapshot()).toBe(loaded);
  invalidateLegalQueries();expect(getCachedIssuesSnapshot()).toBeNull();
});
it('does not retain results from an invalidated load',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    if(String(input).endsWith('/contacts')){invalidateLegalQueries();return new Response(JSON.stringify({contacts:snapshot.contacts}));}
    return new Response(JSON.stringify(snapshot));
  }));
  await expect(loadIssues()).rejects.toMatchObject({name:'AbortError'});expect(getCachedIssuesSnapshot()).toBeNull();
});

it.each([false,true])('rejects late findings after exclusions change (fresh=%s)',async(fresh)=>{
  let finish!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})));
  const loading=loadIssues(undefined,fresh);
  const rejected=expect(loading).rejects.toMatchObject({name:'AbortError'});
  invalidateLegalQueries();finish(new Response(JSON.stringify(snapshot)));
  await rejected;expect(getCachedIssuesSnapshot()).toBeNull();
});

it('rejects cached findings while contacts load after an exclusion and keeps the newer snapshot',async()=>{
  let delay=false,finish!:(response:Response)=>void;
  let response=snapshot;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    if(String(input).endsWith('/contacts'))return delay?new Promise<Response>(resolve=>{finish=resolve}):new Response(JSON.stringify({contacts:snapshot.contacts}));
    return new Response(JSON.stringify(response));
  }));
  await loadIssues();delay=true;
  const stale=loadIssues();const rejected=expect(stale).rejects.toMatchObject({name:'AbortError'});
  // Let the contacts request start before invalidating its captured findings.
  for(let index=0;index<8;index++)await Promise.resolve();
  invalidateLegalQueries();delay=false;response={...snapshot,revision:'r2',rows:[],total:0};
  const current=await loadIssues();finish(new Response(JSON.stringify({contacts:snapshot.contacts})));
  await rejected;expect(current.rows).toEqual([]);expect(getCachedIssuesSnapshot()).toBe(current);
});
it('updates the retained contact details after saving',async()=>{
  const saved={contacts:{Alice:'saved@example.org'},whatsappNumbers:{Alice:'+9647701234567'}};
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>new Response(JSON.stringify(String(input).endsWith('/contacts')?(init?.method==='PUT'?saved:{contacts:snapshot.contacts}):snapshot))));
  await loadIssues();await saveIssueContacts(saved.contacts,saved.whatsappNumbers);
  expect(getCachedIssuesSnapshot()?.contacts).toEqual(saved.contacts);
  expect(getCachedIssuesSnapshot()?.whatsappNumbers).toEqual(saved.whatsappNumbers);
});
