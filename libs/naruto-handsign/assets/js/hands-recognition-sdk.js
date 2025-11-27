// IMPORTS
// ----------------------------------------
import {
    createHandLandmarker,
    detectHandsForVideo,
    calculateHandBoundingBox,
    doRectanglesOverlap,
    renderMediapipeLandmarks,
  } from './mediapipe-hand-detection.js';
  
  import { loadTeachableMachineModel, predictTeachableMachineModel } from './teachable-machine.js';
  
  import { processCanvas } from './image-processing.js';


  
  // SDK 类
  // ----------------------------------------
  class HandsRecognitionSDK {
    constructor(config = {}) {
      // 配置参数
      this.cameraWidth = config.cameraWidth || 400;
      this.cameraHeight = config.cameraHeight || 400;
      this.threshold = config.threshold || 5;
      this.jutsusPath = config.jutsusPath || 'assets/jutsus.json';
      this.mountContainer = config.mountContainer || null; // 新增：挂载容器选择器
      this.mediapipeModelPath = config.mediapipeModelPath || './assets/models/mediapipe/hand_landmarker.task'; // 新增：MediaPipe 模型路径
      this.teachableMachineModelPath = config.teachableMachineModelPath || './assets/models/teachable-machine/'; // 新增：Teachable Machine 模型路径
      
      // 内部状态
      this.webcam = null;
      this.totalModelClasses = 0;
      this.jutsus = null;
      this.isRunning = false;
      this.animationFrameId = null;
      this.mountElement = null; // 新增：挂载元素引用
      
      // 预测相关状态
      this.predictions = [];
      this.predictionCounter = 0;
      this.previousPrediction = undefined;
      
      // 回调函数
      this.onResultCallback = null;
      this.onJutsuMatchCallback = null;
      this.onNoHandsCallback = null;
      
      // 内部 canvas（不渲染到页面）
      this.processedCanvas = document.createElement('canvas');
      this.processedCanvasCtx = this.processedCanvas.getContext('2d', { willReadFrequently: true });
    }
  
    /**
     * 初始化 SDK，加载所有模型
     */
    async init() {
      try {
        // 加载 MediaPipe 手部检测模型（传递模型路径）
        await createHandLandmarker(this.mediapipeModelPath);
  
        // 加载 Teachable Machine 模型（传递模型路径）
        this.totalModelClasses = await loadTeachableMachineModel(this.teachableMachineModelPath);
  
        // 加载忍术配置
        const response = await fetch(this.jutsusPath);
        if (!response.ok) {
          throw new Error(`无法加载忍术配置: ${response.status} ${response.statusText}`);
        }
        this.jutsus = await response.json();
  
        return { success: true };
      } catch (error) {
        console.error('SDK 初始化失败:', error);
        return { success: false, error: error.message || error };
      }
    }
  
    /**
     * 启动摄像头和识别循环
     */
    async start() {
      if (this.isRunning) {
        console.warn('SDK 已经在运行中');
        return { success: false, error: 'SDK 已经在运行中' };
      }
  
      try {
        await this.startWebcam();
        
        // 挂载摄像头到指定容器
        if (this.mountContainer) {
          this.mountWebcamToContainer();
        }
        
        this.isRunning = true;
        this.loop();
        return { success: true };
      } catch (error) {
        console.error('启动摄像头失败:', error);
        return { success: false, error: error.message || error };
      }
    }
  
    /**
     * 停止摄像头和识别循环
     */
    stop() {
      if (!this.isRunning) {
        return;
      }
  
      this.isRunning = false;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
  
      if (this.webcam) {
        this.webcam.stop();
        this.webcam = null;
      }
  
      // 清理挂载的 canvas
      if (this.mountElement && this.webcam && this.webcam.canvas) {
        const canvas = this.webcam.canvas;
        if (canvas.parentNode === this.mountElement) {
          this.mountElement.removeChild(canvas);
        }
      }
      this.mountElement = null;

      // 重置状态
      this.resetPredictions();
    }
  
    /**
     * 启动摄像头
     */
    async startWebcam() {
      const flip = true;
      this.webcam = new tmImage.Webcam(this.cameraWidth, this.cameraHeight, flip);
      await this.webcam.setup();
      await this.webcam.play();
    }
  
    /**
     * 将摄像头 canvas 挂载到指定容器
     */
    mountWebcamToContainer() {
      if (!this.webcam || !this.webcam.canvas) {
        console.warn('摄像头未初始化，无法挂载');
        return;
      }

      // 获取挂载元素
      if (typeof this.mountContainer === 'string') {
        this.mountElement = document.querySelector(this.mountContainer);
      } else if (this.mountContainer instanceof HTMLElement) {
        this.mountElement = this.mountContainer;
      } else {
        console.warn('无效的挂载容器:', this.mountContainer);
        return;
      }

      if (!this.mountElement) {
        console.warn('未找到挂载容器:', this.mountContainer);
        return;
      }

      // 清空容器并挂载 canvas
      this.mountElement.innerHTML = '';
      this.mountElement.appendChild(this.webcam.canvas);
      
      // 设置 canvas 样式
      this.webcam.canvas.style.display = 'block';
      this.webcam.canvas.style.width = '100%';
      this.webcam.canvas.style.height = 'auto';
    }
  
    /**
     * 主循环
     */
    loop = () => {
      if (!this.isRunning) {
        return;
      }
  
      this.webcam.update();
      this.predict();
      this.animationFrameId = window.requestAnimationFrame(this.loop);
    }
  
    /**
     * 预测函数
     */
    async predict() {
      if (!this.webcam || !this.webcam.canvas) {
        return;
      }
  
      // 检测手部
      const startTimeMs = performance.now();
      const results = detectHandsForVideo(this.webcam.canvas, startTimeMs);
  
      // 计算边界框
      const rectangles = results.landmarks.map((landmarks) => {
        const [minX, maxX, minY, maxY] = calculateHandBoundingBox(landmarks, results);
        return { minX, maxX, minY, maxY };
      });
  
      // 清空处理 canvas
      this.processedCanvasCtx.save();
      this.processedCanvasCtx.clearRect(0, 0, this.processedCanvas.width, this.processedCanvas.height);
  
  
   

      // 处理手部检测结果
      if (results.landmarks.length === 0) {
        this.handleNoHands();
      } else {
        
        
        const cameraCtx =   this.webcam.canvas.getContext('2d');
        cameraCtx.save();
        // 如果你想保留原视频，需要在清理前先把 tmImage.Webcam 的帧绘制到别的 canvas，再叠加关键点
        results.landmarks.forEach((landmarks) => {
          renderMediapipeLandmarks(cameraCtx, landmarks, {
            pointColor: '#ffcc00',
            lineColor: '#ff6b00',
            lineWidth: 3,
          });
        });
        cameraCtx.restore();

        let targetRectangle;
  
        if (results.landmarks.length === 1) {
          targetRectangle = rectangles[0];
        } else if (results.landmarks.length === 2 && doRectanglesOverlap(rectangles[0], rectangles[1])) {
          targetRectangle = {
            minX: Math.min(rectangles[0].minX, rectangles[1].minX),
            maxX: Math.max(rectangles[0].maxX, rectangles[1].maxX),
            minY: Math.min(rectangles[0].minY, rectangles[1].minY),
            maxY: Math.max(rectangles[0].maxY, rectangles[1].maxY),
          };
        }
  
        if (targetRectangle) {
          await this.handlePrediction(targetRectangle, results.landmarks);
        }
      }
    }
  
    /**
     * 处理预测结果
     */
    async handlePrediction(rectangle, landmarks) {
      // 处理 canvas（裁剪、灰度化、调整大小、绘制关键点）
      processCanvas(
        rectangle,
        this.cameraHeight,
        this.cameraWidth,
        this.processedCanvas,
        this.processedCanvasCtx,
        this.webcam,
        landmarks
      );
  
      // 获取预测结果
      const prediction = await predictTeachableMachineModel(this.processedCanvas);
  
      // 管理预测结果（去重、阈值检查）
      this.managePrediction(prediction);
    }
  
    /**
     * 管理预测结果
     */
    managePrediction(finalPrediction) {
      if (!finalPrediction) {
        return;
      }

      if (finalPrediction === this.previousPrediction) {
        this.predictionCounter++;
        if (this.predictionCounter >= this.threshold && 
            this.predictions[this.predictions.length - 1] !== finalPrediction) {
          this.predictions.push(finalPrediction);
          
          // 触发结果回调
          if (this.onResultCallback) {
            this.onResultCallback({
              currentPrediction: finalPrediction,
              allPredictions: [...this.predictions],
              progress: this.predictionCounter / this.threshold
            });
          }
  
          // 检查是否匹配忍术
          this.checkJutsuMatch();
        }
      } else {
        this.predictionCounter = 0;
        this.previousPrediction = finalPrediction;
      }
    }
  
    /**
     * 检查是否匹配忍术
     */
    checkJutsuMatch() {
      if (!this.jutsus) {
        return;
      }
  
      const jutsuKeys = Object.keys(this.jutsus);
  
      const matchedJutsu = jutsuKeys.find(jutsu => {
        if (this.predictions.length === this.jutsus[jutsu].length) {
          return this.jutsus[jutsu].every((value, index) => value === this.predictions[index]);
        }
        return false;
      });
  
      if (matchedJutsu && this.onJutsuMatchCallback) {
        this.onJutsuMatchCallback({
          jutsuName: matchedJutsu,
          predictions: [...this.predictions]
        });
      }
    }
  
    /**
     * 处理无手部检测的情况
     */
    handleNoHands() {
      this.resetPredictions();
      if (this.onNoHandsCallback) {
        this.onNoHandsCallback();
      }
    }
  
    /**
     * 重置预测状态
     */
    resetPredictions() {
      this.predictions = [];
      this.predictionCounter = 0;
      this.previousPrediction = undefined;
    }
  
    /**
     * 设置识别结果回调
     * @param {Function} callback - 回调函数，接收 { currentPrediction, allPredictions, progress }
     */
    onResult(callback) {
      this.onResultCallback = callback;
    }
  
    /**
     * 设置忍术匹配回调
     * @param {Function} callback - 回调函数，接收 { jutsuName, predictions }
     */
    onJutsuMatch(callback) {
      this.onJutsuMatchCallback = callback;
    }
  
    /**
     * 设置无手部检测回调
     * @param {Function} callback - 回调函数
     */
    onNoHands(callback) {
      this.onNoHandsCallback = callback;
    }
  
    /**
     * 设置预测阈值
     * @param {number} value - 阈值
     */
    setThreshold(value) {
      this.threshold = value;
    }
  
    /**
     * 获取当前预测列表
     */
    getPredictions() {
      return [...this.predictions];
    }
  
    /**
     * 获取摄像头 canvas（如果需要用于其他用途）
     */
    getWebcamCanvas() {
      return this.webcam ? this.webcam.canvas : null;
    }
  }
  
  // 导出 SDK
  export default HandsRecognitionSDK;