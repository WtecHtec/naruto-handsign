

# YOLOX Browser SDK (Pure JS)

这是一个基于 [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 封装的轻量级 JavaScript SDK，用于在浏览器端直接运行 YOLOX 目标检测模型。

它将复杂的图像预处理（Resize, Padding, HWC-\>CHW）、推理以及后处理（Grid生成, 解码, NMS）封装在内部，对外提供简单的 `init` 和 `detect` 接口。

## ✨ 特性

  * **纯前端运行**：无需 Python 后端，利用客户端算力（WebGL/WASM）。
  * **开箱即用**：封装了 YOLOX 特有的前后处理逻辑。
  * **高可配置**：支持自定义模型路径、阈值和类别标签。
  * **多输入支持**：支持 `<img />`, `<video />`, `<canvas />` 等多种图像源。

## 📦 依赖

本 SDK 依赖于微软的 `onnxruntime-web`。在使用前请确保在 HTML 中引入：

```html
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js"></script>
```

## 🚀 快速开始

### 1\. 引入 SDK

将 `yolox_sdk.js` 放入你的项目目录，并在 HTML 中引入：

```html
<script src="yolox_sdk.js"></script>
```

### 2\. 基本使用

```javascript
// 1. 实例化 SDK
const detector = new YoloxSDK({
    modelPath: './yolox_nano.onnx', // 模型文件路径
    scoreTh: 0.5,                   // 置信度阈值
});

// 2. 初始化模型 (异步)
detector.load().then(() => {
    console.log("模型加载完成");
    
    // 3. 执行检测
    const imgElement = document.getElementById('my-image');
    detector.detect(imgElement).then(results => {
        console.log("检测结果:", results);
    });
});
```

## ⚙️ 配置选项 (Configuration)

在实例化 `new YoloxSDK(options)` 时，可以传入以下配置对象：

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `modelPath` | String | `'./yolox_nano.onnx'` | `.onnx` 模型文件的相对或绝对路径 |
| `inputShape` | Array | `[416, 416]` | 模型输入的尺寸 `[width, height]` |
| `scoreTh` | Number | `0.45` | 置信度过滤阈值 (0\~1) |
| `nmsTh` | Number | `0.45` | 非极大值抑制 (NMS) 的 IoU 阈值 |
| `labels` | Array | (火影结印列表) | 类别名称数组。索引 `0` 对应模型输出的第一个类别 |

**自定义标签示例：**

```javascript
const sdk = new YoloxSDK({
    labels: ["person", "bicycle", "car", ...] // COCO 数据集标签
});
```

## 📚 API 参考

### `load()`

  * **描述**: 加载 ONNX 模型并初始化推理会话。优先尝试使用 WebGL 加速。
  * **返回**: `Promise<boolean>`

### `detect(imageSource)`

  * **描述**: 对输入图像进行推理。
  * **参数**:
      * `imageSource`: `HTMLImageElement` | `HTMLVideoElement` | `HTMLCanvasElement`
  * **返回**: `Promise<Array<Object>>`
      * 返回一个对象数组，每个对象代表一个检测到的目标。

#### 返回数据结构示例：

```json
[
  {
    "x1": 105.5,   // 边界框左上角 X
    "y1": 50.2,    // 边界框左上角 Y
    "x2": 320.0,   // 边界框右下角 X
    "y2": 400.8,   // 边界框右下角 Y
    "score": 0.92, // 置信度
    "classId": 0,  // 类别索引
    "label": "子"  // 类别名称
  },
  ...
]
```

## 🛠️ 开发与调试

由于浏览器安全策略（CORS），**不能直接双击打开 HTML 文件** 加载本地模型文件。

你必需启动一个本地 HTTP 服务器。

**使用 Python (推荐):**

```bash
# Python 3
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

**使用 Node.js:**

```bash
npx http-server
```

## ⚠️ 模型导出注意事项

本 SDK 专为 **YOLOX** 架构设计。如果您使用自己的模型，请确保导出 ONNX 时：

1.  没有包含复杂的 Grid/Decode 算子（即 Raw Output），或者确保输出结构与 SDK `_postprocess` 逻辑一致。
2.  输入节点通常接受 `1 x 3 x H x W` 的 Float32 Tensor。
3.  通常建议导出时固定尺寸（如 416x416）。

## License

MIT