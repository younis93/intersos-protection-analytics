import {it,expect,vi} from 'vitest';
import {loadKoboFilterOptions} from './koboFilterOptionsCache';
import type {KoboProject} from './koboTypes';
it('shares pending requests and reuses completed options without crossing revisions or forms',async()=>{
 const project={id:'p',form:{},dataRevision:0} as KoboProject,fetcher=vi.fn(async()=>['a','b']);
 const first=loadKoboFilterOptions(project,'q',fetcher),second=loadKoboFilterOptions(project,'q',fetcher);
 expect(first).toBe(second);await first;await loadKoboFilterOptions(project,'q',fetcher);expect(fetcher).toHaveBeenCalledTimes(1);
 await loadKoboFilterOptions({...project,dataRevision:1},'q',fetcher);expect(fetcher).toHaveBeenCalledTimes(2);
 await loadKoboFilterOptions({...project,form:{} as KoboProject['form']},'q',fetcher);expect(fetcher).toHaveBeenCalledTimes(3);
});
it('retries failed requests',async()=>{
 const project={id:'p',form:{}} as KoboProject,fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['ok']);
 await expect(loadKoboFilterOptions(project,'q',fetcher)).rejects.toThrow('offline');expect(await loadKoboFilterOptions(project,'q',fetcher)).toEqual(['ok']);
});
