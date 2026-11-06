// 1. 从公共配置读取 DeepSeek API Key（来自 .env 或系统环境变量）
import { API_KEY as apiKey } from "./config.js";


// 2. 定义调用 DeepSeek 的函数
async function main() {

  if (!apiKey) {
    throw new Error("没有读取到 DeepSeek API Key");
  }

  // 3. 向 DeepSeek 发送 HTTP 请求
  const response = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model: "deepseek-flash",

        messages: [
          {
            role: "system",
            content: "你是一个友好的AI助手，请使用中文回答。"
          },
          {
            role: "user",
            content: "你好，我正在学习AI Agent开发，请简单介绍一下你自己。"
          }
        ],

        thinking: {
          type: "disabled"
        },

        stream: false
      })
    }
  );

  // 4. 获取 DeepSeek 返回的数据
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${data.error?.message || "请求失败"}`
    );
  }

  // 5. 输出 AI 的回复
  console.log("DeepSeek 回复：");
  console.log(data.choices[0].message.content);
}

// 6. 启动程序
main().catch(error => {
  console.error("执行失败：", error.message);
  process.exitCode = 1;
});