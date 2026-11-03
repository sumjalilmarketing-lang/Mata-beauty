import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
it("preserves legacy amounts and enforces the database rate bounds", async () => {
 const db = new PGlite();
 try {
  await db.exec("create table provider_services(id int primary key,price_amount int,deposit_amount int);insert into provider_services values(1,10000,0),(2,500,100);");
  await db.exec(await readFile(new URL("../../supabase/migrations/20261103192448_service_deposit_percentage.sql", import.meta.url),"utf8"));
  expect((await db.query("select * from provider_services order by id")).rows).toEqual([{id:1,price_amount:10000,deposit_amount:0,deposit_percentage:0},{id:2,price_amount:500,deposit_amount:100,deposit_percentage:0}]);
  await db.exec("update provider_services set deposit_percentage=60 where id=1");
  await expect(db.exec("update provider_services set deposit_percentage=61 where id=1")).rejects.toThrow();
  await expect(db.exec("update provider_services set deposit_percentage=-1 where id=1")).rejects.toThrow();
  await expect(db.exec("update provider_services set deposit_percentage=null where id=1")).rejects.toThrow();
 } finally { await db.close(); }
},60000);
