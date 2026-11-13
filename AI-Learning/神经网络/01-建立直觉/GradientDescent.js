/**
 * 权重和偏置：神经元可以通过学习权重和偏置来拟合数据。
 * 损失函数：衡量错误有多大
 * 梯度下降：找到让损失减小的调整方向
 * 学习率：每次调整参数的步长
 * **/ 
const data = [
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 5 }
];

// 神经元一开始还没有学会规律
let w = 0;
let b = 0;

// 学习率
const learningRate = 0.4;

// 重复训练 100 次
for (let epoch = 0; epoch < 1000; epoch++) {
  let dw = 0;
  let db = 0;

  // 查看每条训练样本
  for (const { x, y } of data) {
    // 1. 预测
    const prediction = w * x + b;

    // 2. 计算误差
    const error = prediction - y;

    // 3. 累积梯度
    dw += error * x;
    db += error;
  }

  // 4. 利用平均梯度修改参数
  w -= learningRate * dw / data.length;
  b -= learningRate * db / data.length;
}

console.log("学到的权重:", w);
console.log("学到的偏置:", b);

console.log("运行3小时预测用电量:", w * 3 + b);
