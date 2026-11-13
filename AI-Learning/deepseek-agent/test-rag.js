import { searchEnergyKnowledge } from "./rag-knowledge.js";

const result = searchEnergyKnowledge(
  "什么是牵引能耗？"
);

console.log(JSON.stringify(result, null, 2));