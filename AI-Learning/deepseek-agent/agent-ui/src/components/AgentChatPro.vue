<template>
  <div class="agent-layout">
    <!-- 左侧会话列表 -->
    <aside class="sidebar">
      <h3>能源 Agent</h3>

      <button
        class="new-chat"
        :disabled="loading"
        @click="createSession"
      >
        + 新建会话
      </button>

      <button
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === activeId }"
        :disabled="loading"
        @click="switchSession(session.id)"
      >
        {{ session.title }}
      </button>
    </aside>

    <!-- 右侧聊天区域 -->
    <main class="chat-panel">
      <header class="chat-header">
        <strong>地铁能源管理 AI Agent</strong>
        <span>{{ loading ? "执行中..." : "就绪" }}</span>
      </header>

      <section class="message-list">
        <article
          v-for="message in activeSession?.messages || []"
          :key="message.id"
          class="message"
          :class="message.role"
        >
          <div class="role-label">
            {{ message.role === "user" ? "你" : "AI Agent" }}
          </div>

          <div class="bubble">
            {{ message.content || (
              message.state === "streaming"
                ? "正在处理..."
                : ""
            ) }}
          </div>

          <!-- Agent 工具执行轨迹 -->
          <details
            v-if="message.role === 'assistant' &&
                  message.steps?.length"
            class="trace-panel"
          >
            <summary>
              执行轨迹（{{ message.steps.length }} 步）
            </summary>

            <div
              v-for="step in message.steps"
              :key="step.id"
              class="trace-step"
            >
              <strong>
                {{ step.text || step.type }}
              </strong>

              <div v-if="step.tool" class="tool-name">
                {{ step.tool }}
              </div>

              <pre v-if="step.args !== undefined">{{
                JSON.stringify(step.args, null, 2)
              }}</pre>

              <pre v-if="step.result !== undefined">{{
                JSON.stringify(step.result, null, 2)
              }}</pre>
            </div>
          </details>

          <div
            v-if="message.error"
            class="message-error"
          >
            {{ message.error }}
          </div>

          <button
            v-if="message.state === 'error'"
            class="retry-btn"
            @click="retryMessage(message)"
          >
            重新发送
          </button>
        </article>
      </section>

      <footer class="composer">
        <textarea
          v-model="input"
          placeholder="询问车站能耗、趋势或异常情况..."
          rows="3"
          @keydown.enter.exact.prevent="sendMessage"
        />

        <button
          v-if="loading"
          class="stop-btn"
          @click="stopGeneration"
        >
          停止
        </button>

        <button
          v-else
          class="send-btn"
          :disabled="!input.trim()"
          @click="sendMessage"
        >
          发送
        </button>
      </footer>
    </main>
  </div>
</template>
<script setup>
import { ref, computed, onUnmounted } from "vue";
import { readSSE } from "../utils/readSSE.js";

const API_URL = "http://127.0.0.1:3000/api/agent/chat-stream";

// 教学演示身份；生产项目要从登录系统获取
const userId = "leon";
const STORAGE_KEY = "energy-agent-chat-v1";

// 生成会话和消息ID
function newId() {
  return crypto.randomUUID();
}

function createEmptySession() {
  return {
    id: newId(),
    title: "新会话",
    messages: []
  };
}

// 读取浏览器保存的会话
function loadSavedData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

const saved = loadSavedData();

const sessions = ref(
  Array.isArray(saved.sessions) && saved.sessions.length
    ? saved.sessions
    : [createEmptySession()]
);

const activeId = ref(
  sessions.value.some(s => s.id === saved.activeId)
    ? saved.activeId
    : sessions.value[0].id
);

const activeSession = computed(() =>
  sessions.value.find(s => s.id === activeId.value)
);

const input = ref("");
const loading = ref(false);

let controller = null;

// 保存当前会话列表
function saveSessions() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeId: activeId.value,
      sessions: sessions.value
    })
  );
}

function createSession() {
  if (loading.value) return;

  const session = createEmptySession();
  sessions.value.unshift(session);
  activeId.value = session.id;

  saveSessions();
}

function switchSession(id) {
  if (loading.value) return;

  activeId.value = id;
  saveSessions();
}

function stopGeneration() {
  controller?.abort();
}

async function sendMessage() {
  const question = input.value.trim();

  if (!question || loading.value || !activeSession.value) {
    return;
  }

  const session = activeSession.value;

  if (session.messages.length === 0) {
    session.title = question.slice(0, 18);
  }

  session.messages.push({
    id: newId(),
    role: "user",
    content: question
  });

  const assistantMessage = {
    id: newId(),
    role: "assistant",
    content: "",
    steps: [],
    state: "streaming",
    question,
    error: ""
  };

  session.messages.push(assistantMessage);

  input.value = "";
  loading.value = true;

  saveSessions();

  controller = new AbortController();
  let completed = false;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        sessionId: session.id,
        message: question
      }),
      signal: controller.signal
    });

    if (!response.ok) {
        
      throw new Error(`HTTP ${response.status}`);
    }

    await readSSE(response, (event, data) => {
      // 1. 模型生成文字
      if (event === "delta") {
        const text =
          typeof data === "string"
            ? data
            : data.text ?? data.delta ?? data.content ?? "";

        assistantMessage.content += text;
      }

      // 2. Agent 执行轨迹
      if (event === "status") {
        assistantMessage.steps.push({
          id: newId(),
          ...data
        });
      }

      // 3. 执行完成
      if (event === "done") {
        completed = true;
        assistantMessage.state = "done";

        if (!assistantMessage.content && data?.answer) {
          assistantMessage.content = data.answer;
        }
      }

      // 4. 后端通知错误
      if (event === "error") {
        throw new Error(
          data?.error || data?.message || "Agent执行失败"
        );
      }
    });

    if (!completed) {
      throw new Error("流式连接结束，但没有收到done事件");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      assistantMessage.state = "stopped";
      assistantMessage.error = "已停止接收回答";
    } else {
      assistantMessage.state = "error";
      assistantMessage.error = error.message;
    }
  } finally {
    loading.value = false;
    controller = null;
    saveSessions();
  }
}

// 错误重试：将原问题重新发送
function retryMessage(message) {
  if (loading.value) return;

  input.value = message.question;
  sendMessage();
}

onUnmounted(() => {
  controller?.abort();
});
</script>
<style scoped>
.agent-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  background: #f5f7fb;
  color: #243044;
  font-family: Arial, "Microsoft YaHei", sans-serif;
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  padding: 20px;
  background: #17263d;
  color: white;
  overflow-y: auto;
}

.sidebar h3 {
  margin: 0 0 20px;
}

.sidebar button {
  width: 100%;
  padding: 12px;
  margin-bottom: 8px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.session-item {
  background: #293a54;
  color: white;
}

.session-item.active {
  background: #386bd9;
}

.chat-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  padding: 20px;
  background: white;
  border-bottom: 1px solid #e3e8f0;
}

.chat-header span {
  color: #63836c;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.message {
  max-width: 80%;
  margin-bottom: 20px;
}

.message.user {
  margin-left: auto;
}

.role-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: #728096;
}

.bubble {
  padding: 14px 18px;
  border-radius: 12px;
  background: white;
  white-space: pre-wrap;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.message.user .bubble {
  background: #dce9ff;
}

.trace-panel {
  margin-top: 10px;
  padding: 12px;
  background: #eef2f8;
  border-radius: 10px;
}

.trace-panel summary {
  cursor: pointer;
  font-weight: 600;
}

.trace-step {
  margin-top: 10px;
  padding: 10px;
  background: white;
  border-radius: 8px;
}

.tool-name {
  margin-top: 4px;
  color: #4969a3;
  font-size: 12px;
}

.trace-step pre {
  overflow-x: auto;
  padding: 10px;
  background: #f3f5f9;
  font-size: 12px;
}

.message-error {
  margin-top: 8px;
  color: #b3261e;
}

.retry-btn {
  margin-top: 8px;
}

.composer {
  display: flex;
  gap: 12px;
  padding: 20px;
  background: white;
}

.composer textarea {
  flex: 1;
  min-width: 0;
  padding: 12px;
  border: 1px solid #ccd5e2;
  border-radius: 8px;
  resize: vertical;
}

.composer button {
  min-width: 80px;
  border: 0;
  border-radius: 8px;
  color: white;
  cursor: pointer;
}

.send-btn {
  background: #386bd9;
}

.stop-btn {
  background: #d14a44;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 700px) {
  .sidebar {
    width: 120px;
    padding: 10px;
  }

  .message {
    max-width: 100%;
  }

  .message-list {
    padding: 12px;
  }
}
</style>