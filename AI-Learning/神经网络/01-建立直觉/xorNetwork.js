
/**
 * 第 3 课：激活函数
 */

// 1. ReLU 激活函数
function relu(x) {
  return Math.max(0, x);
}

// 2. Sigmoid 激活函数
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

console.log("ReLU(-3):", relu(-3)); // 0
console.log("ReLU(3):", relu(3));   // 3
console.log("Sigmoid(0):", sigmoid(0)); // 0.5


// 3. 创建一个能够解决 XOR 的小网络
function xorNetwork(a, b) {
  // 第一层：两个隐藏神经元
  const h1 = relu(a + b);
  const h2 = relu(a + b - 1);

  // 第二层：计算输出
  const output = h1 - 2 * h2;

  return output;
}

// 测试全部四种情况
console.log(xorNetwork(0, 0)); // 0
console.log(xorNetwork(0, 1)); // 1
console.log(xorNetwork(1, 0)); // 1
console.log(xorNetwork(1, 1)); // 0
