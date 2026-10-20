import {beforeEach,describe,expect,it,vi} from 'vitest';
import {getLegalExplorer} from './api';
import {getAwarenessCaseRecords,isAwarenessIdColumn} from './awarenessCase';
vi.mock('./api',()=>({getLegalExplorer:vi.fn()}));
const explorer=vi.mocked(getLegalExplorer);
const result={dataset:'awareness',total:0,page:1,pageSize:100,columns:['Awareness ID'],rows:[]};

describe('awareness record lookup',()=>{
  beforeEach(()=>explorer.mockReset());
  it('discovers the Awareness ID column and requests only that exact session',async()=>{
    const signal=new AbortController().signal;
    explorer.mockResolvedValueOnce({...result,columns:['Awareness ID - identifier','Participant Name']}).mockResolvedValueOnce(result);
    expect(await getAwarenessCaseRecords(' AW1 ',1,signal)).toBe(result);
    expect(explorer).toHaveBeenLastCalledWith('awareness','',1,{'Awareness ID - identifier':['AW1']},'','asc',100,signal);
  });
  it('uses the source table column and supports paging and cancellation',async()=>{
    const signal=new AbortController().signal;explorer.mockResolvedValue(result);
    await getAwarenessCaseRecords('AW1',2,signal,'Awareness ID');
    expect(explorer).toHaveBeenCalledTimes(1);
    expect(explorer).toHaveBeenCalledWith('awareness','',2,{'Awareness ID':['AW1']},'','asc',100,signal);
  });
  it('does not substitute a beneficiary ID when the awareness identifier is absent',async()=>{
    explorer.mockResolvedValue({...result,columns:['Beneficiary ID']});
    await expect(getAwarenessCaseRecords('AW1',1,new AbortController().signal)).rejects.toThrow('No Awareness ID column');
    expect(explorer).toHaveBeenCalledTimes(1);
    expect(isAwarenessIdColumn('Awareness ID')).toBe(true);
    expect(isAwarenessIdColumn('Beneficiary ID')).toBe(false);
  });
});
