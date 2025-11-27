# Naruto Handsign Recognition SDK

一个基于 MediaPipe 和 Teachable Machine 的实时手势识别 SDK，灵感来源于火影忍者中的手印。

## 安装

```bash
npm install naruto-handsign-recognition-sdk
```

## 使用方法

### 基础用法

```javascript
import HandsRecognitionSDK from 'naruto-handsign-recognition-sdk';

// 创建 SDK 实例
const sdk = new HandsRecognitionSDK({
  cameraWidth: 400,
  cameraHeight: 400,
  threshold: 5,
  mountContainer: '#webcam-container', // 可选：自动挂载摄像头
  mediapipeModelPath: './node_modules/naruto-handsign-recognition-sdk/assets/models/mediapipe/hand_landmarker.task',
  teachableMachineModelPath: './node_modules/naruto-handsign-recognition-sdk/assets/models/teachable-machine/',
  jutsusPath: './node_modules/naruto-handsign-recognition-sdk/assets/jutsus.json'
});

// 设置回调
sdk.onResult((result) => {
  console.log('当前识别:', result.currentPrediction);
  console.log('所有预测:', result.allPredictions);
  console.log('进度:', result.progress);
});

sdk.onJutsuMatch((match) => {
  console.log('匹配到忍术:', match.jutsuName);
  console.log('预测序列:', match.predictions);
});

sdk.onNoHands(() => {
  console.log('未检测到手部');
});

// 初始化并启动
async function start() {
  const initResult = await sdk.init();
  if (initResult.success) {
    const startResult = await sdk.start();
    if (startResult.success) {
      console.log('SDK 启动成功');
    }
  }
}

start();
```

### 手动挂载摄像头

```javascript
const sdk = new HandsRecognitionSDK({
  cameraWidth: 400,
  cameraHeight: 400
});

await sdk.init();
await sdk.start();

// 手动挂载到指定 div
const container = document.getElementById('my-webcam-container');
sdk.mountWebcam(container);
```

## API

### 构造函数选项

- `cameraWidth` (number): 摄像头宽度，默认 400
- `cameraHeight` (number): 摄像头高度，默认 400
- `threshold` (number): 预测阈值，默认 5
- `mountContainer` (HTMLElement | string): 可选的挂载容器
- `mediapipeModelPath` (string): MediaPipe 模型路径
- `teachableMachineModelPath` (string): Teachable Machine 模型路径
- `jutsusPath` (string): 忍术配置 JSON 文件路径

### 方法

- `init()`: 初始化 SDK，加载所有模型
- `start()`: 启动摄像头和识别循环
- `stop()`: 停止摄像头和识别循环
- `mountWebcam(container)`: 将摄像头画面挂载到指定 DOM 元素
- `unmountWebcam()`: 从 DOM 中卸载摄像头画面
- `onResult(callback)`: 设置识别结果回调
- `onJutsuMatch(callback)`: 设置忍术匹配回调
- `onNoHands(callback)`: 设置无手部检测回调
- `setThreshold(value)`: 设置预测阈值
- `getPredictions()`: 获取当前预测列表
- `getWebcamCanvas()`: 获取摄像头 canvas
- `isWebcamMounted()`: 检查摄像头是否已挂载

## 依赖

- `@mediapipe/tasks-vision`: MediaPipe 手部检测
- `@teachablemachine/image`: Teachable Machine 模型
- `@tensorflow/tfjs`: TensorFlow.js（peer dependency）

```

  <!-- 依赖库 -->
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js"></script>


```