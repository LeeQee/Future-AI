/**
 * 读取 fetch 返回的 SSE 流
 * @param {Response} response
 * @param {(event: string, data: any) => void} onEvent
 */
export async function readSSE(response, onEvent) {
  if (!response.body) {
    throw new Error("浏览器无法读取响应流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  function processBuffer() {
    // 兼容 Windows 风格的换行
    buffer = buffer.replace(/\r\n/g, "\n");

    let end;

    // 一条完整 SSE 消息以两个换行符结束
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);

      let event = "message";
      const dataLines = [];

      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        }

        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) {
        continue;
      }

      const raw = dataLines.join("\n");
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        data = { text: raw };
      }

      onEvent(event, data);
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }

    buffer += decoder.decode();
    processBuffer();
  } finally {
    reader.releaseLock();
  }
}