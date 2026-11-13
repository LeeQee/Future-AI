

import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir
} from "node:fs/promises";

// ========== 1. 模拟业务数据 ==========
import { API_KEY } from "./config.js";
const energyData = {
  "A站|2026-10-20": 12500,
  "B站|2026-10-20": 9800
};

const stationData = {
  "A站": {
    line: "演示1号线",
    location: "模拟区域东部"
  },
  "B站": {
    line: "演示2号线",
    location: "模拟区域西部"
  }
};

// ========== 2. 实际执行的工具 ==========

const handlers = {

  async get_station_energy({ station, date } = {}) {
    if (!station || !date) {
      return { error: "缺少station或date参数" };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "日期格式应为YYYY-MM-DD" };
    }

    const params = new URLSearchParams({ station, date });

    const url =
      `http://127.0.0.1:3001/api/energy/station?${params}`;

    console.log("Agent正在请求业务接口：", url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || `业务接口返回HTTP ${response.status}`
      };
    }

    if (typeof data.energy !== "number") {
      return { error: "业务接口返回的能耗格式错误" };
    }

    return data;
  },

  get_station_info({ station } = {}) {
    const info = stationData[station];

    if (!info) {
      return { error: "没有找到车站信息" };
    }

    return {
      station,
      ...info,
      source: "教学模拟数据"
    };
  },

  calculate_energy_difference({ energyA, energyB } = {}) {

    if (
      typeof energyA !== "number" ||
      typeof energyB !== "number" ||
      !Number.isFinite(energyA) ||
      !Number.isFinite(energyB) ||
      energyA < 0 ||
      energyB <= 0
    ) {
      return { error: "计算参数不正确" };
    }

    return {
      differenceKwh: energyA - energyB,
      percentage: Number(
        (((energyA - energyB) / energyB) * 100).toFixed(2)
      ),
      comparisonBase: "第二个车站"
    };
  },

  async analyze_energy_trend({
    station,
    start_date,
    end_date
  } = {}) {

    if (
      typeof station !== "string" ||
      typeof start_date !== "string" ||
      typeof end_date !== "string" ||
      !station.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(start_date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end_date)
    ) {
      return { error: "趋势分析工具参数不正确" };
    }

    const params = new URLSearchParams({
      station,
      start_date,
      end_date
    });

    const url =
      `http://127.0.0.1:8000/api/energy/trend?${params}`;

    console.log("正在调用Python工具：", url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.detail || `Python接口HTTP ${response.status}`
      };
    }

    return data;
  },
};

// 工具显示名称
const TOOL_LABELS = {
  get_station_energy: "查询车站用电量",
  get_station_info: "查询车站基础信息",
  calculate_energy_difference: "计算能耗差异",
  analyze_energy_trend: "分析车站能耗趋势"
};

// ========== 3. 提供给模型的工具说明 ==========

const tools = [
  {
    type: "function",
    function: {
      name: "get_station_energy",
      description: "查询车站某一天的用电量",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string" },
          date: {
            type: "string",
            description: "日期格式YYYY-MM-DD"
          }
        },
        required: ["station", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_station_info",
      description: "查询车站所在的线路和区域",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string" }
        },
        required: ["station"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_energy_difference",
      description:
        "比较两个用电量。必须先查询两个车站的数据，再调用本工具计算。",
      parameters: {
        type: "object",
        properties: {
          energyA: { type: "number" },
          energyB: { type: "number" }
        },
        required: ["energyA", "energyB"]
      }
    }
  },{
    type: "function",
    function: {
      name: "analyze_energy_trend",

      description:
        "查询指定车站在日期区间内的用电数据，" +
        "分析平均用电量、最大最小用电量、" +
        "首末记录变化率和疑似异常波动。" +
        "用户要求分析能耗趋势、历史变化或异常时使用此工具。" +
        "数据为教学模拟数据。",

      parameters: {
        type: "object",

        properties: {
          station: {
            type: "string",
            description: "车站名称，例如A站"
          },

          start_date: {
            type: "string",
            description: "开始日期，YYYY-MM-DD"
          },

          end_date: {
            type: "string",
            description: "结束日期，YYYY-MM-DD"
          }
        },

        required: [
          "station",
          "start_date",
          "end_date"
        ]
      }
    }
  }

];

function routeTools(question) {
  const text = String(question ?? "").toLowerCase();

  const contains = (words) =>
    words.some(word => text.includes(word));

  const selected = new Set();

  // 1. 趋势分析类问题
  const isTrend = contains([
    "趋势",
    "走势",
    "历史",
    "平均",
    "异常",
    "波动",
    "时间段",
    "一段时间"
  ]);

  // 2. 比较类问题
  const isCompare = contains([
    "比较",
    "对比",
    "差异",
    "相差",
    "高多少",
    "低多少",
    "哪个更高",
    "谁更高"
  ]);

  // 3. 单日能耗查询
  const isEnergy = contains([
    "用电量",
    "能耗",
    "耗电",
    "电量"
  ]);

  // 4. 车站基本信息
  const isStationInfo = contains([
    "车站信息",
    "车站资料",
    "位置",
    "属于哪条线",
    "哪条线路"
  ]);

  if (isTrend) {
    selected.add("analyze_energy_trend");
  }

  if (isCompare) {
    selected.add("get_station_energy");
    selected.add("calculate_energy_difference");
  }

  if (isEnergy && !isTrend && !isCompare) {
    selected.add("get_station_energy");
  }

  if (isStationInfo) {
    selected.add("get_station_info");
  }

  // 没识别出意图时，回退到全部工具
  if (selected.size === 0) {
    return tools;
  }

  // 根据工具名称过滤工具定义
  return tools.filter(tool =>
    selected.has(tool.function.name)
  );
}

// ========== 4. 调用 DeepSeek ==========

async function callDeepSeek(messages) {

  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages,
        tools,
        tool_choice: "auto",
        thinking: { type: "disabled" },
        stream: false
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data.error));
  }

  return data.choices[0].message;
}

// ========== 流式调用 DeepSeek ==========

async function callDeepSeekStream(
  messages,
  onText,
  activeTools = tools
) {

  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages,
        tools: activeTools,
        tool_choice: "auto",
        thinking: { type: "disabled" },

        // 核心变化：开启流式输出
        stream: true
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (!response.body) {
    throw new Error("DeepSeek没有返回流式响应");
  }

  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let receivedDone = false;

  // 存储模型流式生成的工具调用
  const toolCallMap = new Map();

  // 持续读取 DeepSeek 返回的数据
  for await (const bytes of response.body) {

    buffer += decoder.decode(bytes, {
      stream: true
    });

    // SSE事件之间用空行分隔
    const events = buffer.split(/\r?\n\r?\n/);

    // 最后一段可能不完整，留到下次处理
    buffer = events.pop();

    for (const event of events) {

      const line = event
        .split(/\r?\n/)
        .find(line => line.startsWith("data:"));

      if (!line) {
        continue;
      }

      const raw = line.slice(5).trim();

      // DeepSeek流结束标志
      if (raw === "[DONE]") {
        receivedDone = true;
        continue;
      }

      const chunk = JSON.parse(raw);

      const delta = chunk.choices?.[0]?.delta;

      if (!delta) {
        continue;
      }

      // ===== 普通文本片段 =====

      if (typeof delta.content === "string") {

        content += delta.content;

        // 立即把这段文字交给前端
        onText(delta.content);
      }

      // ===== 工具调用片段 =====

      for (const call of delta.tool_calls || []) {

        const index = call.index;

        const item = toolCallMap.get(index) || {
          id: "",
          type: "function",
          function: {
            name: "",
            arguments: ""
          }
        };

        if (call.id) {
          item.id = call.id;
        }

        if (call.type) {
          item.type = call.type;
        }

        if (call.function?.name) {
          item.function.name = call.function.name;
        }

        if (call.function?.arguments) {
          item.function.arguments +=
            call.function.arguments;
        }

        toolCallMap.set(index, item);
      }
    }
  }

  if (!receivedDone) {
    throw new Error("DeepSeek流式响应未正常结束");
  }

  // 把流式片段重新组装成完整assistant消息
  const toolCalls = [...toolCallMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value);

  return {
    role: "assistant",
    content: content || null,
    ...(toolCalls.length ? {
      tool_calls: toolCalls
    } : {})
  };
}

// ========== 5. Agent 主循环 ==========

async function runAgent(question, messages) {

  messages.push({
    role: "user",
    content: question
  });

  for (let round = 0; round < 5; round++) {

    const assistant = await callDeepSeek(messages);

    messages.push(assistant);

    const calls = assistant.tool_calls || [];

    // 没有工具调用，返回最终答案
    if (calls.length === 0) {
      if (typeof assistant.content !== "string") {
        throw new Error("模型没有返回有效文本");
      }

      return assistant.content;
    }

    for (const call of calls) {

      let result;

      try {
        const args = JSON.parse(
          call.function.arguments || "{}"
        );

        const handler = handlers[call.function.name];

        if (!handler) {
          throw new Error("未知工具");
        }

        console.log("调用工具：", call.function.name);

        result = await handler(args);

      } catch (error) {
        result = { error: error.message };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
  }

  throw new Error("超过最大工具调用轮数");
}

// ========== 流式 Agent 执行循环 ==========

async function runAgentStream(question, messages, onText,onStatus = () => {}) {

  const activeTools = routeTools(question);

  console.log(
    "Tool Router 筛选结果：",
    activeTools.map(tool => tool.function.name)
  );

  onStatus({
    type: "router",
    text:
      "候选工具：" +
      activeTools
        .map(tool => tool.function.name)
        .join("、")
  });
  messages.push({
    role: "user",
    content: question
  });

  for (let round = 0; round < 5; round++) {

    // 通知前端：正在请求大模型
    onStatus({
      type: "model",
      text: `第${round + 1}轮：等待DeepSeek返回`
    });

    const assistant = await callDeepSeekStream(
      messages,
      onText,
      activeTools
    );

    messages.push(assistant);

    const calls = assistant.tool_calls || [];

    // 不再调用工具，任务完成
    if (calls.length === 0) {
      return assistant.content || "";
    }

    // 执行模型选择的工具
    for (const call of calls) {

      const toolName = call.function.name;

      const label = TOOL_LABELS[toolName] || toolName;
      const args = JSON.parse(
        call.function.arguments || "{}"
      );
      // ① 通知：开始执行工具
      onStatus({
        type: "tool_start",
        tool: toolName,
        text: `开始执行：${label}`,
        args
      });

      let result;

      try {

        const args = JSON.parse(
          call.function.arguments || "{}"
        );
        const allowedToolNames = new Set(
          activeTools.map(tool => tool.function.name)
        );

        if (!allowedToolNames.has(toolName)) {
          throw new Error("当前请求未开放此工具");
        }

        const handler = handlers[toolName];

        if (!handler) {
          throw new Error("未知工具：" + toolName);
        }

        console.log("执行工具：", toolName);

        // ② 真正执行工具
        result = await handler(args);

      } catch (error) {

        result = {
          error: error.message
        };
      }

      // ③ 通知：工具完成或失败
      onStatus({
        type: result?.error ? "tool_error" : "tool_end",
        tool: toolName,
        text: result?.error
          ? `执行失败：${label}`
          : `执行完成：${label}`,
          result
      });

      // ④ 把工具结果返回给模型
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
  }

  throw new Error("超过最大工具调用轮数");
}

// ========== 6. 多用户会话存储 ==========

// async function handleChat({ userId, sessionId, message }) {
async function handleChat(
  { userId, sessionId, message },
  onText = null,
  onStatus = () => {}
) {

  const dataDir = new URL(
    `./data/users/${userId}/`,
    import.meta.url
  );

  const historyFile = new URL(
    `./data/users/${userId}/${sessionId}.json`,
    import.meta.url
  );

  let history = [];

  // 读取当前用户、当前会话的历史
  try {
    history = JSON.parse(
      await readFile(historyFile, "utf8")
    );

    if (!Array.isArray(history)) {
      throw new Error("历史记录格式不正确");
    }

  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const messages = [
    {
      role: "system",
      content:
        "你是地铁能源管理助手。" +
        "所有数据都是教学模拟数据。" +
        "查询能耗时必须使用工具，不能编造。" +
        "需要比较时，先查询再使用计算工具。" +
        "结合聊天历史理解用户问题。" +
        "信息不足时主动询问。"
    },
    ...history
  ];

  // 执行 Agent
  // const answer = await runAgent(message, messages);
  const answer = onText
    ? await runAgentStream(
        message,
        messages,
        onText,
        onStatus
      )
    : await runAgent(message, messages);

  // 保存本次会话
  await mkdir(dataDir, { recursive: true });

  await writeFile(
    historyFile,
    JSON.stringify(messages.slice(1), null, 2),
    "utf8"
  );

  return answer;
}

// ========== 7. HTTP API 服务 ==========

// 读取请求中的 JSON 数据
async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 16 * 1024) {
      throw new Error("请求内容过大");
    }

    chunks.push(chunk);
  }

  return JSON.parse(
    Buffer.concat(chunks).toString("utf8")
  );
}

// 统一返回 JSON
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data));
}

// 创建 HTTP 服务
const server = createServer(async (req, res) => {

  // 允许本地 Vue 开发服务器跨域访问
  res.setHeader(
    "Access-Control-Allow-Origin",
    "http://localhost:5173"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  // 处理浏览器跨域预检请求
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 只处理指定 API
  // if (
  //   req.url !== "/api/agent/chat" ||
  //   req.method !== "POST"
  // ) {
  if (
    ![
      "/api/agent/chat",
      "/api/agent/chat-stream"
    ].includes(req.url) ||
    req.method !== "POST"
  ) {
    sendJson(res, 404, {
      error: "接口不存在"
    });
    return;
  }
  
  let body;

  try {
    body = await readJson(req);
  } catch {
    console.error("请求体不是有效的JSON");
    sendJson(res, 400, {
      error: "请求必须是有效的JSON"
    });
    return;
  }

  const { userId, sessionId, message } = body || {};

  const validId = /^[a-zA-Z0-9_-]{1,232}$/;

  if (
    typeof userId !== "string" ||
    typeof sessionId !== "string" ||
    !validId.test(userId) ||
    !validId.test(sessionId) ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 500
  ) {
    sendJson(res, 400, {
      error: "userId、sessionId或message参数不正确"
    });
    return;
  }

  // ========== SSE流式接口 ==========

  if (req.url === "/api/agent/chat-stream") {

    // 声明返回内容为事件流
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    // 向浏览器发送一个SSE事件
    function sendEvent(event, data) {

      if (res.writableEnded) {
        return;
      }

      res.write(
        `event: ${event}\n` +
        `data: ${JSON.stringify(data)}\n\n`
      );
    }
    
    try {

      // 执行流式Agent
      await handleChat(
        { userId, sessionId, message },

        // 发送模型生成的文字
        (text) => {
          sendEvent("delta", { text });
        },

        // 发送Agent的执行状态
        (status) => {
          sendEvent("status", status);
        }
      );

      // 通知前端：生成完成
      sendEvent("done", {});

    } catch (error) {

      console.error("流式Agent执行失败：", error);

      sendEvent("error", {
        message: "Agent流式执行失败"
      });

    } finally {
      res.end();
    }

    return;
  }


  try {
    const answer = await handleChat({
      userId,
      sessionId,
      message
    });

    sendJson(res, 200, {
      success: true,
      userId,
      sessionId,
      answer
    });

  } catch (error) {
    console.error("Agent执行失败：", error);

    sendJson(res, 500, {
      success: false,
      error: "Agent服务执行失败，请查看服务端日志"
    });
  }
});

// 只监听本机，供学习和开发测试
if (!API_KEY) {
  console.error("请先配置 DEEPSEEK_API_KEY");
  process.exit(1);
}

server.listen(3000, "127.0.0.1", () => {
  console.log("Agent服务已启动！");
  console.log("地址：http://127.0.0.1:3000");
});
