
import http from "node:http";

// 教学模拟数据，后续替换成数据库查询
const energyData = {
  "A站|2026-10-20": 12500,
  "B站|2026-10-20": 9800,
  "A站|2026-10-21": 13200,
  "B站|2026-10-21": 10100,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3001");

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET" || url.pathname !== "/api/energy/station") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "接口不存在" }));
    return;
  }

  const station = url.searchParams.get("station");
  const date = url.searchParams.get("date");

  if (!station || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "station或date参数不正确" }));
    return;
  }

  const energy = energyData[`${station}|${date}`];

  if (energy === undefined) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "没有找到对应的能耗数据" }));
    return;
  }

  res.writeHead(200);
  res.end(JSON.stringify({
    station,
    date,
    energy,
    unit: "kWh",
    source: "Node.js业务接口（教学模拟数据）"
  }));
});

server.listen(3001, "127.0.0.1", () => {
  console.log("能源业务服务启动：http://127.0.0.1:3001");
});
