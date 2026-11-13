import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 知识库目录
const knowledgeDir = fileURLToPath(
  new URL("./knowledge/", import.meta.url)
);

// 将文本转换为简单的检索词
function tokenize(text) {
  const tokens = new Set();
    // 匹配中文字符或连续的英文单词
  const groups = text.match(/[\u4e00-\u9fff]+|[a-zA-Z]{2,}/g) || [];

  for (const group of groups) {
    // 英文词直接保留
    if (/^[a-zA-Z]+$/.test(group)) {
      tokens.add(group.toLowerCase());
      continue;
    }

    // 中文按连续两个字切分
    for (let i = 0; i < group.length - 1; i++) {
      tokens.add(group.slice(i, i + 2));
    }
  }

  return tokens;
}

// 根据问题检索知识片段
export function searchEnergyKnowledge(query, topK = 3) {
  if (typeof query !== "string" || !query.trim()) {
    return { query, hits: [] };
  }

  const queryTokens = tokenize(query);
  const results = [];

  // 读取知识库中的 Markdown 文件
  const files = readdirSync(knowledgeDir)
    .filter(file => file.endsWith(".md"));

  for (const file of files) {
    const content = readFileSync(
      join(knowledgeDir, file),
      "utf8"
    );

    // 第一版：按空行切分文档
    const chunks = content
      .split(/\r?\n\s*\r?\n/)
      .map(text => text.trim())
      .filter(Boolean);

    chunks.forEach((chunk, index) => {
      const chunkTokens = tokenize(chunk);

      // 计算问题和文档片段的匹配数量
      let score = 0;

      for (const token of queryTokens) {
        if (chunkTokens.has(token)) {
          score++;
        }
      }

      if (score > 0) {
        results.push({
          source: file,
          chunkId: index + 1,
          score,
          content: chunk
        });
      }
    });
  }

  // 按匹配分数排序，返回前 topK 条
  return {
    query,
    hits: results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  };
}