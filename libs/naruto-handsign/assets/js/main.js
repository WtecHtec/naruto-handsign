import HandsRecognitionSDK from './hands-recognition-sdk.js';

// --- 配置常量 ---
const DICTIONARY = {
    "Ne": { cn: "子", en: "Rat" }, "Ushi": { cn: "丑", en: "Ox" }, "Tora": { cn: "寅", en: "Tiger" },
    "U": { cn: "卯", en: "Hare" }, "Tatsu": { cn: "辰", en: "Dragon" }, "Mi": { cn: "巳", en: "Snake" },
    "Uma": { cn: "午", en: "Horse" }, "Saru": { cn: "申", en: "Monkey" }, "Tori": { cn: "酉", en: "Bird" },
    "Inu": { cn: "戌", en: "Dog" }, "I": { cn: "亥", en: "Boar" }, "Release": { cn: "---", en: " " }
};

const state = {
    mode: 'learn',
    userRank: 0,
    learn: { target: null, isMatched: false },
    practice: { active: false, jutsu: null, stepIndex: 0, startTime: 0, timerId: null },
    exam: {
        active: false, currentRankTarget: 0, currentJutsuIndex: 0, stepIndex: 0,
        levels: [
            { id: 1, name: "下忍", key: "genin", title: "下忍·基础试炼" },
            { id: 2, name: "中忍", key: "chunin", title: "中忍·进阶试炼" },
            { id: 3, name: "上忍", key: "jonin", title: "上忍·高阶试炼" },
            { id: 4, name: "影", key: "kage", title: "影级·最终试炼" }
        ],
        levelJutsus: []
    }
};

let loadedJutsus = [];
const sdk = new HandsRecognitionSDK({
    cameraWidth: 640, cameraHeight: 480, mountContainer: '#webcam-container',
    teachableMachineModelPath: "https://teachablemachine.withgoogle.com/models/YOUR_MODEL_ID/", 
    jutsusPath: './assets/data/jutsus.json', threshold: 0.90
});

// --- Modal Helper ---
const modal = {
    el: document.getElementById('game-modal'),
    title: document.getElementById('modal-title'),
    content: document.getElementById('modal-content'),
    btnOk: document.getElementById('modal-btn-ok'),
    btnCancel: document.getElementById('modal-btn-cancel'),
    
    show(title, msg, type = 'info', onOk = null) {
        this.title.innerText = title;
        this.content.innerHTML = msg;
        this.el.classList.remove('hidden');
        this.el.firstElementChild.classList.add('modal-enter-active');
        // 解绑旧事件，防止多次触发
        this.btnOk.onclick = null; 
        this.btnOk.onclick = () => { this.hide(); if(onOk) onOk(); };
        if (type === 'confirm') {
            this.btnCancel.classList.remove('hidden');
            this.btnCancel.onclick = () => this.hide();
        } else {
            this.btnCancel.classList.add('hidden');
        }
    },
    hide() { this.el.classList.add('hidden'); }
};

// --- Init ---
async function init() {
    try {
        await sdk.init();
        const res = await fetch('./assets/data/jutsus.json');
        loadedJutsus = await res.json();
        loadProgress();
        initUI(); // 只运行一次
        setupSDKCallbacks();
        await sdk.start();
    } catch (e) {
        console.error(e);
        modal.show("系统错误", "无法加载模型或摄像头", "error");
    }
}

function loadProgress() {
    const saved = localStorage.getItem('naruto_rank');
    if (saved) state.userRank = parseInt(saved, 10);
    updateRankBadge();
}

function updateRankBadge() {
    const badges = ["见习", "下忍", "中忍", "上忍", "影"];
    const el = document.getElementById('current-rank-badge');
    el.innerText = `当前等级: ${badges[state.userRank] || '见习'}`;
    el.className = `text-xs font-bold px-2 py-0.5 rounded ${state.userRank === 4 ? 'bg-red-600 text-white' : 'bg-yellow-600 text-black'}`;
}

// --- UI Logic ---
function initUI() {
    // 绑定导航
    document.querySelectorAll('.nav-btn').forEach(btn => 
        btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

    // 1. 学习模式 UI 初始化
    const grid = document.getElementById('learn-grid');
    grid.innerHTML = ''; // 【关键修复】清空容器，防止重复添加
    Object.keys(DICTIONARY).forEach(key => {
        if (key === "Release") return;
        const btn = document.createElement('button');
        btn.className = "bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded p-2 text-sm font-bold transition learn-sign-btn";
        btn.innerText = DICTIONARY[key].cn;
        btn.onclick = () => selectLearnSign(key);
        grid.appendChild(btn);
    });

    // 2. 练习模式 UI 初始化
    const select = document.getElementById('practice-select');
    select.innerHTML = '<option value="">-- 选择忍术 --</option>';
    loadedJutsus.forEach(j => {
        select.innerHTML += `<option value="${j.id}">[${j.level.toUpperCase()}] ${j.name}</option>`;
    });
    select.addEventListener('change', (e) => setupPractice(e.target.value));
    document.getElementById('btn-reset-practice').onclick = () => setupPractice(select.value);
    
    document.getElementById('btn-clear-history').onclick = () => {
        if(confirm("确定清空所有练习记录吗？")) {
            localStorage.removeItem('naruto_practice_history');
            loadPracticeHistory(select.value);
        }
    };

    // 3. 考试模式 UI 初始化
    renderExamNodes(); // 抽取出来的渲染逻辑
    document.getElementById('btn-start-exam').onclick = startExamProcess;
    document.getElementById('btn-download-cert').onclick = () => generateAndDownloadCert(state.userRank);

    // 默认进入学习模式
    switchMode('learn');
}

// 单独抽离：渲染考试进度节点
function renderExamNodes() {
    const ranksContainer = document.getElementById('exam-ranks-container');
    ranksContainer.innerHTML = ''; // 清空旧节点
    state.exam.levels.forEach((lvl, idx) => {
        const node = document.createElement('div');
        const isPassed = state.userRank > idx;
        let colorClass = isPassed ? "bg-green-600 text-white border-green-400" : (state.userRank === idx ? "bg-yellow-500 text-black border-white animate-pulse" : "bg-gray-700 text-gray-500 border-gray-600");
        node.className = `w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition z-10 ${colorClass}`;
        node.innerText = lvl.name[0];
        ranksContainer.appendChild(node);
    });
}

function switchMode(mode) {
    if (state.practice.timerId) {
        cancelAnimationFrame(state.practice.timerId);
        state.practice.timerId = null;
    }
    state.practice.active = false;
    state.exam.active = false;
    
    state.mode = mode;
    document.querySelectorAll('.mode-panel').forEach(el => el.classList.add('hidden'));
    document.getElementById(`panel-${mode}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('bg-red-800', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('text-gray-400', !isActive);
    });

    if (mode === 'exam') updateExamUI();
}

function setupSDKCallbacks() {
    sdk.onResult((result) => {
        updateHUD(result.currentPrediction, result.progress);
        if (state.mode === 'learn') handleLearn(result.currentPrediction, result.progress);
        if (state.mode === 'practice') handlePractice(result.currentPrediction, result.progress);
        if (state.mode === 'exam') handleExam(result.currentPrediction, result.progress);
    });
}

function updateHUD(sign, conf) {
    document.getElementById('hud-current-sign').innerText = DICTIONARY[sign]?.cn || sign;
    const pct = Math.floor(conf * 100);
    const bar = document.getElementById('hud-confidence');
    bar.style.width = `${pct}%`;
    bar.className = `h-full transition-all ${pct > 85 ? 'bg-green-500' : 'bg-yellow-500'}`;
}

// --- Learn Logic ---
function selectLearnSign(key) {
    state.learn.target = key;
    state.learn.isMatched = false;
    document.getElementById('learn-placeholder').classList.add('hidden');
    document.getElementById('learn-content').classList.remove('hidden');
    document.getElementById('learn-name-cn').innerText = DICTIONARY[key].cn;
    
    const imgEl = document.getElementById('learn-image');
    imgEl.src = `./assets/img/hands/${key}.jpg`;
    imgEl.onerror = () => { imgEl.src = "https://placehold.co/400x300?text=No+Image"; };

    document.getElementById('learn-status').className = "mt-2 px-3 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-400";
    document.getElementById('learn-status').innerText = "等待输入...";
}

function handleLearn(sign, conf) {
    if (state.learn.target && sign === state.learn.target && conf > 0.85 && !state.learn.isMatched) {
        state.learn.isMatched = true;
        const status = document.getElementById('learn-status');
        status.className = "mt-2 px-3 py-1 rounded-full text-xs font-bold bg-green-500 text-white animate-bounce";
        status.innerText = "完美匹配！";
    }
}

// --- Practice Logic (含历史记录) ---
function setupPractice(id) {
    if (state.practice.timerId) {
        cancelAnimationFrame(state.practice.timerId);
        state.practice.timerId = null;
    }

    const jutsu = loadedJutsus.find(j => j.id === id);
    if (!jutsu) { 
        document.getElementById('practice-area').classList.add('hidden'); 
        document.getElementById('practice-history-container').classList.add('hidden');
        return; 
    }
    
    state.practice = { active: true, jutsu, stepIndex: 0, startTime: Date.now(), timerId: null };
    document.getElementById('practice-area').classList.remove('hidden');
    
    document.getElementById('practice-steps').innerHTML = jutsu.sequence.map((s, i) => 
        `<div id="p-step-${i}" class="px-2 py-1 border rounded text-sm ${i===0?'border-yellow-500 text-yellow-500':'border-gray-600 text-gray-600'}">${DICTIONARY[s].cn}</div>`
    ).join('');
    
    loadPracticeHistory(id);
    updateTimer();
}

function updateTimer() {
    if(!state.practice.active) return;
    document.getElementById('practice-timer').innerText = ((Date.now() - state.practice.startTime)/1000).toFixed(2)+'s';
    state.practice.timerId = requestAnimationFrame(updateTimer);
}

function handlePractice(sign, conf) {
    if (!state.practice.active) return;
    const { jutsu, stepIndex } = state.practice;
    if (sign === jutsu.sequence[stepIndex] && conf > 0.88) {
        document.getElementById(`p-step-${stepIndex}`).className = "px-2 py-1 border rounded text-sm bg-green-600 text-white border-green-600";
        state.practice.stepIndex++;
        
        if (state.practice.stepIndex >= jutsu.sequence.length) {
            state.practice.active = false;
            cancelAnimationFrame(state.practice.timerId);
            const time = ((Date.now() - state.practice.startTime)/1000).toFixed(2);
            savePracticeRecord(jutsu.id, time);
            modal.show("练习完成", `<b>${jutsu.name}</b> 释放成功！<br>本次耗时: <span class="text-green-400 text-xl font-mono">${time}s</span>`, "info");
        } else {
             document.getElementById(`p-step-${state.practice.stepIndex}`).className = "px-2 py-1 border rounded text-sm border-yellow-500 text-yellow-500 scale-110";
        }
    }
}

function savePracticeRecord(jutsuId, timeStr) {
    const key = 'naruto_practice_history';
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    history.push({ id: jutsuId, time: parseFloat(timeStr), date: new Date().toLocaleDateString() });
    history.sort((a,b) => a.time - b.time);
    if(history.length > 100) history = history.slice(0, 100);
    localStorage.setItem(key, JSON.stringify(history));
    loadPracticeHistory(jutsuId);
}

function loadPracticeHistory(jutsuId) {
    const container = document.getElementById('practice-history-container');
    const list = document.getElementById('practice-history-list');
    let history = JSON.parse(localStorage.getItem('naruto_practice_history') || '[]');
    const records = history.filter(r => r.id === jutsuId).slice(0, 5);
    
    if (records.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    list.innerHTML = records.map((r, i) => {
        let color = i === 0 ? "text-yellow-400 font-bold" : (i === 1 ? "text-gray-200" : "text-gray-300");
        return `<li class="flex justify-between border-b border-gray-600/50 pb-1 ${color}"><span>#${i+1} ${r.time}s</span><span class="text-xs text-gray-500 pt-1">${r.date}</span></li>`;
    }).join('');
}

// --- Exam Logic ---
function updateExamUI() {
    let targetRankIdx = state.userRank;
    if (targetRankIdx >= 4) targetRankIdx = 3;
    const level = state.exam.levels[targetRankIdx];
    const examJutsus = loadedJutsus.filter(j => j.level === level.key);
    state.exam.levelJutsus = examJutsus;
    state.exam.currentRankTarget = targetRankIdx + 1;
    document.getElementById('exam-title').innerText = level.title;
    
    document.getElementById('exam-task-list').innerHTML = examJutsus.map(j => 
        `<div class="flex items-center gap-2 text-sm border-b border-gray-700 pb-1">
            <span class="w-4 h-4 rounded-full border border-gray-500 flex items-center justify-center text-[10px] text-transparent check-icon">✓</span>
            <span class="text-gray-300">${j.name}</span>
         </div>`
    ).join('');

    const btnStart = document.getElementById('btn-start-exam');
    const btnDownload = document.getElementById('btn-download-cert');
    const runningUI = document.getElementById('exam-running-ui');
    runningUI.classList.add('hidden');

    if (state.userRank >= 4) {
        btnStart.classList.add('hidden');
        btnDownload.classList.remove('hidden');
        document.getElementById('exam-title').innerText = "你已登峰造极";
        document.getElementById('exam-desc').innerText = "作为影级忍者，你已无须证明自己。";
    } else {
        btnStart.classList.remove('hidden');
        if (state.userRank > 0) btnDownload.classList.remove('hidden'); 
        else btnDownload.classList.add('hidden');
    }
}

function startExamProcess() {
    if(state.userRank >= 4) return;
    state.exam.active = true;
    state.exam.currentJutsuIndex = 0;
    state.exam.stepIndex = 0;
    document.getElementById('btn-start-exam').classList.add('hidden');
    document.getElementById('btn-download-cert').classList.add('hidden');
    document.getElementById('exam-running-ui').classList.remove('hidden');
    updateExamProgressText();
}

function updateExamProgressText() {
    const currentJutsu = state.exam.levelJutsus[state.exam.currentJutsuIndex];
    const seqHtml = currentJutsu.sequence.map((s, i) => {
        const cn = DICTIONARY[s].cn;
        if (i < state.exam.stepIndex) return `<span class="text-green-500">${cn}</span>`;
        if (i === state.exam.stepIndex) return `<span class="text-yellow-400 font-bold border-b-2 border-yellow-400">${cn}</span>`;
        return `<span class="text-gray-500">${cn}</span>`;
    }).join(' → ');
    document.getElementById('exam-current-sequence-display').innerHTML = 
        `<div class="text-white font-bold mb-1">当前忍术: ${currentJutsu.name}</div><div>${seqHtml}</div>`;
}

function handleExam(sign, conf) {
    if (!state.exam.active) return;
    const currentJutsu = state.exam.levelJutsus[state.exam.currentJutsuIndex];
    const targetSign = currentJutsu.sequence[state.exam.stepIndex];
    if (sign === targetSign && conf > 0.92) {
        state.exam.stepIndex++;
        updateExamProgressText();
        if (state.exam.stepIndex >= currentJutsu.sequence.length) {
            const checkIcons = document.querySelectorAll('.check-icon');
            if(checkIcons[state.exam.currentJutsuIndex]) {
                checkIcons[state.exam.currentJutsuIndex].classList.replace('text-transparent', 'text-green-500');
                checkIcons[state.exam.currentJutsuIndex].parentElement.classList.add('bg-green-900/30');
            }
            state.exam.currentJutsuIndex++;
            state.exam.stepIndex = 0;
            if (state.exam.currentJutsuIndex >= state.exam.levelJutsus.length) {
                passExamLevel();
            } else {
                setTimeout(updateExamProgressText, 500);
            }
        }
    }
}

function passExamLevel() {
    state.exam.active = false;
    const newRank = state.exam.currentRankTarget;
    state.userRank = newRank;
    localStorage.setItem('naruto_rank', state.userRank);
    updateRankBadge();
    
    // 【关键修复】这里不再调用 initUI()，只更新相关的 UI 部分
    modal.show("考试通过！", `恭喜你晋升为 <b>${state.exam.levels[newRank-1].name}</b>!<br>新的证书已生成。`, "success", () => {
        updateExamUI();     // 更新考试面板（任务清单等）
        renderExamNodes();  // 更新顶部的圆圈进度
        generateAndDownloadCert(newRank); // 下载证书
    });
}

function generateAndDownloadCert(rankLevel) {
    if (rankLevel <= 0) return;
    const rankName = ["", "下忍", "中忍", "上忍", "影"][rankLevel];
    const canvas = document.getElementById('cert-canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "#FFFBEB"; ctx.fillRect(0,0,800,600);
    ctx.lineWidth = 20; ctx.strokeStyle = rankLevel === 4 ? "#991B1B" : "#D97706"; ctx.strokeRect(20,20,760,560);
    ctx.fillStyle = "black"; ctx.textAlign = "center"; ctx.font = "bold 50px serif"; ctx.fillText("忍者资格认定书", 400, 120);
    ctx.font = "30px serif"; ctx.fillStyle = "#333"; ctx.fillText("兹证明学员已通过严格考核，具备", 400, 220);
    ctx.font = "bold 100px serif"; ctx.fillStyle = rankLevel === 4 ? "#DC2626" : "#000"; ctx.fillText(rankName, 400, 350);
    ctx.font = "20px sans-serif"; ctx.fillStyle = "#666"; ctx.fillText("颁发日期: " + new Date().toLocaleDateString(), 600, 500);
    ctx.beginPath(); ctx.arc(150, 480, 60, 0, Math.PI*2); ctx.strokeStyle = "red"; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = "24px serif"; ctx.fillStyle = "red"; ctx.fillText("火影", 150, 490);
    const link = document.createElement('a'); link.download = `Naruto_Cert_${rankName}.png`; link.href = canvas.toDataURL(); link.click();
}

// Start
init();