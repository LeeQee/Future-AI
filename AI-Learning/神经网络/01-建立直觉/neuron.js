// js实现神经元测算
function Neuron(rain,wind) {
    const weight1 = 0.5;
    const weight2 = 0.2;
    const bias = -2;
    const score = weight1 * rain + weight2 * wind + bias;
    return score>0;
}
const rain1 = Neuron(10, 5);
const rain2 = Neuron(1, 2);
console.log("雨量10mm，风速5m/s的评分为:", rain1);
console.log("雨量1mm，风速2m/s的评分为:", rain2);