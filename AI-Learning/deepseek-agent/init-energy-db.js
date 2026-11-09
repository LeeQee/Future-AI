import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

// 确保 data 文件夹存在
mkdirSync("./data", { recursive: true });

// 创建或打开数据库文件
const db = new DatabaseSync("./data/energy.sqlite");

// 建表：一行记录代表某车站某天的用电量
db.exec(`
  CREATE TABLE IF NOT EXISTS station_energy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station TEXT NOT NULL,
    date TEXT NOT NULL,
    energy INTEGER NOT NULL CHECK (energy >= 0),
    UNIQUE(station, date)
  )
`);

// 准备插入语句
const insert = db.prepare(`
  INSERT OR IGNORE INTO station_energy
  (station, date, energy)
  VALUES (?, ?, ?)
`);

// 写入教学数据
insert.run("A站", "2026-10-20", 12500);
insert.run("B站", "2026-10-20", 9800);
insert.run("A站", "2026-10-21", 13200);
insert.run("B站", "2026-10-21", 10100);

// 查询所有数据
const rows = db.prepare(`
  SELECT * FROM station_energy
  ORDER BY date, station
`).all();

console.table(rows);

db.close();

console.log("数据库初始化完成！");