import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("./data/energy.sqlite");

// 把A站指定日期的用电量改成14000
db.prepare(`
  UPDATE station_energy
  SET energy = ?
  WHERE station = ? AND date = ?
`).run(14000, "A站", "2026-10-20");

// 查看修改结果
const row = db.prepare(`
  SELECT *
  FROM station_energy
  WHERE station = ? AND date = ?
`).get("A站", "2026-10-20");

console.log(row);

db.close();