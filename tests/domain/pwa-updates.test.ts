import { readFileSync } from "node:fs";
import {runInNewContext} from "node:vm";
import {expect,it,vi} from "vitest";

it("loads navigations from the network without reusing stale HTML and falls back offline",async()=>{
 const handlers:Record<string,(event:unknown)=>void>={};
 const fetch=vi.fn().mockResolvedValue("fresh page"),match=vi.fn().mockResolvedValue("offline page");
 runInNewContext(readFileSync("public/sw.js","utf8"),{URL,fetch,caches:{match},self:{location:{origin:"https://mata-beauty.com"},addEventListener:(type:string,handler:(event:unknown)=>void)=>{handlers[type]=handler;}}});
 const request={method:"GET",url:"https://mata-beauty.com/pro/team",mode:"navigate"};
 let result:Promise<unknown>|undefined;
 const navigate=async()=>{handlers.fetch({request,respondWith:(value:Promise<unknown>)=>{result=value;}});return result;};
 expect(await navigate()).toBe("fresh page");expect(fetch).toHaveBeenCalledWith(request,{cache:"no-store"});
 fetch.mockRejectedValueOnce(new Error("offline"));expect(await navigate()).toBe("offline page");expect(match).toHaveBeenCalledWith("/offline");
});
it("cleans only old Mata shell caches before taking control of open apps",async()=>{
 const handlers:Record<string,(event:unknown)=>void>={},remove=vi.fn().mockResolvedValue(true),claim=vi.fn().mockResolvedValue(undefined);
 runInNewContext(readFileSync("public/sw.js","utf8"),{URL,caches:{keys:async()=>["mata-beauty-shell-v2","mata-beauty-shell-v3","unrelated-cache"],delete:remove},self:{clients:{claim},addEventListener:(type:string,handler:(event:unknown)=>void)=>{handlers[type]=handler;}}});
 let result:Promise<unknown>|undefined;
 handlers.activate({waitUntil:(value:Promise<unknown>)=>{result=value;}});await result;
 expect(remove).toHaveBeenCalledExactlyOnceWith("mata-beauty-shell-v2");expect(claim).toHaveBeenCalledOnce();
});
