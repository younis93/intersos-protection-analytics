import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ProcessingRecords from './ProcessingRecords';
import {pollImportProgress,type LegalImportProgress} from './importProgress';

const snapshot:LegalImportProgress={operationId:'current',state:'processing',stage:'Validating',dataset:'assessments',completedWork:5,totalWork:10,percent:50,error:''};
afterEach(()=>vi.useRealTimers());
describe('processing progress',()=>{
  it('shows measured overall progress during restoration',()=>{
    const markup=renderToStaticMarkup(<ProcessingRecords progress={snapshot} restoring/>);
    expect(markup).toContain('LOADING LEGAL DATA');
    expect(markup).toContain('50%');
    expect(markup).toContain('aria-valuenow="50"');
    expect(markup).toContain('Validating - assessments');
    expect(markup).not.toContain('about a minute');
    expect(markup).not.toContain('Working');
  });
  it('separates upload bytes from processing and leaves discovery indeterminate',()=>{
    const upload=renderToStaticMarkup(<ProcessingRecords progress={snapshot} uploadPercent={32}/>);
    expect(upload).toContain('32%');expect(upload).not.toContain('50%');
    const pending=renderToStaticMarkup(<ProcessingRecords progress={null}/>);
    expect(pending).toContain('Preparing...');expect(pending).not.toContain('aria-valuenow');
  });
  it('never overlaps polls and stops after successful publication',async()=>{
    vi.useFakeTimers();const receive=vi.fn();
    let resolve!:(value:LegalImportProgress)=>void;
    const read=vi.fn(()=>new Promise<LegalImportProgress>(done=>{resolve=done;}));
    const stop=pollImportProgress('current',receive,read);
    await vi.advanceTimersByTimeAsync(1000);expect(read).toHaveBeenCalledTimes(1);
    resolve(snapshot);await vi.advanceTimersByTimeAsync(250);expect(read).toHaveBeenCalledTimes(2);
    resolve({...snapshot,state:'complete',percent:100});await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);expect(receive).toHaveBeenCalledTimes(2);stop();
  });
  it('rejects old operations and responses arriving after cancellation',async()=>{
    vi.useFakeTimers();const receive=vi.fn();
    const read=vi.fn(async()=>({...snapshot,operationId:'old'}));
    const stop=pollImportProgress('current',receive,read);
    await vi.advanceTimersByTimeAsync(1);expect(receive).not.toHaveBeenCalled();stop();
    let resolve!:(value:LegalImportProgress)=>void;
    const stopLate=pollImportProgress('current',receive,()=>new Promise(done=>{resolve=done;}));
    stopLate();resolve(snapshot);await vi.advanceTimersByTimeAsync(1000);
    expect(receive).not.toHaveBeenCalled();
  });
});
