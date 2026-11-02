import {afterEach,describe,expect,it,vi} from 'vitest';
import {downloadExcelUrl} from './api';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
describe('Excel download filenames',()=>{
 it.each([['attachment; filename="review"','review.xlsx'],['attachment; filename="review.XLSX"','review.XLSX'],['','fallback.xlsx']])('keeps the Excel extension for %s',async(header,expected)=>{
  const link={href:'',download:'',click:vi.fn(),remove:vi.fn()};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,headers:new Headers({'Content-Disposition':header}),blob:async()=>new Blob(['workbook'])}));
  vi.stubGlobal('document',{createElement:()=>link,body:{appendChild:vi.fn()}});
  vi.stubGlobal('window',{setTimeout:vi.fn()});
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:workbook');
  await downloadExcelUrl('/export','fallback.xlsx');expect(link.download).toBe(expected);expect(link.click).toHaveBeenCalledOnce();expect(link.remove).toHaveBeenCalledOnce();
 });
});
