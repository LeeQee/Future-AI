
<script setup>
import { ref, nextTick } from "vue";

// 当前用户
const userId = "leon";

// 当前会话：保持不变才能实现多轮记忆
const sessionId = "vue-demo";

// 输入框内容
const inputText = ref("");

// 是否正在等待AI回答
const loading = ref(false);

// 聊天记录
const messages = ref([
  {
    role: "assistant",
    content:
      "你好，我是地铁能源 AI 助手。你可以向我查询车站用电量、车站信息或能耗差异。"
  }
]);

// 聊天容器
const chatContainer = ref(null);

// 滚动到底部
async function scrollToBottom() {
  await nextTick();

  const element = chatContainer.value;

  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

// ========== 核心：发送消息 ==========

async function sendMessage_old() {

  const question = inputText.value.trim();

  // 空消息不发送
  if (!question || loading.value) {
    return;
  }

  // 1. 先显示用户消息
  messages.value.push({
    role: "user",
    content: question
  });

  // 清空输入框
  inputText.value = "";

  // 开启加载状态
  loading.value = true;

  await scrollToBottom();

  try {

    // 2. 调用我们自己开发的Agent API
    const response = await fetch(
      "http://127.0.0.1:3000/api/agent/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          sessionId,
          message: question
        })
      }
    );

    // 3. 获取JSON响应
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    // 4. 显示Agent回答
    messages.value.push({
      role: "assistant",
      content: data.answer
    });

  } catch (error) {

    // 请求失败
    messages.value.push({
      role: "error",
      content: "请求失败：" + error.message
    });

  } finally {

    // 结束加载状态
    loading.value = false;

    await scrollToBottom();
  }
}

// ========== 流式发送消息 ==========

async function sendMessage() {

  const question = inputText.value.trim();

  if (!question || loading.value) {
    return;
  }

  // 显示用户消息
  messages.value.push({
    role: "user",
    content: question
  });

  inputText.value = "";
  loading.value = true;

  // 先创建一个空的AI消息气泡
  const answerIndex = messages.value.length;

  messages.value.push({
    role: "assistant",
    content: ""
  });

  await scrollToBottom();

  try {

    // 调用流式接口
    const response = await fetch(
      "http://127.0.0.1:3000/api/agent/chat-stream",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          sessionId,
          message: question
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("浏览器不支持读取响应流");
    }

    // 获取响应流读取器
    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";
    let receivedDone = false;

    // 持续读取服务端的数据
    while (true) {

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

      // 一个完整SSE事件以空行结束
      const events = buffer.split(/\r?\n\r?\n/);

      buffer = events.pop();

      for (const eventText of events) {

        let eventName = "";
        let eventData = "";

        // 解析SSE事件名称和内容
        for (const line of eventText.split(/\r?\n/)) {

          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          }

          if (line.startsWith("data:")) {
            eventData = line.slice(5).trim();
          }
        }

        if (!eventData) {
          continue;
        }

        const data = JSON.parse(eventData);

        // 收到新的文字片段
        if (eventName === "delta") {

          messages.value[answerIndex].content +=
            data.text || "";

          await scrollToBottom();
        }

        // 收到错误事件
        if (eventName === "error") {
          throw new Error(data.message);
        }

        // 收到完成事件
        if (eventName === "done") {
          receivedDone = true;
        }
      }
    }

    if (!receivedDone) {
      throw new Error("服务器连接提前结束");
    }

  } catch (error) {

    const answer = messages.value[answerIndex];

    answer.role = "error";

    answer.content +=
      "\n请求失败：" + error.message;

  } finally {

    loading.value = false;

    await scrollToBottom();
  }
}

// Enter发送，Shift+Enter换行
function handleKeydown(event) {

  // 中文输入法组合输入期间不触发发送
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    sendMessage();
  }
}
</script>

<template>
  <div class="page">

    <main class="chat-panel">

      <!-- 顶部 -->
      <header class="chat-header">
        <div>
          <h1>地铁能源 AI Agent</h1>
          <p>DeepSeek 智能能耗分析助手</p>
        </div>

        <span class="online-status">
          ● 在线
        </span>
      </header>

      <!-- 聊天消息区域 -->
      <section
        ref="chatContainer"
        class="chat-messages"
        role="log"
        aria-live="polite"
      >

        <div
          v-for="(item, index) in messages"
          :key="index"
          class="message-row"
          :class="item.role"
        >
          <div class="message-bubble">
            {{ item.content }}
          </div>
        </div>

        <!-- AI正在回答 -->
        <div
          v-if="loading"
          class="message-row assistant"
        >
          <div class="message-bubble thinking">
            Agent 正在思考...
          </div>
        </div>

      </section>

      <!-- 输入区域 -->
      <form
        class="chat-input-area"
        @submit.prevent="sendMessage"
      >

        <textarea
          v-model="inputText"
          placeholder="请输入你的问题..."
          rows="2"
          maxlength="500"
          :disabled="loading"
          aria-label="聊天消息"
          @keydown="handleKeydown"
        ></textarea>

        <button
          type="submit"
          :disabled="loading || !inputText.trim()"
        >
          {{ loading ? "思考中" : "发送" }}
        </button>

      </form>

      <div class="input-tip">
        Enter 发送 · Shift + Enter 换行
      </div>

    </main>

  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24px;
  background: #eaf0f8;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chat-panel {
  width: 100%;
  max-width: 900px;
  height: calc(100vh - 48px);
  max-height: 900px;
  background: #ffffff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(17, 40, 80, 0.12);
}

.chat-header {
  padding: 22px 28px;
  background: #122a50;
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.chat-header p {
  margin: 8px 0 0;
  color: #b8c9e0;
  font-size: 13px;
}

.online-status {
  color: #72ddb2;
  font-size: 13px;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.message-row {
  display: flex;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant,
.message-row.error {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 78%;
  padding: 14px 18px;
  border-radius: 14px;
  line-height: 1.7;
  font-size: 15px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.user .message-bubble {
  background: #2967cc;
  color: #ffffff;
}

.assistant .message-bubble {
  background: #eef3f9;
  color: #20344f;
}

.error .message-bubble {
  background: #fff0f0;
  color: #ba3333;
}

.thinking {
  color: #64748b;
  animation: pulse 1.4s infinite;
}

.chat-input-area {
  border-top: 1px solid #e4eaf2;
  padding: 18px 24px 8px;
  display: flex;
  gap: 12px;
}

textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 1px solid #d7e0ec;
  border-radius: 10px;
  padding: 12px;
  outline: none;
  font-size: 15px;
}

textarea:focus {
  border-color: #2967cc;
}

button {
  min-width: 90px;
  background: #2967cc;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-tip {
  padding: 0 24px 14px;
  color: #8b98aa;
  font-size: 12px;
}

@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

@media (max-width: 600px) {
  .page {
    padding: 0;
  }

  .chat-panel {
    height: 100dvh;
    max-height: none;
    border-radius: 0;
  }

  .chat-header,
  .chat-messages {
    padding: 18px;
  }

  .message-bubble {
    max-width: 90%;
  }

  .chat-input-area {
    padding: 12px;
  }
}
</style>
