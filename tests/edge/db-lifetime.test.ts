import {describe,it,expect,vi,beforeEach} from 'vitest';
const driver=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('npm:postgres@3.4.9',()=>({default:driver.create}));
import {withShortDB,shortSQL} from '../../supabase/functions/_shared/short-db.ts';
function client(reserve=vi.fn().mockResolvedValue({release:vi.fn()})) {
  return {reserve,end:vi.fn().mockResolvedValue(undefined)};
}
beforeEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
describe('short DB lifetime',()=>{
 it('ends after success and after ambiguous business failure without retrying',async()=>{
  const c=client();driver.create.mockReturnValue(c);const work=vi.fn().mockResolvedValue({accepted:true});
  expect(await withShortDB('fixture',work)).toEqual({accepted:true});expect(work).toHaveBeenCalledTimes(1);expect(c.end).toHaveBeenCalledTimes(1);
  work.mockRejectedValueOnce(Object.assign(new Error('ambiguous commit'),{code:'53300'}));
  await expect(withShortDB('fixture',work)).rejects.toThrow('ambiguous commit');
  expect(driver.create).toHaveBeenCalledTimes(2);expect(work).toHaveBeenCalledTimes(2);expect(c.end).toHaveBeenCalledTimes(2);
 });
 it('retries saturation before work, releases each client, commits once',async()=>{
  vi.useFakeTimers();const first=client(vi.fn().mockRejectedValue(Object.assign(new Error(),{code:'53300'})));const second=client();
  driver.create.mockReturnValueOnce(first).mockReturnValue(second);const work=vi.fn().mockResolvedValue({accepted:true});
  const result=withShortDB('fixture',work);await vi.runAllTimersAsync();
  expect(await result).toEqual({accepted:true});expect(work).toHaveBeenCalledTimes(1);expect(first.end).toHaveBeenCalledOnce();expect(second.end).toHaveBeenCalledOnce();
 });
 it('closes an expired acquisition and never invokes a late callback',async()=>{
  vi.useFakeTimers();let resolve!:(v:unknown)=>void;
  const c=client(vi.fn(()=>new Promise(r=>{resolve=r;})));driver.create.mockReturnValue(c);const work=vi.fn();
  const result=withShortDB('fixture',work,{deadline:Date.now()+50});const check=expect(result).rejects.toThrow('Database unavailable');
  await vi.advanceTimersByTimeAsync(51);await check;expect(c.end).toHaveBeenCalledOnce();
  resolve({release:vi.fn()});await Promise.resolve();expect(work).not.toHaveBeenCalled();
 });
 it('bounds saturation retries and does not retry other acquisition errors',async()=>{
  vi.useFakeTimers();const c=client(vi.fn().mockRejectedValue({code:'53300'}));driver.create.mockReturnValue(c);
  const work=vi.fn();const result=withShortDB('fixture',work);const check=expect(result).rejects.toThrow('Database unavailable');
  await vi.runAllTimersAsync();await check;expect(driver.create).toHaveBeenCalledTimes(5);expect(work).not.toHaveBeenCalled();
  driver.create.mockClear();c.reserve.mockRejectedValue({code:'42501'});await expect(withShortDB('fixture',work)).rejects.toThrow('Database unavailable');expect(driver.create).toHaveBeenCalledOnce();
 });
 it('serializes facade operations and blocks queries after end',async()=>{
  const sql=shortSQL('fixture');await sql.end();await expect(sql`SELECT 1`).rejects.toThrow('Database closed');expect(driver.create).not.toHaveBeenCalled();
 });
});
