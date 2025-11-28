/**
 * YoloxSDK
 * 封装 YOLOX ONNX Runtime Web 推理逻辑
 */
class YoloxSDK {
    constructor(options = {}) {
        this.modelPath = options.modelPath || './yolox_nano.onnx';
        this.inputShape = options.inputShape || [416, 416];
        this.scoreTh = options.scoreTh || 0.45;
        this.nmsTh = options.nmsTh || 0.45;
        
        // 默認火影結印標籤
        this.labels = options.labels || [
            "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "祈", "謎", "壬"
        ];
        
        this.session = null;
    }

    /**
     * 初始化模型
     */
    async load() {
        if (!window.ort) {
            throw new Error("ONNX Runtime Web (ort) 未加载，请在 HTML 中引入。");
        }
        try {
            // 优先 WebGL，其次 WASM
            this.session = await ort.InferenceSession.create(this.modelPath, {
                executionProviders: ['webgl', 'wasm']
            });
            return true;
        } catch (e) {
            console.error("SDK Load Error:", e);
            throw e;
        }
    }

    /**
     * 執行檢測
     * @param {HTMLImageElement|HTMLVideoElement} imageSource 圖像源
     * @returns {Promise<Array>} 檢測結果對象數組 [{label, score, box:{x1,y1,x2,y2}, classId}]
     */
    async detect(imageSource) {
        if (!this.session) throw new Error("Model not loaded. Call load() first.");

        // 1. 預處理
        const { tensor, scale } = this._preprocess(imageSource);

        // 2. 推理
        const feeds = {};
        feeds[this.session.inputNames[0]] = tensor;
        const results = await this.session.run(feeds);

        // 3. 後處理
        const output = results[this.session.outputNames[0]];
        const predictions = this._postprocess(output, scale);

        return predictions;
    }

    // --- 內部私有方法 ---

    _preprocess(imageSource) {
        const [w, h] = this.inputShape;
        
        // 創建離屏 Canvas 進行縮放和像素提取
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // 背景填充
        ctx.fillStyle = 'rgb(114, 114, 114)';
        ctx.fillRect(0, 0, w, h);

        // 計算縮放
        const imgW = imageSource.videoWidth || imageSource.naturalWidth;
        const imgH = imageSource.videoHeight || imageSource.naturalHeight;
        const scale = Math.min(w / imgW, h / imgH);
        const newW = imgW * scale;
        const newH = imgH * scale;

        // 繪製
        ctx.drawImage(imageSource, 0, 0, newW, newH);

        // 轉 Tensor (HWC -> CHW, RGB -> BGR)
        const imageData = ctx.getImageData(0, 0, w, h).data;
        const float32Data = new Float32Array(3 * w * h);
        
        for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            // BGR 順序 (OpenCV 默認)
            float32Data[j] = b;             
            float32Data[j + w * h] = g;     
            float32Data[j + 2 * w * h] = r; 
        }

        const tensor = new ort.Tensor('float32', float32Data, [1, 3, h, w]);
        return { tensor, scale };
    }

    _postprocess(outputTensor, scale) {
        const outputData = outputTensor.data; 
        const numAnchors = outputTensor.dims[1];
        const numAttribs = outputTensor.dims[2]; 

        const { grids, expandedStrides } = this._generateGridsAndStrides(this.inputShape[0], this.inputShape[1]);

        let proposals = [];

        for (let i = 0; i < numAnchors; i++) {
            const offset = i * numAttribs;
            const objConf = outputData[offset + 4];
            if (objConf < this.scoreTh) continue;

            let maxClassConf = -Infinity;
            let classId = -1;
            
            // 遍歷類別 (index 5 開始)
            const numClasses = numAttribs - 5;
            for (let c = 0; c < numClasses; c++) {
                const conf = outputData[offset + 5 + c];
                if (conf > maxClassConf) {
                    maxClassConf = conf;
                    classId = c;
                }
            }
            
            const finalScore = objConf * maxClassConf;
            if (finalScore < this.scoreTh) continue;

            // 解碼
            const x_center = (outputData[offset] + grids[i][0]) * expandedStrides[i];
            const y_center = (outputData[offset + 1] + grids[i][1]) * expandedStrides[i];
            const width = Math.exp(outputData[offset + 2]) * expandedStrides[i];
            const height = Math.exp(outputData[offset + 3]) * expandedStrides[i];

            // 映射回原圖
            const x1 = (x_center - width / 2) / scale;
            const y1 = (y_center - height / 2) / scale;
            const x2 = (x_center + width / 2) / scale;
            const y2 = (y_center + height / 2) / scale;

            proposals.push({
                x1, y1, x2, y2,
                score: finalScore,
                classId: classId,
                label: this.labels[classId] || `ID:${classId}`
            });
        }

        // NMS
        proposals.sort((a, b) => b.score - a.score);
        const finalBoxes = [];
        
        while (proposals.length > 0) {
            const best = proposals.shift();
            finalBoxes.push(best);
            
            proposals = proposals.filter(b => {
                const iou = this._calculateIoU(best, b);
                return iou < this.nmsTh;
            });
        }

        return finalBoxes;
    }

    _generateGridsAndStrides(width, height, strides = [8, 16, 32]) {
        let grids = [];
        let expandedStrides = [];
        for (let stride of strides) {
            const hsize = Math.floor(height / stride);
            const wsize = Math.floor(width / stride);
            for (let y = 0; y < hsize; y++) {
                for (let x = 0; x < wsize; x++) {
                    grids.push([x, y]);
                    expandedStrides.push(stride);
                }
            }
        }
        return { grids, expandedStrides };
    }

    _calculateIoU(a, b) {
        const xx1 = Math.max(a.x1, b.x1);
        const yy1 = Math.max(a.y1, b.y1);
        const xx2 = Math.min(a.x2, b.x2);
        const yy2 = Math.min(a.y2, b.y2);
        const w = Math.max(0, xx2 - xx1);
        const h = Math.max(0, yy2 - yy1);
        const inter = w * h;
        const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        return inter / (areaA + areaB - inter);
    }
}