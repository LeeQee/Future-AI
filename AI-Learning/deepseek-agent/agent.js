// 用户提出问题---ai分析问题--返回工具名称和参数---nodejs执行工具查询---将查询结果返回给ai---ai回答用户
// 第一个 DeepSeek Agent：查询车站用电量

import { API_KEY } from "./config.js";
const API_URL = "https://api.deepseek.com/chat/completions";

// 1. 模拟业务数据
const energyData = {
  "A站|2026-10-20": 12500,
  "B站|2026-10-20": 9800
};

// 2. 定义真正执行查询的函数
function getStationEnergy({ station, date }) {
  const energy = energyData[`${station}|${date}`];

  if (energy === undefined) {
    return { success: false, message: "没有找到对应的用电数据" };
  }

  return {
    success: true,
    station,
    date,
    energy,
    unit: "kWh",
    source: "教学模拟数据"
  };
}

// 3. 告诉 DeepSeek 有哪些工具
const tools = [
  {
    type: "function",
    function: {
      name: "get_station_energy",
      description: "查询指定车站某一天的用电量",
      parameters: {
        type: "object",
        properties: {
          station: {
            type: "string",
            description: "车站名称，例如A站"
          },
          date: {
            type: "string",
            description: "日期，格式YYYY-MM-DD"
          }
        },
        required: ["station", "date"]
      }
    }
  }
];

// 4. 封装 DeepSeek API 请求
async function callDeepSeek(messages, toolChoice = "auto") {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages,
      tools,
      tool_choice: toolChoice,
      thinking: { type: "disabled" },
      stream: false
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${data.error?.message || "请求失败"}`
    );
  }

  return data.choices[0].message;
}

// 5. Agent 主程序
async function main() {
  if (!API_KEY) {
    throw new Error("没有读取到 DEEPSEEK_API_KEY");
  }

  const question = process.argv.slice(2).join(" ")
    || "查询A站2026年10月20日的用电量";

  const messages = [
    {
      role: "system",
      content: "你是车站能源助手。必须根据工具数据回答，不能编造。"
    },
    {
      role: "user",
      content: question
    }
  ];

  console.log("用户问题：", question);

  // 第一次请求：让 AI 生成工具调用
  const first = await callDeepSeek(messages, "required");

   console.log("first：", first);

  const calls = first.tool_calls || [];

  if (calls.length === 0) {
    console.log("AI回答：", first.content);
    return;
  }

  // 保存 AI 返回的工具请求
  messages.push(first);

  // 执行工具请求
  for (const call of calls) {
    console.log("call:",call)
    const toolName = call.function.name;

    let result;

    try {
      const args = JSON.parse(call.function.arguments);

      if (toolName === "get_station_energy") {
        result = getStationEnergy(args);
      } else {
        result = { success: false, message: "未知工具" };
      }
    } catch {
      result = { success: false, message: "参数错误" };
    }

    console.log("AI调用工具：", toolName);
    console.log("调用参数：", call.function.arguments);
    console.log("函数执行结果：", result);

    // 把真实执行结果交回对话
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }
  console.log("messages:", messages);
  // 第二次请求：让 AI 根据工具结果回答
  const final = await callDeepSeek(messages, "none");

  console.log("\nDeepSeek最终回答：");
  console.log(final.content);
}

main().catch(error => {
  console.error("运行失败：", error.message);
  process.exitCode = 1;
});