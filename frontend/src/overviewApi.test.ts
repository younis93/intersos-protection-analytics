import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {getLegalOverview} from "./api";
import {invalidateLegalQueries, setLegalRevision} from "./legalQueryCache";

beforeEach(()=>{invalidateLegalQueries();setLegalRevision("overview-source")});
afterEach(()=>{vi.unstubAllGlobals();invalidateLegalQueries()});

it("sends overview dimensions and case filters without changing the input",async()=>{
  const network=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({overview:{services:2}}),{status:200}));
  vi.stubGlobal("fetch",network);
  const selection={projects:["P1"],locations:["L1"],months:["2026-02"],filters:{"beneficiaries::Nationality":["Iraq"]}};
  const original=JSON.stringify(selection);
  expect(await getLegalOverview(selection)).toEqual({overview:{services:2}});
  expect(network.mock.calls[0][0]).toContain("/api/legal/overview");
  expect(JSON.parse(network.mock.calls[0][1]!.body as string)).toEqual(selection);
  expect(JSON.stringify(selection)).toBe(original);
  await getLegalOverview(selection);
  expect(network).toHaveBeenCalledTimes(1);
  setLegalRevision("new-source");
  await getLegalOverview(selection);
  expect(network).toHaveBeenCalledTimes(2);
});

it("rejects a canceled overview request",async()=>{
  let resolve!:(response:Response)=>void;
  vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(done=>{resolve=done})));
  const controller=new AbortController();
  const pending=getLegalOverview({projects:[],locations:[],months:[],filters:{}},controller.signal);
  const rejected=expect(pending).rejects.toMatchObject({name:"AbortError"});
  controller.abort();
  resolve(new Response("{}",{status:200}));
  await rejected;
});
