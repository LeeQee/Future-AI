import { pipeline } from "@huggingface/transformers";

// 多语言文本向量模型
export const EMBEDDING_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// 缓存模型加载过程
let extractorPromise = null;

// 将文本转成向量
export async function embed(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("需要提供非空文本");
  }

  // 第一次调用时加载模型，以后复用
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      EMBEDDING_MODEL,
      { dtype: "q8" }
    );
  }

  const extractor = await extractorPromise;

  const output = await extractor(text, {
    pooling: "mean",
    normalize: true
  });

  return Array.from(output.data);
}

// 计算余弦相似度
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("向量维度不一致");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }

  const denominator = Math.sqrt(normA * normB);

  return denominator === 0 ? 0 : dot / denominator;
}