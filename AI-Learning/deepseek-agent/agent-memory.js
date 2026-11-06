import { createInterface } from "node:readline/promises";

import {
  stdin as input,
  stdout as output
} from "node:process";

// ========== Agent 的短期记忆 ==========

const messages = [
  {
    role: "system",
    content:
      "你是地铁能源管理助手。" +
      "所有工具数据都是教学模拟数据。" +
      "查询能耗必须使用工具，不能编造。" +
      "比较能耗时，先查询两个车站的数据，" +
      "然后使用计算工具进行比较。" +
      "你需要结合历史聊天记录理解用户。" +
      "例如：'它'、'同一天'、'这两个站'等表达。" +
      "如果历史记录仍不足以确定意思，应主动询问。"
  }
];

// ========== 1. 准备模拟数据 ==========
import { API_KEY } from "./config.js";
// 模拟车站用电量数据
const energyData = {
  "A站|2026-10-20": 12500,
  "B站|2026-10-20": 9800,
};

// 模拟车站基础信息
const stationData = {
  "A站": {
    line: "演示1号线",
    location: "模拟区域东部",
  },
  "B站": {
    line: "演示2号线",
    location: "模拟区域西部",
  },
};

// ========== 2. 编写两个工具 ==========

// 工具一：查询用电量
function getStationEnergy({ station, date }) {
  if (typeof station !== "string" ||
      typeof date !== "string") {
    return { error: "参数不正确" };
  }

  const energy = energyData[`${station}|${date}`];

  if (energy === undefined) {
    return { error: "没有找到对应的用电量数据" };
  }

  return {
    station,
    date,
    energy,
    unit: "kWh",
    source: "教学模拟数据",
  };
}

// 工具二：查询车站信息
function getStationInfo({ station }) {
  if (typeof station !== "string") {
    return { error: "车站名称不正确" };
  }

  const info = stationData[station];

  if (!info) {
    return { error: "没有找到对应的车站" };
  }

  return {
    station,
    ...info,
    source: "教学模拟数据",
  };
}

// 工具三：计算两个车站的能耗差异
function calculateEnergyDifference({ energyA, energyB }) {

  // 检查参数
  if (
    typeof energyA !== "number" ||
    typeof energyB !== "number" ||
    !Number.isFinite(energyA) ||
    !Number.isFinite(energyB) ||
    energyA < 0 ||
    energyB <= 0
  ) {
    return { error: "能耗参数不正确" };
  }

  // 计算差值
  const difference = energyA - energyB;

  // 计算百分比，以 B 站为基准
  const percentage = (difference / energyB) * 100;

  return {
    energyA,
    energyB,
    differenceKwh: difference,
    percentage: Number(percentage.toFixed(2)),
    comparisonBase: "B站",
    source: "根据输入数值计算",
  };
}

// ========== 3. 告诉 AI 有哪些工具 ==========

const tools = [
  {
    type: "function",
    function: {
      name: "get_station_energy",
      description: "查询指定车站某一天的用电量",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string" },
          date: {
            type: "string",
            description: "日期格式：YYYY-MM-DD",
          },
        },
        required: ["station", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_station_info",
      description: "查询车站所在的线路和区域信息",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string" },
        },
        required: ["station"],
      },
    },
  },
];

// 注册第三个工具：能耗差异计算
tools.push({
  type: "function",
  function: {
    name: "calculate_energy_difference",

    description:
      "比较两个车站的用电量。必须先通过" +
      "get_station_energy 查询两个车站的数据，" +
      "取得实际数值后才能使用本工具。",

    parameters: {
      type: "object",
      properties: {
        energyA: {
          type: "number",
          description: "A站的用电量，单位kWh",
        },
        energyB: {
          type: "number",
          description: "B站的用电量，单位kWh",
        },
      },
      required: ["energyA", "energyB"],
    },
  },
});

// 工具名称和实际函数的对应关系
const handlers = {
  get_station_energy: getStationEnergy,
  get_station_info: getStationInfo,
};

handlers.calculate_energy_difference = calculateEnergyDifference;

// ========== 4. 调用 DeepSeek API ==========

async function callDeepSeek(messages) {
  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages,
        tools,

        // 核心：让 AI 自己选择是否使用工具
        tool_choice: "auto",

        thinking: { type: "disabled" },
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data.error));
  }

  if (!data.choices?.[0]?.message) {
    throw new Error("DeepSeek 没有返回有效消息");
  }
  
  return data.choices[0].message;
}

// ========== 5. Agent 自主调用工具 ==========

async function runAgent(question) {
   // 把本次用户问题加入历史记录
  messages.push({
    role: "user",
    content: question
  });

  console.log("用户问题：", question);

  // 最多允许 5 轮工具调用，避免无限循环
  for (let round = 0; round < 5; round++) {
    
    const assistant = await callDeepSeek(messages);

    messages.push(assistant);

    const toolCalls = assistant.tool_calls || [];
    console.log(`\n===== 第 ${round + 1} 轮 AI 决策 =====`);
    // AI 没有调用工具，说明准备回答了
    if (toolCalls.length === 0) {
      console.log("\nAgent 最终回答：");
      console.log(assistant.content);
      return;
    }

    // 执行 AI 选择的所有工具
    for (const call of toolCalls) {
      const toolName = call.function.name;

      let result;

      try {
        const args = JSON.parse(
          call.function.arguments || "{}"
        );

        const handler = handlers[toolName];

        if (!handler) {
          throw new Error("未知工具：" + toolName);
        }

        console.log("\nAI 选择工具：", toolName);
        console.log("传入参数：", args);

        result = handler(args);
      } catch (error) {
        result = { error: error.message };
      }

      console.log("工具返回：", result);

      // 把工具结果告诉 DeepSeek
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  console.log("达到最大工具调用轮数，任务停止");
}

// ========== 6. 启动 Agent ==========

if (!API_KEY) {
  console.error("没有读取到 DEEPSEEK_API_KEY");
  process.exit(1);
}

// ========== 开启多轮对话 ==========

const rl = createInterface({
  input,
  output
});

console.log("地铁能源 Agent 已启动！");
console.log("输入问题开始聊天。");
console.log("输入'清空'可以清除聊天记录。");
console.log("输入'退出'可以结束程序。");

try {
  while (true) {

    // 等待用户输入
    const question = (
      await rl.question("\n你：")
    ).trim();

    // 结束程序
    if (question === "退出" ||
        question.toLowerCase() === "exit") {
      console.log("Agent 已退出");
      break;
    }

    // 清空记忆，只保留系统提示词
    if (question === "清空") {
      messages.splice(1);
      console.log("聊天记忆已清空");
      continue;
    }

    // 忽略空输入
    if (!question) {
      continue;
    }

    // 记录本轮开始前的消息数量
    const checkpoint = messages.length;

    try {
      // 执行 Agent
      await runAgent(question);
    } catch (error) {
      // 本轮出错时撤回未完成的对话
      messages.splice(checkpoint);
      console.error("运行失败：", error.message);
    }
  }
} finally {
  rl.close();
}