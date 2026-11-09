from fastapi import FastAPI

import sqlite3
from pathlib import Path
from datetime import date

from fastapi import HTTPException

# 获取数据库的绝对路径
DB_PATH = Path(__file__).resolve().parent / "data" / "energy.sqlite"

app = FastAPI(title="地铁能源分析服务")


@app.get("/hello")
def hello():
    return {
        "message": "Python FastAPI 服务运行成功"
    }



@app.get("/api/energy/trend")
def analyze_energy_trend(
    station: str,
    start_date: date,
    end_date: date
):
    # 1. 验证日期
    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="开始日期不能晚于结束日期"
        )

    # 2. 检查数据库是否存在
    if not DB_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="数据库不存在，请先完成第15节"
        )

    # 3. 连接SQLite
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        # 4. 查询指定时间段的数据
        rows = conn.execute(
            """
            SELECT date, energy
            FROM station_energy
            WHERE station = ?
              AND date >= ?
              AND date <= ?
            ORDER BY date
            """,
            (
                station,
                start_date.isoformat(),
                end_date.isoformat()
            )
        ).fetchall()

    finally:
        conn.close()

    # 5. 没有数据
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="该车站在指定区间内没有能耗数据"
        )

    # 6. 提取用电量
    values = [row["energy"] for row in rows]

    # 7. 计算平均值
    average_energy = round(
        sum(values) / len(values), 2
    )

    # 8. 计算首末记录变化率
    first = values[0]
    last = values[-1]

    change_rate = None

    if len(values) >= 2 and first != 0:
        change_rate = round(
            (last - first) / first * 100, 2
        )

    # 9. 简单检查明显波动
    possible_anomalies = []

    for i in range(1, len(rows)):
        previous = rows[i - 1]["energy"]
        current = rows[i]["energy"]

        if previous == 0:
            continue

        rate = round(
            (current - previous) / previous * 100, 2
        )

        if abs(rate) >= 20:
            possible_anomalies.append({
                "date": rows[i]["date"],
                "change_rate_percent": rate
            })

    # 10. 返回分析结果
    return {
        "station": station,
        "start_date": str(start_date),
        "end_date": str(end_date),
        "records_count": len(rows),
        "records": [
            {
                "date": row["date"],
                "energy": row["energy"]
            }
            for row in rows
        ],
        "average_energy": average_energy,
        "min_energy": min(values),
        "max_energy": max(values),
        "change_rate_percent": change_rate,
        "possible_anomalies": possible_anomalies,
        "unit": "kWh",
        "source": "SQLite数据库（教学模拟数据）",
        "anomaly_rule": "相邻有记录日期变化率绝对值达到20%"
    }