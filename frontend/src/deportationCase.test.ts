import {beforeEach,describe,expect,it,vi} from 'vitest';
import {getLegalExplorer} from './api';
import {getDeportationCaseRecords,hasDeportationId,isDeportationIdColumn} from './deportationCase';

vi.mock('./api',()=>({getLegalExplorer:vi.fn()}));
const explorer=vi.mocked(getLegalExplorer);
const result={dataset:'deportationrecords',total:0,page:1,pageSize:100,columns:['PN ID'],rows:[]};

describe('deportation case lookup',()=>{
  beforeEach(()=>explorer.mockReset());
  it('discovers the source identifier and requests only that exact PN ID',async()=>{
    const signal=new AbortController().signal;
    explorer.mockResolvedValueOnce({...result,columns:['PN ID - identifier','Name']}).mockResolvedValueOnce(result);
    expect(await getDeportationCaseRecords(' PN1 ',1,signal)).toBe(result);
    expect(explorer).toHaveBeenLastCalledWith('deportationrecords','',1,{'PN ID - identifier':['PN1']},'','asc',100,signal);
  });
  it('uses the table column directly and preserves pagination and cancellation',async()=>{
    const signal=new AbortController().signal;
    explorer.mockResolvedValue(result);
    await getDeportationCaseRecords('PN1',2,signal,'PN ID');
    expect(explorer).toHaveBeenCalledTimes(1);
    expect(explorer).toHaveBeenCalledWith('deportationrecords','',2,{'PN ID':['PN1']},'','asc',100,signal);
  });
  it('fails safely instead of displaying unrelated records when no identifier exists',async()=>{
    explorer.mockResolvedValue({...result,columns:['Name']});
    await expect(getDeportationCaseRecords('PN1',1,new AbortController().signal)).rejects.toThrow('No PN ID column');
    expect(explorer).toHaveBeenCalledTimes(1);
  });
  it('recognizes identifiers and leaves missing IDs unclickable',()=>{
    expect(isDeportationIdColumn('PN ID')).toBe(true);
    expect(isDeportationIdColumn('Deportation ID')).toBe(true);
    expect(isDeportationIdColumn('Beneficiary ID')).toBe(false);
    for(const missing of [null,undefined,'',' ','-','\u2014'])expect(hasDeportationId(missing)).toBe(false);
    expect(hasDeportationId('PN1')).toBe(true);
  });
});
