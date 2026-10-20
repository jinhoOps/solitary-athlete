import {afterEach,expect,it,vi} from 'vitest';
import {requestPhotos} from '../../src/photo-request';
afterEach(()=>vi.unstubAllGlobals());
it('shares an in-flight lookup and cancellation does not abort another viewer',async()=>{
 let finish!:(response:Response)=>void;let upstream!:AbortSignal;
 const fetcher=vi.fn((_url,init)=>{upstream=init.signal;return new Promise<Response>(resolve=>{finish=resolve;});});
 vi.stubGlobal('fetch',fetcher);
 const first=new AbortController(),second=new AbortController();
 const a=requestPhotos('https://example.test','key','body',first.signal).catch(error=>error.name);
 const b=requestPhotos('https://example.test','key','body',second.signal);
 expect(fetcher).toHaveBeenCalledTimes(1);
 first.abort();expect(await a).toBe('AbortError');expect(upstream.aborted).toBe(false);
 finish(new Response('{"photos":[]}'));
 expect(await (await b).json()).toEqual({photos:[]});
});
it('releases the lookup when all viewers cancel and does not cache signed links',async()=>{
 let upstream!:AbortSignal;
 const fetcher=vi.fn((_url,init)=>{upstream=init.signal;return new Promise<Response>(()=>{});});
 vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();
 const a=requestPhotos('https://example.test','key','other',controller.signal).catch(error=>error.name);
 controller.abort();expect(await a).toBe('AbortError');expect(upstream.aborted).toBe(true);
 const next=new AbortController();const b=requestPhotos('https://example.test','key','other',next.signal).catch(error=>error.name);
 expect(fetcher).toHaveBeenCalledTimes(2);next.abort();await b;
});
