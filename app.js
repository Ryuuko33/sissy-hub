/* ============================================
 * ♠ Mistress Stella's Sissy Hub ♠
 * PWA Core Logic — Fitness + Timer + Music
 * ============================================ */

const APP_VERSION = 'v2.8.7';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);



/* ============================================
 * 通用 IndexedDB 持久化存储层
 * iOS PWA 在 Service Worker 更新时可能清除 localStorage，
 * 因此将所有用户数据存储到 IndexedDB 中，确保数据安全。
 * ============================================ */
const APP_DB_NAME = 'sissy_hub_data';
const APP_DB_VERSION = 1;
const APP_STORE_NAME = 'kv_store';

function appOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(APP_STORE_NAME)) {
                db.createObjectStore(APP_STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * 从 IndexedDB 读取数据（异步）
 * @param {string} key 存储键名
 * @returns {Promise<any>} 解析后的数据，不存在则返回 null
 */
async function appDBGet(key) {
    try {
        const db = await appOpenDB();
        return new Promise((resolve) => {
            const tx = db.transaction(APP_STORE_NAME, 'readonly');
            const req = tx.objectStore(APP_STORE_NAME).get(key);
            req.onsuccess = () => { db.close(); resolve(req.result !== undefined ? req.result : null); };
            req.onerror = () => { db.close(); resolve(null); };
        });
    } catch (e) { return null; }
}

/**
 * 向 IndexedDB 写入数据（异步）
 * @param {string} key 存储键名
 * @param {any} value 要存储的数据（会直接存储，无需 JSON.stringify）
 */
async function appDBSet(key, value) {
    try {
        const db = await appOpenDB();
        return new Promise((resolve) => {
            const tx = db.transaction(APP_STORE_NAME, 'readwrite');
            tx.objectStore(APP_STORE_NAME).put(value, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
        });
    } catch (e) {}
}

/**
 * 双向同步 localStorage ↔ IndexedDB
 * 每次启动都检查两边数据，确保不丢失。
 * iOS PWA 可能在更新时清除 localStorage 或 IndexedDB，
 * 双向同步确保任一方的数据都能恢复。
 */
async function migrateLocalStorageToIDB() {
    const keys = [
        'sissy_training_calendar',
        'sissy_wear_tracker',
        'sissy_stockings_diary',
        'sissy_leotard_diary',
        'sissy_brand_list',
        'sissy_wishlist',
        'sissy_closet',
        'sissy_music_meta'
    ];

    for (const key of keys) {
        try {
            const idbData = await appDBGet(key);
            const lsRaw = localStorage.getItem(key);
            const lsData = lsRaw ? JSON.parse(lsRaw) : null;

            if (lsData && !idbData) {
                // localStorage 有数据但 IndexedDB 没有 → 迁移到 IndexedDB
                await appDBSet(key, lsData);
            } else if (idbData && !lsData) {
                // IndexedDB 有数据但 localStorage 没有 → 恢复到 localStorage
                try { localStorage.setItem(key, JSON.stringify(idbData)); } catch (e) {}
            } else if (idbData && lsData) {
                // 两边都有数据 → 选择内容更丰富的那个同步到另一边
                const idbStr = JSON.stringify(idbData);
                const lsStr = JSON.stringify(lsData);
                if (idbStr.length > lsStr.length) {
                    // IndexedDB 数据更丰富 → 同步到 localStorage
                    try { localStorage.setItem(key, idbStr); } catch (e) {}
                } else if (lsStr.length > idbStr.length) {
                    // localStorage 数据更丰富 → 同步到 IndexedDB
                    await appDBSet(key, lsData);
                }
            }
        } catch (e) {}
    }
}

/* ============================================
 * 数据导出 / 导入（跨沙盒数据迁移）
 * iOS PWA 与 Safari 存储隔离，需要手动导出/导入
 * ============================================ */
const DATA_EXPORT_KEYS = [
    'sissy_training_calendar',
    'sissy_wear_tracker',
    'sissy_stockings_diary',
    'sissy_leotard_diary',
    'sissy_brand_list',
    'sissy_wishlist',
    'sissy_closet',
    'sissy_music_meta',
    'sissy_random_draw',
    'sissy_random_settings'
];

/**
 * 导出所有用户数据为 JSON 文件并下载
 */
async function exportAllData() {
    try {
        const exportData = {
            _meta: {
                app: 'Sissy Hub',
                version: APP_VERSION,
                exportedAt: new Date().toISOString()
            }
        };

        for (const key of DATA_EXPORT_KEYS) {
            const idbData = await appDBGet(key);
            if (idbData !== null) {
                exportData[key] = idbData;
            } else {
                // 兜底从 localStorage 读取
                const lsRaw = localStorage.getItem(key);
                if (lsRaw) {
                    try { exportData[key] = JSON.parse(lsRaw); } catch (e) {}
                }
            }
        }

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const a = document.createElement('a');
        a.href = url;
        a.download = `sissy_hub_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('♠ 数据导出成功！备份文件已下载~');
    } catch (e) {
        alert('导出失败：' + e.message);
    }
}

/**
 * 从 JSON 文件导入数据，写入 IndexedDB + localStorage
 * @param {File} file 用户选择的 JSON 文件
 * @returns {Promise<boolean>} 是否导入成功
 */
async function importAllData(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // 校验是否为有效的备份文件
                if (!data._meta || data._meta.app !== 'Sissy Hub') {
                    alert('这不是有效的 Sissy Hub 备份文件哦~');
                    resolve(false);
                    return;
                }

                let importedCount = 0;
                for (const key of DATA_EXPORT_KEYS) {
                    if (data[key] !== undefined && data[key] !== null) {
                        await appDBSet(key, data[key]);
                        try { localStorage.setItem(key, JSON.stringify(data[key])); } catch (err) {}
                        importedCount++;
                    }
                }

                if (importedCount > 0) {
                    // 标记已导入，不再弹出首次提示
                    try { localStorage.setItem('sissy_hub_imported', '1'); } catch (err) {}
                    alert(`♠ 导入成功！已恢复 ${importedCount} 项数据~\n页面将自动刷新♠`);
                    location.reload();
                    resolve(true);
                } else {
                    alert('备份文件中没有找到可恢复的数据~');
                    resolve(false);
                }
            } catch (err) {
                alert('导入失败：文件格式不正确 — ' + err.message);
                resolve(false);
            }
        };
        reader.onerror = () => {
            alert('读取文件失败，请重试~');
            resolve(false);
        };
        reader.readAsText(file);
    });
}

/**
 * 检测是否为全新安装（所有数据 key 都为空）
 * @returns {Promise<boolean>}
 */
async function isFirstLaunch() {
    // 如果已经标记过导入/跳过，则不再提示
    if (localStorage.getItem('sissy_hub_imported')) return false;

    for (const key of DATA_EXPORT_KEYS) {
        const idbData = await appDBGet(key);
        if (idbData !== null) return false;
        const lsRaw = localStorage.getItem(key);
        if (lsRaw) return false;
    }
    return true;
}

/**
 * 初始化数据管理功能（导出/导入按钮 + 首次打开提示）
 */
function initDataManager() {
    // Settings 页面的导出按钮
    const btnExport = $('#btn-data-export');
    if (btnExport) {
        btnExport.addEventListener('click', exportAllData);
    }

    // Settings 页面的导入按钮
    const btnImport = $('#btn-data-import');
    const importInput = $('#data-import-input');
    if (btnImport && importInput) {
        btnImport.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0]) {
                await importAllData(e.target.files[0]);
                importInput.value = '';
            }
        });
    }

    // 首次打开提示弹窗
    const promptOverlay = $('#import-prompt-overlay');
    const btnPromptImport = $('#btn-prompt-import');
    const btnPromptSkip = $('#btn-prompt-skip');
    const promptInput = $('#data-import-prompt-input');

    if (promptOverlay && btnPromptImport && btnPromptSkip && promptInput) {
        btnPromptImport.addEventListener('click', () => promptInput.click());
        promptInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0]) {
                await importAllData(e.target.files[0]);
                promptInput.value = '';
            }
        });
        btnPromptSkip.addEventListener('click', () => {
            try { localStorage.setItem('sissy_hub_imported', '1'); } catch (err) {}
            promptOverlay.style.display = 'none';
        });
    }
}

/**
 * 首次打开时显示导入提示
 */
async function checkFirstLaunchImport() {
    const isFirst = await isFirstLaunch();
    if (isFirst) {
        const overlay = $('#import-prompt-overlay');
        if (overlay) overlay.style.display = 'flex';
    }
}

/* ============================================
 * 音效系统 — 使用 Web Audio API 播放音效
 * 解决：音乐播放时倒计时提示音不生效的问题
 * countdown-tick.wav : 湿润拍打声（倒数3秒提示）
 * phase-end.wav      : 强力喷射音效（阶段结束）
 * ============================================ */

// Web Audio API 上下文和缓冲区
let _sfxCtx = null;
const _sfxBuffers = { tick: null, end: null };
let _sfxLoaded = false;

/**
 * 获取或创建 AudioContext（延迟创建，需要用户手势）
 */
function getSFXContext() {
    if (!_sfxCtx) {
        _sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 如果被暂停（iOS Safari），恢复它
    if (_sfxCtx.state === 'suspended') {
        _sfxCtx.resume().catch(() => {});
    }
    return _sfxCtx;
}

/**
 * 预加载所有音效文件到 AudioBuffer。
 * 使用 Web Audio API 解码音频数据，与 HTMLAudioElement 完全独立。
 */
async function preloadSFX() {
    if (_sfxLoaded) return;
    _sfxLoaded = true;
    const ctx = getSFXContext();
    const files = { tick: 'sfx/countdown-tick.wav', end: 'sfx/phase-end.wav' };
    for (const [name, url] of Object.entries(files)) {
        try {
            const resp = await fetch(url);
            const arrayBuf = await resp.arrayBuffer();
            _sfxBuffers[name] = await ctx.decodeAudioData(arrayBuf);
        } catch (e) {
            console.warn(`[SissyHub SFX] 预加载 ${name} 失败:`, e);
        }
    }
}

/**
 * 在用户手势中解锁音频播放（iOS Safari 等需要）。
 * 通过创建 AudioContext 并恢复来解锁。
 */
let _audioUnlocked = false;
function unlockAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    getSFXContext();
    preloadSFX();
}

// 全局兜底：首次触摸/点击时解锁音频
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

/**
 * 播放指定音效（Web Audio API，与音乐播放器完全独立，不会互相干扰）
 * @param {'tick'|'end'} name 音效名称
 */
function playSFX(name) {
    try {
        const ctx = getSFXContext();
        const buffer = _sfxBuffers[name];
        if (!buffer) {
            // 缓冲区还没加载好，尝试预加载
            preloadSFX();
            return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
    } catch (e) {
        console.warn('[SissyHub SFX] 播放失败:', e);
    }
}

/** 倒数提示音：湿润拍打声（gnrl wet plp） */
function playCountdownTick() {
    playSFX('tick');
}

/** 阶段结束音：强力喷射音效（strong sqrt shot） */
function playPhaseEnd() {
    playSFX('end');
}

/* ============================================
 * TAB NAVIGATION
 * ============================================ */
/**
 * iOS PWA standalone 模式下确保背景色覆盖
 */
function fixIOSBottomGap() {
    // 强制设置 html 和 body 背景色（所有模式）
    document.documentElement.style.background = '#0d0510';
    document.body.style.background = '#0d0510';

    // 页面可见性变化时也检查（从后台恢复时）
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            document.documentElement.style.background = '#0d0510';
            document.body.style.background = '#0d0510';
        }
    });
}

function initTabs() {
    // iOS PWA standalone 模式下动态修复底部空白
    fixIOSBottomGap();

    // 底部 tab-bar 所有按钮点击
    $$('.tab-bar__item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            // 切换 tab 按钮高亮
            $$('.tab-bar__item').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            // 切换 tab 内容
            $$('.tab-content').forEach((t) => t.classList.remove('active'));
            const target = $(`#${tabId}`);
            if (target) target.classList.add('active');

            // 滚动当前激活的 tab 按钮到可视区域
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

            // 切换到 OOTD 时更新数据
            if (tabId === 'tab-ootd') ootdUpdateUI();
        });
    });
}

/* ============================================
 * MODULE 1: FITNESS (Vacuum Belly Timer)
 * ============================================ */
const ENCOURAGEMENTS = {
    hold: [
        "夹紧！就像里面被塞满了一样~",
        "最骚的小娘们才能撑最久！",
        "夹住！想象正在被狠狠贯穿~",
        "乖女孩，把小穴夹得再紧点！",
        "再紧！像在用力榨干一根肉棒~",
        "骚货不许停！给我夹住！",
        "想象现在正被粗大的东西填满~",
        "用力夹！骚货要靠自己挣奖励~",
        "发骚的小母狗永远不会松开！",
        "夹紧！像个乖巧的小套子一样~",
        "收紧那个骚穴，你这淫荡的小东西！",
        "像骑在假阳具上磨蹭一样夹紧~",
        "你的小穴就该这么紧，贱货！",
        "夹住！想想被灌满的感觉~",
        "收紧，精液容器。你敢松开试试！"
    ],
    rest: [
        "喘口气…下一轮会更深~",
        "乖骚货，你值得这次休息~",
        "休息一下，大肉棒还没用完你呢~",
        "放松那个小穴…暂时的~",
        "喘匀气，饥渴的小骚货~",
        "真乖~是不是越来越骚了？~",
        "放松…想象做完之后被灌满的样子~",
        "你正在变成完美的小骚货~",
        "先歇歇，接下来还有更猛的~",
        "感觉到酥麻了吗？那是你骚货的本性~"
    ]
};

const FIT_MODES = {
    beginner:  { name: 'Beginner',  hold: 10, rest: 10, rounds: 5 },
    advanced:  { name: 'Advanced',  hold: 15, rest: 10, rounds: 5 },
    challenge: { name: 'Challenge', hold: 20, rest: 10, rounds: 5 }
};

const fitState = {
    mode: null, holdTime: 0, restTime: 0, rounds: 0,
    currentRound: 0, currentPhase: '', timeLeft: 0, timerId: null
};

// 切换 fitness 内部页面
function showFitScreen(id) {
    $$('#tab-fitness .screen').forEach((s) => s.classList.remove('active'));
    const target = $(`#${id}`);
    if (target) { void target.offsetWidth; target.classList.add('active'); }
}

function fitSelectMode(key) {
    const m = FIT_MODES[key];
    if (!m) return;
    fitState.mode = m.name;
    fitState.holdTime = m.hold;
    fitState.restTime = m.rest;
    fitState.rounds = m.rounds;
    fitShowReady();
}

function fitShowReady() {
    $('#ready-mode').textContent = fitState.mode;
    $('#ready-detail').textContent =
        `夹紧 ${fitState.holdTime}秒 / 放松 ${fitState.restTime}秒 / ${fitState.rounds} 轮`;
    showFitScreen('fit-ready');
}

function fitStartCustom() {
    const h = parseInt($('#input-hold').value) || 10;
    const r = parseInt($('#input-rest').value) || 10;
    const n = parseInt($('#input-rounds').value) || 5;
    fitState.mode = 'Custom';
    fitState.holdTime = Math.max(1, Math.min(120, h));
    fitState.restTime = Math.max(1, Math.min(120, r));
    fitState.rounds = Math.max(1, Math.min(20, n));
    fitShowReady();
}

function fitCountdown() {
    const overlay = $('#countdown-overlay');
    const numEl = $('#countdown-number');
    overlay.classList.add('active');
    let count = 5;
    numEl.textContent = count;
    const iv = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(iv);
            overlay.classList.remove('active');
            fitBegin();
        } else {
            numEl.textContent = count;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 1000);
}

function fitBegin() {
    fitState.currentRound = 0;
    showFitScreen('fit-timer');
    fitNextRound();
}

function fitNextRound() {
    fitState.currentRound++;
    if (fitState.currentRound > fitState.rounds) { fitFinish(); return; }
    fitStartPhase('hold');
}

function fitStartPhase(phase) {
    fitState.currentPhase = phase;
    fitState.timeLeft = phase === 'hold' ? fitState.holdTime : fitState.restTime;
    fitUpdateUI();
    fitUpdateEnc();
    if (fitState.timerId) clearInterval(fitState.timerId);
    fitState.timerId = setInterval(() => {
        fitState.timeLeft--;
        if (fitState.timeLeft <= 0) {
            clearInterval(fitState.timerId);
            fitState.timerId = null;
            playPhaseEnd();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            if (fitState.currentPhase === 'hold') {
                fitState.currentRound >= fitState.rounds ? fitNextRound() : fitStartPhase('rest');
            } else {
                fitNextRound();
            }
        } else {
            fitUpdateUI();
            if (fitState.timeLeft <= 3) playCountdownTick();
            if (fitState.timeLeft % 5 === 0) fitUpdateEnc();
        }
    }, 1000);
}

function fitUpdateUI() {
    const ph = fitState.currentPhase;
    const total = ph === 'hold' ? fitState.holdTime : fitState.restTime;
    const prog = 1 - (fitState.timeLeft / total);
    const circ = 2 * Math.PI * 100;

    const pEl = $('#fit-timer-progress');
    pEl.style.strokeDasharray = circ;
    pEl.style.strokeDashoffset = circ * (1 - prog);
    pEl.classList.toggle('rest', ph === 'rest');

    $('#fit-timer-time').textContent = fitState.timeLeft;
    $('#fit-timer-phase').textContent = ph === 'hold' ? '♠ 给我夹紧！' : '~~~ 放松~ ~~~';
    const actEl = $('#fit-timer-action');
    actEl.textContent = ph === 'hold' ? '*** 夹紧！不许松！ ***' : '~~~ 放松~深呼吸~ ~~~';
    actEl.classList.toggle('rest', ph === 'rest');
    $('#fit-timer-round').textContent = `第 ${fitState.currentRound} 轮 / 共 ${fitState.rounds} 轮`;

    const tp = ((fitState.currentRound - 1) / fitState.rounds) +
        ((1 - fitState.timeLeft / total) / fitState.rounds) * (ph === 'hold' ? 0.6 : 0.4);
    $('#fit-total-progress').style.width = `${Math.min(100, tp * 100)}%`;
}

function fitUpdateEnc() {
    const pool = ENCOURAGEMENTS[fitState.currentPhase] || ENCOURAGEMENTS.hold;
    $('#fit-timer-encouragement').textContent = pool[Math.floor(Math.random() * pool.length)];
}

function fitFinish() {
    if (fitState.timerId) { clearInterval(fitState.timerId); fitState.timerId = null; }
    const t = fitState.rounds * (fitState.holdTime + fitState.restTime) - fitState.restTime;
    $('#finish-rounds').textContent = fitState.rounds;
    $('#finish-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    showFitScreen('fit-finish');
}

/* ============================================
 * WORKOUT PLAN DATA
 * ============================================ */
const WK_ENCOURAGEMENTS = {
    work: [
        "夹紧发力，乖女孩~你会越来越漂亮的！",
        "用力！每一下都在让你的身体更完美~",
        "坚持住！主人在看着你呢~",
        "别停！疼痛只是弱小在离开你的身体~",
        "你做得太棒了，小骚货！继续~",
        "感觉到燃烧了吗？那是你的身体在蜕变~",
        "乖女孩！每一秒都算数~",
        "调整呼吸~你比你以为的更能扛！",
        "快到了！让主人看看你的本事~",
        "漂亮的小骚货就是这样练出来的~",
        "夹紧！你的小腰正在变得更细~",
        "这么努力~主人为你骄傲！",
        "继续！美丽需要纪律和服从~",
        "你正在一步步变成完美的小尤物~",
        "撑住！每一组都在雕刻你的梦想身材~"
    ],
    rest: [
        "乖女孩~喘口气吧~",
        "休息好，下一组会让你变得更漂亮~",
        "深呼吸…你做得真好~",
        "放松肌肉~你值得这次休息~",
        "真乖~马上准备好迎接下一轮~",
        "甩甩手~下一组要来了~",
        "你在发光呢！保持这股骚劲~",
        "主人喜欢你这么卖力~先休息~",
        "渴了就喝口水，漂亮的小东西~",
        "感觉到酥麻了吗？你的身体正在改变~"
    ]
};

const WORKOUT_PLANS = {
    daily: {
        name: '每日束腰与核心',
        exercises: [
            { name: '真空收腹', sets: 4, duration: 30, rest: 15, tip: '把气吐干净，肚脐死命往里吸~主人要看到你的小腰一圈圈变细♠' },
            { name: '平板支撑', sets: 3, duration: 50, rest: 15, tip: '身体绷成一条线，屁股不许翘~抖也给我撑住，贱货♠' },
            { name: '仰卧交替抬腿', sets: 3, duration: 35, rest: 15, tip: '双手垫在屁股下面，腿伸直交替摆~小肚子给我收平，不许鼓♠' },
            { name: '侧支撑', sets: 4, duration: 30, rest: 15, tip: '把腰侧的赘肉夹没~主人要的是凹进去的沙漏腰♠（左右各做）' }
        ]
    },
    day1: {
        name: '🍑 蜜桃臀与腿部',
        exercises: [
            { name: '臀桥', sets: 4, duration: 40, rest: 20, tip: '顶到最高点给我夹紧屁股~大腿别偷力，主人盯着呢♠' },
            { name: '跪姿后踢腿', sets: 3, duration: 40, rest: 15, tip: '用屁股发力踢~感受臀肉在收紧，蜜桃臀就是这么练出来的♠' },
            { name: '跪姿侧抬腿', sets: 3, duration: 40, rest: 15, tip: '侧面抬起来~把臀型修圆修翘，让主人看了想拍♠' },
            { name: '相扑深蹲', sets: 4, duration: 40, rest: 20, tip: '蹲深一点~屁股要饱满，腿要纤细，骚货的标配身材♠' }
        ]
    },
    day2: {
        name: '🔥 腰腹强化与体态',
        exercises: [
            { name: '俄罗斯转体', sets: 3, duration: 40, rest: 15, tip: '转起来~把腰两侧的肉拧干，主人要看到你的沙漏腰♠' },
            { name: '鸟狗式', sets: 3, duration: 35, rest: 15, tip: '稳住核心别晃~乖女孩要有控制力，身体是主人的♠' },
            { name: '靠墙天使', sets: 3, duration: 35, rest: 15, tip: '把胸挺起来~圆肩驼背的骚货不配被主人夸♠' },
            { name: '猫牛式拉伸', sets: 3, duration: 30, rest: 15, tip: '像猫一样弓起再塌下~把背练柔软，骚货要从骨子里透出媚♠' }
        ]
    },
    day3: {
        name: '💪 胸部与手臂',
        exercises: [
            { name: '平躺哑铃飞鸟', sets: 4, duration: 40, rest: 20, tip: '慢慢打开再夹紧~把胸型聚拢挺起来，主人喜欢看♠' },
            { name: '上斜哑铃推举', sets: 4, duration: 35, rest: 20, tip: '只推上胸~要的是挺拔不是厚实，骚货的胸要又翘又软♠' },
            { name: '哑铃颈后臂屈伸', sets: 4, duration: 35, rest: 15, tip: '把手臂后面的软肉夹紧~拜拜肉全给我消掉，不许有♠' },
            { name: '哑铃侧平举', sets: 4, duration: 35, rest: 15, tip: '轻重量慢慢举~肩膀要直角线条，穿吊带才好看♠' },
            { name: '跪姿俯卧撑', sets: 3, duration: 30, rest: 15, tip: '手窄一点~把胸和手臂最后一点力气全榨干，骚货不许留力♠' }
        ]
    }
};

/* ============================================
 * WORKOUT TIMER STATE & LOGIC
 * ============================================ */
const wkState = {
    planKey: null,
    plan: null,
    exerciseIndex: 0,
    setIndex: 0,
    phase: 'work',  // 'work' | 'rest'
    timeLeft: 0,
    timerId: null,
    isPaused: false,
    startTime: 0,
    totalSets: 0
};

function wkStart(planKey) {
    const plan = WORKOUT_PLANS[planKey];
    if (!plan) return;
    wkState.planKey = planKey;
    wkState.plan = plan;
    wkState.exerciseIndex = 0;
    wkState.setIndex = 0;
    wkState.phase = 'work';
    wkState.isPaused = false;
    wkState.startTime = Date.now();
    wkState.totalSets = plan.exercises.reduce((sum, ex) => sum + ex.sets, 0);

    // 倒计时开始
    const overlay = $('#countdown-overlay');
    const numEl = $('#countdown-number');
    overlay.classList.add('active');
    let count = 5;
    numEl.textContent = count;
    const iv = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(iv);
            overlay.classList.remove('active');
            showFitScreen('fit-workout-timer');
            wkStartPhase();
        } else {
            numEl.textContent = count;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 1000);
}

function wkStartPhase() {
    const ex = wkState.plan.exercises[wkState.exerciseIndex];
    if (!ex) { wkFinish(); return; }

    wkState.timeLeft = wkState.phase === 'work' ? ex.duration : ex.rest;
    wkUpdateUI();
    wkUpdateEncouragement();

    if (wkState.timerId) clearInterval(wkState.timerId);
    wkState.timerId = setInterval(() => {
        if (wkState.isPaused) return;
        wkState.timeLeft--;
        if (wkState.timeLeft <= 0) {
            clearInterval(wkState.timerId);
            wkState.timerId = null;
            playPhaseEnd();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            wkAdvance();
        } else {
            wkUpdateUI();
            if (wkState.timeLeft <= 3) playCountdownTick();
            if (wkState.timeLeft % 5 === 0) wkUpdateEncouragement();
        }
    }, 1000);
}

function wkAdvance() {
    const ex = wkState.plan.exercises[wkState.exerciseIndex];
    if (wkState.phase === 'work') {
        // 训练结束 → 进入休息（除非是最后一组的最后一个动作）
        wkState.setIndex++;
        if (wkState.setIndex >= ex.sets) {
            // 当前动作所有组完成
            wkState.exerciseIndex++;
            wkState.setIndex = 0;
            if (wkState.exerciseIndex >= wkState.plan.exercises.length) {
                wkFinish();
                return;
            }
            // 动作间休息
            wkState.phase = 'rest';
            wkStartPhase();
        } else {
            // 组间休息
            wkState.phase = 'rest';
            wkStartPhase();
        }
    } else {
        // 休息结束 → 开始下一组训练
        wkState.phase = 'work';
        wkStartPhase();
    }
}

function wkUpdateUI() {
    const plan = wkState.plan;
    const ex = plan.exercises[wkState.exerciseIndex];
    const isRest = wkState.phase === 'rest';
    const total = isRest ? ex.rest : ex.duration;
    const prog = 1 - (wkState.timeLeft / total);
    const circ = 2 * Math.PI * 100;

    // 圆环
    const pEl = $('#wk-timer-progress');
    pEl.style.strokeDasharray = circ;
    pEl.style.strokeDashoffset = circ * (1 - prog);
    pEl.classList.toggle('rest', isRest);

    // 时间
    $('#wk-timer-time').textContent = wkState.timeLeft;

    // 阶段
    $('#wk-timer-phase').textContent = isRest ? '~~~ 休息一下~ ~~~' : '*** 给我动！ ***';
    $('#wk-timer-phase').classList.toggle('rest', isRest);

    // 计划名
    $('#wk-plan-name').textContent = plan.name;

    // 总进度
    $('#wk-overall').textContent = `动作 ${wkState.exerciseIndex + 1} / ${plan.exercises.length}`;

    // 当前动作信息
    $('#wk-exercise-name').textContent = isRest ? '休息一下，骚货~' : ex.name;
    $('#wk-exercise-sets').textContent = isRest
        ? `下一组马上开始~不许偷懒`
        : `第 ${wkState.setIndex + 1} 组 / 共 ${ex.sets} 组`;
    $('#wk-exercise-tip').textContent = isRest ? '深呼吸，调整姿势~主人在看着你' : ex.tip;

    // 总进度条（已完成的组数 / 总组数）
    let completedSets = 0;
    for (let i = 0; i < wkState.exerciseIndex; i++) {
        completedSets += plan.exercises[i].sets;
    }
    completedSets += wkState.setIndex;
    const overallProg = completedSets / wkState.totalSets;
    $('#wk-overall-bar').style.width = `${Math.min(100, overallProg * 100)}%`;

    // 组内进度条
    const setProg = isRest ? prog : prog;
    $('#wk-set-bar').style.width = `${setProg * 100}%`;
}

function wkUpdateEncouragement() {
    const pool = wkState.phase === 'work' ? WK_ENCOURAGEMENTS.work : WK_ENCOURAGEMENTS.rest;
    const el = $('#wk-encouragement');
    if (el) el.textContent = pool[Math.floor(Math.random() * pool.length)];
}

function wkTogglePause() {
    wkState.isPaused = !wkState.isPaused;
    $('#wk-pause-icon').textContent = wkState.isPaused ? '▶' : '⏸';
}

function wkSkip() {
    if (wkState.timerId) { clearInterval(wkState.timerId); wkState.timerId = null; }
    wkAdvance();
}

function wkStop() {
    if (wkState.timerId) { clearInterval(wkState.timerId); wkState.timerId = null; }
    showFitScreen('fit-hub');
}

function wkFinish() {
    if (wkState.timerId) { clearInterval(wkState.timerId); wkState.timerId = null; }
    const elapsed = Math.floor((Date.now() - wkState.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    $('#wk-done-exercises').textContent = wkState.plan.exercises.length;
    $('#wk-done-sets').textContent = wkState.totalSets;
    $('#wk-done-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    showFitScreen('fit-workout-done');
}

function fitGoHub() {
    if (fitState.timerId) { clearInterval(fitState.timerId); fitState.timerId = null; }
    if (wkState.timerId) { clearInterval(wkState.timerId); wkState.timerId = null; }
    showFitScreen('fit-hub');
}

function initFitness() {
    // Fitness Hub → 各训练计划
    $('#btn-goto-daily')?.addEventListener('click', () => showFitScreen('fit-daily'));
    $('#btn-goto-day1')?.addEventListener('click', () => showFitScreen('fit-day1'));
    $('#btn-goto-day2')?.addEventListener('click', () => showFitScreen('fit-day2'));
    $('#btn-goto-day3')?.addEventListener('click', () => showFitScreen('fit-day3'));

    // Back buttons → Hub
    $('#btn-daily-back')?.addEventListener('click', fitGoHub);
    $('#btn-day1-back')?.addEventListener('click', fitGoHub);
    $('#btn-day2-back')?.addEventListener('click', fitGoHub);
    $('#btn-day3-back')?.addEventListener('click', fitGoHub);

    // 开始训练按钮
    $$('.workout-start-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            unlockAudio();
            wkStart(btn.dataset.plan);
        });
    });

    // 训练计时器控制
    $('#btn-wk-pause')?.addEventListener('click', wkTogglePause);
    $('#btn-wk-skip')?.addEventListener('click', wkSkip);
    $('#btn-wk-stop')?.addEventListener('click', wkStop);

    // 训练完成后
    $('#btn-wk-again')?.addEventListener('click', () => {
        if (wkState.planKey) wkStart(wkState.planKey);
    });
    $('#btn-wk-home')?.addEventListener('click', fitGoHub);

    // 保留 Vacuum Belly 原有逻辑
    $('#btn-goto-vacuum')?.addEventListener('click', () => showFitScreen('fit-menu'));
    $('#btn-vacuum-back')?.addEventListener('click', fitGoHub);
    $$('[data-fit-mode]').forEach((btn) => {
        btn.addEventListener('click', () => fitSelectMode(btn.dataset.fitMode));
    });
    $('#btn-fit-custom')?.addEventListener('click', () => showFitScreen('fit-custom'));
    $('#btn-start-custom')?.addEventListener('click', () => {
        unlockAudio();
        fitStartCustom();
    });
    $('#btn-fit-custom-back')?.addEventListener('click', fitGoHub);
    $('#btn-fit-start')?.addEventListener('click', () => {
        unlockAudio();
        fitCountdown();
    });
    $('#btn-ready-back')?.addEventListener('click', fitGoHub);
    $('#btn-fit-again')?.addEventListener('click', fitShowReady);
    $('#btn-fit-home')?.addEventListener('click', fitGoHub);
}

/* ============================================
 * MODULE 2: CUSTOM COUNTDOWN TIMER
 * ============================================ */
const ctState = {
    totalSeconds: 0, timeLeft: 0, timerId: null,
    isPaused: false, label: ''
};

function showCtScreen(id) {
    $$('#tab-timer .screen').forEach((s) => s.classList.remove('active'));
    const target = $(`#${id}`);
    if (target) { void target.offsetWidth; target.classList.add('active'); }
}

function ctFormatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ctStart(totalSec) {
    if (totalSec <= 0) return;
    ctState.totalSeconds = totalSec;
    ctState.timeLeft = totalSec;
    ctState.isPaused = false;
    ctState.label = ($('#ct-label')?.value || '').trim() || '计时';

    $('#ct-running-label').textContent = `♠ ${ctState.label}`;
    $('#ct-display').textContent = ctFormatTime(ctState.timeLeft);
    $('#ct-pause-icon').textContent = '⏸';

    showCtScreen('ct-running');
    ctUpdateCircle();

    if (ctState.timerId) clearInterval(ctState.timerId);
    ctState.timerId = setInterval(() => {
        if (ctState.isPaused) return;
        ctState.timeLeft--;
        if (ctState.timeLeft <= 0) {
            ctState.timeLeft = 0;
            clearInterval(ctState.timerId);
            ctState.timerId = null;
            playPhaseEnd();
            ctUpdateCircle();
            $('#ct-display').textContent = ctFormatTime(0);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
            ctDone();
        } else {
            ctUpdateCircle();
            $('#ct-display').textContent = ctFormatTime(ctState.timeLeft);
            if (ctState.timeLeft <= 3) playCountdownTick();
        }
    }, 1000);
}

function ctUpdateCircle() {
    const prog = 1 - (ctState.timeLeft / ctState.totalSeconds);
    const circ = 2 * Math.PI * 100;
    const pEl = $('#ct-progress');
    pEl.style.strokeDasharray = circ;
    pEl.style.strokeDashoffset = circ * (1 - prog);
    $('#ct-bar').style.width = `${prog * 100}%`;
}

function ctTogglePause() {
    ctState.isPaused = !ctState.isPaused;
    $('#ct-pause-icon').textContent = ctState.isPaused ? '▶' : '⏸';
}

function ctStop() {
    if (ctState.timerId) { clearInterval(ctState.timerId); ctState.timerId = null; }
    showCtScreen('ct-setup');
}

function ctDone() {
    $('#ct-done-label').textContent =
        ctState.label !== '计时'
            ? `「${ctState.label}」完成~乖女孩♠`
            : '乖女孩~你做到了♠';
    showCtScreen('ct-done');
}

function initCountdownTimer() {
    // 快捷预设
    $$('[data-ct-seconds]').forEach((btn) => {
        btn.addEventListener('click', () => {
            unlockAudio();
            ctStart(parseInt(btn.dataset.ctSeconds));
        });
    });

    // 自定义开始
    $('#btn-ct-start')?.addEventListener('click', () => {
        unlockAudio();
        const h = parseInt($('#ct-hours').value) || 0;
        const m = parseInt($('#ct-minutes').value) || 0;
        const s = parseInt($('#ct-seconds').value) || 0;
        ctStart(h * 3600 + m * 60 + s);
    });

    // 暂停 / 停止
    $('#btn-ct-pause')?.addEventListener('click', ctTogglePause);
    $('#btn-ct-stop')?.addEventListener('click', ctStop);

    // 完成后
    $('#btn-ct-restart')?.addEventListener('click', () => {
        unlockAudio();
        ctStart(ctState.totalSeconds);
    });
    $('#btn-ct-new')?.addEventListener('click', () => showCtScreen('ct-setup'));
}

/* ============================================
 * MODULE 3: MUSIC PLAYER (with IndexedDB persistence & playlists)
 * ============================================ */
const MUSIC_DB_NAME = 'sissy_music_db';
const MUSIC_DB_VERSION = 1;
const MUSIC_META_KEY = 'sissy_music_meta';

const musicState = {
    playlists: [],          // [{ id, name, tracks: [{ id, name, blobKey, duration, durationSec, addedAt, isVideo }] }]
    currentPlaylistId: null,
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 'none',         // 'none' | 'all' | 'one'
    sortMode: 'addedAt',    // 'addedAt' | 'name'
    sortAsc: true
};

const audio = document.getElementById('audio-player');

/* ---------- IndexedDB helpers ---------- */
function musicOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(MUSIC_DB_NAME, MUSIC_DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('blobs')) {
                db.createObjectStore('blobs');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function musicSaveBlob(key, blob) {
    const db = await musicOpenDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function musicLoadBlob(key) {
    const db = await musicOpenDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').get(key);
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function musicDeleteBlob(key) {
    const db = await musicOpenDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

/* ---------- Meta persistence (localStorage) ---------- */
function musicSaveMeta() {
    const meta = {
        playlists: musicState.playlists.map((pl) => ({
            id: pl.id,
            name: pl.name,
            tracks: pl.tracks.map((t) => ({
                id: t.id, name: t.name, blobKey: t.blobKey,
                duration: t.duration, durationSec: t.durationSec,
                addedAt: t.addedAt, isVideo: t.isVideo
            }))
        })),
        currentPlaylistId: musicState.currentPlaylistId,
        sortMode: musicState.sortMode,
        sortAsc: musicState.sortAsc
    };
    try { localStorage.setItem(MUSIC_META_KEY, JSON.stringify(meta)); } catch (e) {}
    appDBSet(MUSIC_META_KEY, meta);
}

async function musicLoadMeta() {
    try {
        // 优先从 IndexedDB 读取
        const idbMeta = await appDBGet(MUSIC_META_KEY);
        if (idbMeta && idbMeta.playlists && idbMeta.playlists.length > 0) {
            musicState.playlists = idbMeta.playlists;
            musicState.currentPlaylistId = idbMeta.currentPlaylistId || idbMeta.playlists[0].id;
            musicState.sortMode = idbMeta.sortMode || 'addedAt';
            musicState.sortAsc = idbMeta.sortAsc !== undefined ? idbMeta.sortAsc : true;
            return true;
        }
        // 兼容：从 localStorage 读取
        const raw = localStorage.getItem(MUSIC_META_KEY);
        if (!raw) return false;
        const meta = JSON.parse(raw);
        if (meta.playlists && meta.playlists.length > 0) {
            musicState.playlists = meta.playlists;
            musicState.currentPlaylistId = meta.currentPlaylistId || meta.playlists[0].id;
            musicState.sortMode = meta.sortMode || 'addedAt';
            musicState.sortAsc = meta.sortAsc !== undefined ? meta.sortAsc : true;
            return true;
        }
    } catch (e) {}
    return false;
}

function musicGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Current playlist helper ---------- */
function musicGetCurrentPlaylist() {
    return musicState.playlists.find((p) => p.id === musicState.currentPlaylistId) || null;
}

function musicGetSortedTracks() {
    const pl = musicGetCurrentPlaylist();
    if (!pl) return [];
    const tracks = [...pl.tracks];
    if (musicState.sortMode === 'name') {
        tracks.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            const cmp = nameA.localeCompare(nameB, 'zh-Hans');
            return musicState.sortAsc ? cmp : -cmp;
        });
    } else {
        // 按添加时间排序
        tracks.sort((a, b) => {
            const timeA = a.addedAt || 0;
            const timeB = b.addedAt || 0;
            const cmp = timeA - timeB;
            return musicState.sortAsc ? cmp : -cmp;
        });
    }
    return tracks;
}

/* ---------- Format ---------- */
function musicFormatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

/* ---------- Render: Playlist selector ---------- */
function musicRenderPlaylistSelector() {
    const sel = $('#playlist-selector');
    if (!sel) return;
    sel.innerHTML = musicState.playlists.map((pl) =>
        `<option value="${pl.id}" ${pl.id === musicState.currentPlaylistId ? 'selected' : ''}>${pl.name} (${pl.tracks.length})</option>`
    ).join('');
}

/* ---------- Render: Track list ---------- */
function musicRenderPlaylist() {
    const container = $('#playlist');
    const dropZone = $('#music-drop-zone');
    const tracks = musicGetSortedTracks();

    if (tracks.length === 0) {
        container.innerHTML = `
            <div class="playlist__empty">
                <p>还没有歌呢~</p>
                <p class="playlist__hint">点下方区域添加音乐/视频~</p>
            </div>`;
        if (dropZone) dropZone.classList.remove('hidden');
        return;
    }

    container.innerHTML = tracks.map((track, i) => {
        const isActive = track.id === musicState._playingTrackId;
        return `
        <div class="playlist__item ${isActive ? 'active' : ''}" data-track-id="${track.id}">
            <div class="playlist__item-num">${isActive ? '♠' : (i + 1)}</div>
            <div class="playlist__item-info">
                <div class="playlist__item-title">${track.isVideo ? '🎬 ' : ''}${track.name}</div>
                <div class="playlist__item-duration">${track.duration || '--:--'}</div>
            </div>
            <button class="playlist__item-remove" data-track-id="${track.id}">&times;</button>
        </div>`;
    }).join('');

    if (dropZone) dropZone.classList.add('hidden');

    // 绑定点击播放
    container.querySelectorAll('.playlist__item').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.playlist__item-remove')) return;
            const trackId = item.dataset.trackId;
            const idx = tracks.findIndex((t) => t.id === trackId);
            musicPlayIndex(idx, tracks);
        });
    });

    // 绑定删除
    container.querySelectorAll('.playlist__item-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            musicRemoveTrack(btn.dataset.trackId);
        });
    });

    // 滚动到当前播放的歌曲
    const activeItem = container.querySelector('.playlist__item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    musicRenderPlaylistSelector();
}

/* ---------- Sort controls ---------- */
function musicRenderSortState() {
    const btnName = $('#btn-sort-name');
    const btnTime = $('#btn-sort-time');
    if (!btnName || !btnTime) return;

    btnName.classList.toggle('active', musicState.sortMode === 'name');
    btnTime.classList.toggle('active', musicState.sortMode === 'addedAt');

    const arrow = musicState.sortAsc ? '↑' : '↓';
    btnName.textContent = '名称' + (musicState.sortMode === 'name' ? arrow : '');
    btnTime.textContent = '时间' + (musicState.sortMode === 'addedAt' ? arrow : '');
}

function musicSetSort(mode) {
    if (musicState.sortMode === mode) {
        musicState.sortAsc = !musicState.sortAsc;
    } else {
        musicState.sortMode = mode;
        musicState.sortAsc = true;
    }
    // 排序变更后，根据当前播放歌曲 ID 重新定位索引
    const sorted = musicGetSortedTracks();
    if (musicState._playingTrackId) {
        const newIdx = sorted.findIndex((t) => t.id === musicState._playingTrackId);
        if (newIdx >= 0) musicState.currentIndex = newIdx;
    } else if (musicState.currentIndex >= 0 && musicState.currentIndex < sorted.length) {
        // 没有正在播放的歌曲时，重置索引
        musicState.currentIndex = -1;
    }
    musicSaveMeta();
    musicRenderSortState();
    musicRenderPlaylist();
}

/* ---------- Add files ---------- */
async function musicAddFiles(files) {
    const pl = musicGetCurrentPlaylist();
    if (!pl) return;

    const promises = Array.from(files).map(async (file) => {
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        const ext = file.name.split('.').pop().toLowerCase();
        const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus', 'webm'];
        const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'];
        const isValidAudio = isAudio || audioExts.includes(ext);
        const isValidVideo = isVideo || videoExts.includes(ext);
        if (!isValidAudio && !isValidVideo) return;

        const trackId = musicGenId();
        const blobKey = 'track_' + trackId;
        const name = file.name.replace(/\.[^/.]+$/, '');
        const isVideoTrack = isValidVideo && !isValidAudio;

        // 存储 Blob 到 IndexedDB
        await musicSaveBlob(blobKey, file);

        // 获取时长
        const durationInfo = await new Promise((resolve) => {
            const objectUrl = URL.createObjectURL(file);
            const tempMedia = isVideoTrack ? document.createElement('video') : new Audio();
            tempMedia.preload = 'metadata';
            tempMedia.src = objectUrl;
            const cleanup = () => { URL.revokeObjectURL(objectUrl); };
            tempMedia.addEventListener('loadedmetadata', () => {
                cleanup();
                resolve({ duration: musicFormatTime(tempMedia.duration), durationSec: tempMedia.duration });
            });
            tempMedia.addEventListener('error', () => {
                cleanup();
                resolve({ duration: null, durationSec: 0 });
            });
        });

        const track = {
            id: trackId,
            name,
            blobKey,
            duration: durationInfo.duration,
            durationSec: durationInfo.durationSec,
            addedAt: Date.now(),
            isVideo: isVideoTrack
        };
        pl.tracks.push(track);
    });

    await Promise.all(promises);
    musicSaveMeta();
    musicRenderPlaylist();
}

/* ---------- Remove track ---------- */
async function musicRemoveTrack(trackId) {
    const pl = musicGetCurrentPlaylist();
    if (!pl) return;

    const idx = pl.tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;

    const track = pl.tracks[idx];
    // 删除 IndexedDB 中的 Blob
    await musicDeleteBlob(track.blobKey).catch(() => {});
    // 释放 objectUrl（如果有）
    if (track._objectUrl) URL.revokeObjectURL(track._objectUrl);

    pl.tracks.splice(idx, 1);

    if (trackId === musicState._playingTrackId) {
        audio.pause();
        musicState.isPlaying = false;
        musicState.currentIndex = -1;
        musicState._playingTrackId = null;
        musicUpdateNowPlaying();
        musicUpdatePlayBtn();
    }

    musicSaveMeta();
    musicRenderPlaylist();
}

/* ---------- Play ---------- */
async function musicPlayIndex(index, sortedTracks) {
    const tracks = sortedTracks || musicGetSortedTracks();
    if (index < 0 || index >= tracks.length) return;

    musicState.currentIndex = index;
    const track = tracks[index];
    musicState._playingTrackId = track.id;

    // 从 IndexedDB 加载 Blob
    try {
        const blob = await musicLoadBlob(track.blobKey);
        if (!blob) {
            musicUpdateNowPlaying();
            return;
        }
        if (track._objectUrl) URL.revokeObjectURL(track._objectUrl);
        track._objectUrl = URL.createObjectURL(blob);
        audio.src = track._objectUrl;
        await audio.play();
        musicState.isPlaying = true;
        musicUpdatePlayBtn();
        musicUpdateNowPlaying();
        musicRenderPlaylist();
    } catch (e) {
        // 播放失败
    }
}

function musicTogglePlay() {
    const tracks = musicGetSortedTracks();
    if (tracks.length === 0) return;
    if (musicState.currentIndex < 0 || !musicState._playingTrackId) {
        musicPlayIndex(0);
        return;
    }
    if (musicState.isPlaying) {
        audio.pause();
        musicState.isPlaying = false;
    } else {
        audio.play().catch(() => {});
        musicState.isPlaying = true;
    }
    musicUpdatePlayBtn();
}

function musicPrev() {
    const tracks = musicGetSortedTracks();
    if (tracks.length === 0) return;
    let idx = musicState.currentIndex - 1;
    if (idx < 0) idx = tracks.length - 1;
    musicPlayIndex(idx, tracks);
}

function musicNext() {
    const tracks = musicGetSortedTracks();
    if (tracks.length === 0) return;
    if (musicState.shuffle) {
        let idx;
        do { idx = Math.floor(Math.random() * tracks.length); }
        while (idx === musicState.currentIndex && tracks.length > 1);
        musicPlayIndex(idx, tracks);
        return;
    }
    let idx = musicState.currentIndex + 1;
    if (idx >= tracks.length) {
        if (musicState.repeat === 'all') idx = 0;
        else { musicState.isPlaying = false; musicUpdatePlayBtn(); return; }
    }
    musicPlayIndex(idx, tracks);
}

function musicUpdatePlayBtn() {
    $('#icon-play').style.display = musicState.isPlaying ? 'none' : 'block';
    $('#icon-pause').style.display = musicState.isPlaying ? 'block' : 'none';
}

function musicUpdateNowPlaying() {
    const tracks = musicGetSortedTracks();
    if (musicState._playingTrackId) {
        const track = tracks.find((t) => t.id === musicState._playingTrackId);
        if (track) {
            const idx = tracks.indexOf(track);
            $('#music-title').textContent = track.name;
            $('#music-artist').textContent = `第 ${idx + 1} 首 / 共 ${tracks.length} 首`;
            return;
        }
    }
    $('#music-title').textContent = '还没选曲呢~';
    $('#music-artist').textContent = '快加点音乐，骚货~';
}

function musicToggleShuffle() {
    musicState.shuffle = !musicState.shuffle;
    $('#btn-music-shuffle').classList.toggle('active', musicState.shuffle);
}

function musicToggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const idx = (modes.indexOf(musicState.repeat) + 1) % modes.length;
    musicState.repeat = modes[idx];
    const btn = $('#btn-music-repeat');
    btn.classList.toggle('active', musicState.repeat !== 'none');
    btn.title = musicState.repeat === 'one' ? 'Repeat One'
        : musicState.repeat === 'all' ? 'Repeat All' : 'Repeat';
}

/* ---------- Playlist CRUD ---------- */
function musicCreatePlaylist(name) {
    const pl = { id: musicGenId(), name: name || '新清单', tracks: [] };
    musicState.playlists.push(pl);
    musicState.currentPlaylistId = pl.id;
    musicSaveMeta();
    musicRenderPlaylistSelector();
    musicRenderPlaylist();
    musicUpdateNowPlaying();
}

function musicDeleteCurrentPlaylist() {
    if (musicState.playlists.length <= 1) return; // 至少保留一个
    const pl = musicGetCurrentPlaylist();
    if (!pl) return;
    // 删除所有 Blob
    pl.tracks.forEach((t) => {
        musicDeleteBlob(t.blobKey).catch(() => {});
        if (t._objectUrl) URL.revokeObjectURL(t._objectUrl);
    });
    const idx = musicState.playlists.indexOf(pl);
    musicState.playlists.splice(idx, 1);
    musicState.currentPlaylistId = musicState.playlists[0].id;
    audio.pause();
    musicState.isPlaying = false;
    musicState.currentIndex = -1;
    musicState._playingTrackId = null;
    musicUpdatePlayBtn();
    musicSaveMeta();
    musicRenderPlaylistSelector();
    musicRenderPlaylist();
    musicUpdateNowPlaying();
}

function musicRenameCurrentPlaylist() {
    const pl = musicGetCurrentPlaylist();
    if (!pl) return;
    const newName = prompt('给清单起个名字~', pl.name);
    if (newName && newName.trim()) {
        pl.name = newName.trim();
        musicSaveMeta();
        musicRenderPlaylistSelector();
    }
}

function musicSwitchPlaylist(playlistId) {
    if (musicState.currentPlaylistId === playlistId) return;
    musicState.currentPlaylistId = playlistId;
    musicState.currentIndex = -1;
    musicState._playingTrackId = null;
    audio.pause();
    musicState.isPlaying = false;
    musicUpdatePlayBtn();
    musicSaveMeta();
    musicRenderPlaylist();
    musicUpdateNowPlaying();
}

/* ---------- Init ---------- */
function initMusicPlayer() {
    // 加载持久化数据（异步）
    return musicLoadMeta().then((hasData) => {
    if (!hasData) {
        // 创建默认播放清单
        musicState.playlists = [{ id: musicGenId(), name: '默认清单', tracks: [] }];
        musicState.currentPlaylistId = musicState.playlists[0].id;
        musicSaveMeta();
    }

    // 添加文件（主按钮 + 备用大区域按钮）
    const fileInputHandler = (e) => {
        if (e.target.files.length > 0) {
            musicAddFiles(e.target.files);
            e.target.value = '';
        }
    };
    $('#music-file-input')?.addEventListener('change', fileInputHandler);
    $('#music-file-input-alt')?.addEventListener('change', fileInputHandler);

    // 播放控制
    $('#btn-music-play')?.addEventListener('click', musicTogglePlay);
    $('#btn-music-prev')?.addEventListener('click', musicPrev);
    $('#btn-music-next')?.addEventListener('click', musicNext);
    $('#btn-music-shuffle')?.addEventListener('click', musicToggleShuffle);
    $('#btn-music-repeat')?.addEventListener('click', musicToggleRepeat);

    // 排序按钮
    $('#btn-sort-name')?.addEventListener('click', () => musicSetSort('name'));
    $('#btn-sort-time')?.addEventListener('click', () => musicSetSort('addedAt'));

    // 播放清单管理
    $('#playlist-selector')?.addEventListener('change', (e) => {
        musicSwitchPlaylist(e.target.value);
    });
    $('#btn-pl-new')?.addEventListener('click', () => {
        const name = prompt('给新清单起个名字~', '');
        if (name && name.trim()) musicCreatePlaylist(name.trim());
    });
    $('#btn-pl-rename')?.addEventListener('click', musicRenameCurrentPlaylist);
    $('#btn-pl-delete')?.addEventListener('click', () => {
        if (musicState.playlists.length <= 1) {
            alert('至少要保留一个清单哦~');
            return;
        }
        if (confirm('确定要删除这个清单吗？里面的歌都会没掉哦~')) {
            musicDeleteCurrentPlaylist();
        }
    });

    // 进度条拖动
    const seekBar = $('#music-seek');
    seekBar?.addEventListener('input', () => {
        if (audio.duration) {
            audio.currentTime = (seekBar.value / 100) * audio.duration;
        }
    });

    // 音量
    const volBar = $('#music-volume');
    volBar?.addEventListener('input', () => {
        audio.volume = volBar.value / 100;
    });
    audio.volume = 0.8;

    // 音频事件
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (seekBar && !seekBar.matches(':active')) seekBar.value = pct;
        $('#music-current').textContent = musicFormatTime(audio.currentTime);
        $('#music-duration').textContent = musicFormatTime(audio.duration);
    });

    audio.addEventListener('ended', () => {
        if (musicState.repeat === 'one') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } else {
            musicNext();
        }
    });

    // 初始渲染
    musicRenderPlaylistSelector();
    musicRenderSortState();
    musicRenderPlaylist();
    });
}

/* ============================================
 * MODULE 4: TRAINING CALENDAR
 * ============================================ */
const CAL_STORAGE_KEY = 'sissy_training_calendar';
const CAL_TASKS = ['daily', 'day1', 'day2', 'day3'];
const CAL_TASK_NAMES = {
    daily: '每日束腰与核心',
    day1: '蜜桃臀与腿部',
    day2: '腰腹强化与体态',
    day3: '胸部与手臂'
};

const calState = {
    year: 0,
    month: 0,  // 0-indexed
    selectedDate: '',  // 'YYYY-MM-DD'
    data: {}  // { 'YYYY-MM-DD': { daily: true, day1: false, ... } }
};

function calGetDateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function calLoadData() {
    try {
        // 优先从 IndexedDB 读取
        const idbData = await appDBGet(CAL_STORAGE_KEY);
        if (idbData) { calState.data = idbData; return; }
        // 兼容：从 localStorage 读取
        const raw = localStorage.getItem(CAL_STORAGE_KEY);
        if (raw) calState.data = JSON.parse(raw);
    } catch (e) { calState.data = {}; }
}

function calSaveData() {
    try { localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(calState.data)); } catch (e) {}
    appDBSet(CAL_STORAGE_KEY, calState.data);
}

function calRenderMonth() {
    const y = calState.year;
    const m = calState.month;
    const today = new Date();
    const todayKey = calGetDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    // 月份标题
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月',
        '7月', '8月', '9月', '10月', '11月', '12月'];
    $('#cal-month-title').textContent = `${y}年 ${monthNames[m]}`;

    // 计算日历网格
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();

    // 上月填充
    const prevMonthLast = new Date(y, m, 0).getDate();

    const grid = $('#cal-grid');
    grid.innerHTML = '';

    // 上月尾部
    for (let i = startDow - 1; i >= 0; i--) {
        const d = prevMonthLast - i;
        const btn = document.createElement('button');
        btn.className = 'cal-day other-month';
        btn.textContent = d;
        grid.appendChild(btn);
    }

    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
        const key = calGetDateKey(y, m, d);
        const btn = document.createElement('button');
        btn.className = 'cal-day';
        btn.textContent = d;
        btn.dataset.date = key;

        if (key === todayKey) btn.classList.add('today');
        if (key === calState.selectedDate) btn.classList.add('selected');

        // 检查是否有记录
        const rec = calState.data[key];
        if (rec) {
            const done = CAL_TASKS.filter(t => rec[t]).length;
            if (done > 0) {
                btn.classList.add('has-record');
                if (done === CAL_TASKS.length) btn.classList.add('full');
            }
        }

        btn.addEventListener('click', () => calSelectDate(key));
        grid.appendChild(btn);
    }

    // 下月填充（补满6行）
    const totalCells = startDow + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
        const btn = document.createElement('button');
        btn.className = 'cal-day other-month';
        btn.textContent = d;
        grid.appendChild(btn);
    }

    calUpdateStats();
}

function calSelectDate(dateKey) {
    calState.selectedDate = dateKey;
    calRenderMonth();
    calRenderDayPanel();
}

function calRenderDayPanel() {
    const key = calState.selectedDate;
    if (!key) return;

    const parts = key.split('-');
    const d = parseInt(parts[2]);
    const m = parseInt(parts[1]);
    const today = new Date();
    const todayKey = calGetDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    $('#cal-selected-date').textContent = key === todayKey
        ? `今天 · ${m}月${d}日`
        : `${m}月${d}日`;

    const rec = calState.data[key] || {};
    const checks = $$('#cal-task-list .cal-task__check');
    const tasks = $$('#cal-task-list .cal-task');

    let doneCount = 0;
    tasks.forEach((task, i) => {
        const taskKey = task.dataset.task;
        const check = checks[i];
        check.checked = !!rec[taskKey];
        if (check.checked) doneCount++;
    });

    $('#cal-done-count').textContent = `${doneCount} / ${CAL_TASKS.length} 完成了~`;
}

function calOnTaskToggle(taskKey, checked) {
    const key = calState.selectedDate;
    if (!key) return;

    if (!calState.data[key]) {
        calState.data[key] = {};
    }
    calState.data[key][taskKey] = checked;

    // 清理空记录
    const rec = calState.data[key];
    if (CAL_TASKS.every(t => !rec[t])) {
        delete calState.data[key];
    }

    calSaveData();
    calRenderMonth();
    calRenderDayPanel();
}

function calUpdateStats() {
    // 连续天数（从今天往回数）
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = calGetDateKey(d.getFullYear(), d.getMonth(), d.getDate());
        const rec = calState.data[key];
        if (rec && CAL_TASKS.some(t => rec[t])) {
            streak++;
        } else if (i > 0) {
            break;
        } else {
            // 今天还没练也算（不断连续）
            break;
        }
    }
    $('#cal-streak').textContent = streak;

    // 本月完成次数（有任何一项完成就算一天）
    const y = calState.year;
    const m = calState.month;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let monthTotal = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const key = calGetDateKey(y, m, d);
        const rec = calState.data[key];
        if (rec && CAL_TASKS.some(t => rec[t])) monthTotal++;
    }
    $('#cal-month-total').textContent = monthTotal;
}

function initCalendar() {
    return calLoadData().then(() => {
    const today = new Date();
    calState.year = today.getFullYear();
    calState.month = today.getMonth();
    calState.selectedDate = calGetDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    // 月份导航
    $('#btn-cal-prev')?.addEventListener('click', () => {
        calState.month--;
        if (calState.month < 0) { calState.month = 11; calState.year--; }
        calRenderMonth();
    });
    $('#btn-cal-next')?.addEventListener('click', () => {
        calState.month++;
        if (calState.month > 11) { calState.month = 0; calState.year++; }
        calRenderMonth();
    });

    // 任务勾选
    $$('#cal-task-list .cal-task').forEach((task) => {
        const check = task.querySelector('.cal-task__check');
        check?.addEventListener('change', () => {
            calOnTaskToggle(task.dataset.task, check.checked);
        });
    });

    calRenderMonth();
    calRenderDayPanel();
    });
}

/* ============================================
 * MODULE 5: WEAR TRACKER (Cage & Plug)
 * ============================================ */
const WEAR_STORAGE_KEY = 'sissy_wear_tracker';

const wearState = {
    cage: { isWearing: false, startTime: null, todayTotal: 0, allTimeTotal: 0, sessions: 0, todaySessions: [] },
    plug: { isWearing: false, startTime: null, todayTotal: 0, allTimeTotal: 0, sessions: 0, todaySessions: [] },
    _timerId: null,
    _lastDate: ''  // 用于检测日期变更
};

function wearGetTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wearFormatDuration(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function wearFormatHours(seconds) {
    if (!seconds || seconds < 0) return '0h';
    const h = seconds / 3600;
    if (h >= 1) return `${h.toFixed(1)}h`;
    const m = Math.floor(seconds / 60);
    return `${m}m`;
}

async function wearLoadData() {
    try {
        // 优先从 IndexedDB 读取
        let data = await appDBGet(WEAR_STORAGE_KEY);
        if (!data) {
            // 兼容：从 localStorage 读取
            const raw = localStorage.getItem(WEAR_STORAGE_KEY);
            if (!raw) return;
            data = JSON.parse(raw);
        }
        const todayKey = wearGetTodayKey();

        ['cage', 'plug'].forEach((type) => {
            const saved = data[type];
            if (!saved) return;
            wearState[type].allTimeTotal = saved.allTimeTotal || 0;
            wearState[type].sessions = saved.sessions || 0;

            // 恢复今日数据
            if (saved.todayKey === todayKey) {
                wearState[type].todayTotal = saved.todayTotal || 0;
                wearState[type].todaySessions = saved.todaySessions || [];
            } else {
                wearState[type].todayTotal = 0;
                wearState[type].todaySessions = [];
            }

            // 恢复进行中的佩戴
            if (saved.isWearing && saved.startTime) {
                wearState[type].isWearing = true;
                wearState[type].startTime = saved.startTime;
                if (type === 'plug' && saved.currentSize) {
                    wearState[type].currentSize = saved.currentSize;
                }
            }
        });

        wearState._lastDate = todayKey;
    } catch (e) {}
}

function wearSaveData() {
    const todayKey = wearGetTodayKey();
    const data = {};
    ['cage', 'plug'].forEach((type) => {
        const s = wearState[type];
        data[type] = {
            isWearing: s.isWearing,
            startTime: s.startTime,
            currentSize: s.currentSize || '',
            allTimeTotal: s.allTimeTotal,
            sessions: s.sessions,
            todayKey: todayKey,
            todayTotal: s.todayTotal,
            todaySessions: s.todaySessions
        };
    });
    try { localStorage.setItem(WEAR_STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    appDBSet(WEAR_STORAGE_KEY, data);
}

function wearToggle(type) {
    const state = wearState[type];
    if (state.isWearing) {
        // 结束佩戴
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        state.todayTotal += elapsed;
        state.allTimeTotal += elapsed;
        state.sessions++;

        // 记录本次会话
        const session = {
            start: state.startTime,
            end: Date.now(),
            duration: elapsed
        };
        // Plug 会话记录尺寸
        if (type === 'plug' && state.currentSize) {
            session.size = state.currentSize;
        }
        state.todaySessions.push(session);

        state.isWearing = false;
        state.startTime = null;

        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    } else {
        // 开始佩戴
        // Plug 需要选择尺寸
        if (type === 'plug') {
            const sizeSelect = $('#plug-size-select');
            const selectedSize = sizeSelect ? sizeSelect.value : '';
            if (!selectedSize) {
                alert('请先选择 Plug 尺寸哦~主人要知道你用的哪一个♠');
                return;
            }
            state.currentSize = selectedSize;
        }
        state.isWearing = true;
        state.startTime = Date.now();
        if (navigator.vibrate) navigator.vibrate(50);
    }

    wearSaveData();
    wearUpdateUI();
}

function wearGetCurrentElapsed(type) {
    const state = wearState[type];
    if (!state.isWearing || !state.startTime) return 0;
    return Math.floor((Date.now() - state.startTime) / 1000);
}

function wearUpdateUI() {
    ['cage', 'plug'].forEach((type) => {
        const state = wearState[type];
        const isWearing = state.isWearing;
        const elapsed = wearGetCurrentElapsed(type);

        // 状态文字
        const statusEl = $(`#${type}-status`);
        if (statusEl) {
            statusEl.textContent = isWearing ? '佩戴中~乖女孩♠' : '未佩戴';
            statusEl.classList.toggle('wearing', isWearing);
        }

        // 按钮
        const toggleBtn = $(`#btn-${type}-toggle`);
        const toggleText = $(`#${type}-toggle-text`);
        if (toggleBtn) toggleBtn.classList.toggle('stop', isWearing);
        if (toggleText) toggleText.textContent = isWearing ? '结束佩戴' : '开始佩戴';

        // 卡片高亮
        const card = $(`#wear-${type}-card`);
        if (card) card.classList.toggle('active', isWearing);

        // 本次计时
        const timerDisplay = $(`#${type}-timer-display`);
        if (timerDisplay) timerDisplay.classList.toggle('hidden', !isWearing);
        $(`#${type}-current-time`).textContent = wearFormatDuration(elapsed);

        // 统计
        const todayWithCurrent = state.todayTotal + (isWearing ? elapsed : 0);
        const totalWithCurrent = state.allTimeTotal + (isWearing ? elapsed : 0);
        $(`#${type}-today`).textContent = wearFormatHours(todayWithCurrent);
        $(`#${type}-total`).textContent = wearFormatHours(totalWithCurrent);
        $(`#${type}-sessions`).textContent = state.sessions + (isWearing ? 0 : 0);
    });

    // 今日记录
    wearRenderTodayLog();
}

function wearRenderTodayLog() {
    const container = $('#wear-today-log');
    if (!container) return;

    const allSessions = [];

    ['cage', 'plug'].forEach((type) => {
        const state = wearState[type];
        state.todaySessions.forEach((s) => {
            allSessions.push({
                type: type,
                icon: type === 'cage' ? '🔒' : '♠',
                name: type === 'cage' ? 'Cage' : 'Plug',
                start: s.start,
                end: s.end,
                duration: s.duration,
                size: s.size || ''
            });
        });
    });

    // 按结束时间倒序
    allSessions.sort((a, b) => b.end - a.end);

    if (allSessions.length === 0) {
        container.innerHTML = '<div class="wear-history__empty">今天还没有记录哦~快戴上吧，骚货♠</div>';
        return;
    }

    container.innerHTML = allSessions.map((s, idx) => {
        const startTime = new Date(s.start);
        const endTime = new Date(s.end);
        const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')} - ${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;
        const sizeTag = s.size ? `<span class="wear-history__item-size">${s.size}</span>` : '';
        return `
        <div class="wear-history__item">
            <div class="wear-history__item-icon">${s.icon}</div>
            <div class="wear-history__item-info">
                <div class="wear-history__item-type">${s.name} ${sizeTag}</div>
                <div class="wear-history__item-time">${timeStr}</div>
            </div>
            <div class="wear-history__item-duration">${wearFormatDuration(s.duration)}</div>
            <button class="wear-history__item-delete" onclick="wearDeleteSession('${s.type}', ${s.start})" title="删除">✕</button>
        </div>`;
    }).join('');
}

/**
 * 删除一条佩戴记录
 * @param {string} type 'cage' 或 'plug'
 * @param {number} startTime 记录的开始时间戳
 */
function wearDeleteSession(type, startTime) {
    const state = wearState[type];
    const idx = state.todaySessions.findIndex((s) => s.start === startTime);
    if (idx < 0) return;

    const session = state.todaySessions[idx];
    // 从今日总时长和总计中扣除
    state.todayTotal -= session.duration;
    state.allTimeTotal -= session.duration;
    state.sessions--;

    // 防止负数
    if (state.todayTotal < 0) state.todayTotal = 0;
    if (state.allTimeTotal < 0) state.allTimeTotal = 0;
    if (state.sessions < 0) state.sessions = 0;

    state.todaySessions.splice(idx, 1);

    if (navigator.vibrate) navigator.vibrate(30);
    wearSaveData();
    wearUpdateUI();
}

function wearCheckDateChange() {
    const todayKey = wearGetTodayKey();
    if (wearState._lastDate && wearState._lastDate !== todayKey) {
        // 日期变了，重置今日数据（但保留进行中的佩戴）
        ['cage', 'plug'].forEach((type) => {
            wearState[type].todayTotal = 0;
            wearState[type].todaySessions = [];
        });
        wearState._lastDate = todayKey;
        wearSaveData();
    }
}

function wearStartTicker() {
    if (wearState._timerId) return;
    wearState._timerId = setInterval(() => {
        wearCheckDateChange();
        // 只在有佩戴进行中时更新 UI
        if (wearState.cage.isWearing || wearState.plug.isWearing) {
            wearUpdateUI();
            // 每30秒自动保存一次（防止意外关闭丢失数据）
            wearSaveData();
        }
    }, 1000);
}

function initWearTracker() {
    return wearLoadData().then(() => {
    // 绑定按钮
    $('#btn-cage-toggle')?.addEventListener('click', () => wearToggle('cage'));
    $('#btn-plug-toggle')?.addEventListener('click', () => wearToggle('plug'));

    // 初始渲染
    wearUpdateUI();
    plugUpdateSizeSelect();

    // 启动定时器
    wearStartTicker();
    });
}

/**
 * 从 closet 中获取 plug 的可用尺寸，填充到 Wear Tracker 的尺寸下拉菜单
 */
function plugUpdateSizeSelect() {
    const select = $('#plug-size-select');
    if (!select) return;

    const plugItems = closetState.items.filter((i) => i.category === 'plug');
    // 收集所有不同的尺寸
    const sizes = new Set();
    plugItems.forEach((item) => {
        if (item.type) sizes.add(item.type);
    });

    if (sizes.size === 0) {
        select.innerHTML = '<option value="">请先在 Boudoir 中添加 Plug</option>';
    } else {
        select.innerHTML = '<option value="">请选择尺寸...</option>' +
            [...sizes].map((s) => `<option value="${s}">${s}</option>`).join('');
    }
}

/* ============================================
 * MODULE 6: STOCKINGS DIARY (丝袜日记)
 * ============================================ */
const STK_STORAGE_KEY = 'sissy_stockings_diary';

const stkState = {
    records: [],  // [{ date: 'YYYY-MM-DD', brand: '', model: '' }]
};

function stkGetTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stkFormatDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

async function stkLoadData() {
    try {
        // 优先从 IndexedDB 读取
        const idbData = await appDBGet(STK_STORAGE_KEY);
        if (idbData) { stkState.records = idbData.records || []; return; }
        // 兼容：从 localStorage 读取
        const raw = localStorage.getItem(STK_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            stkState.records = data.records || [];
        }
    } catch (e) { stkState.records = []; }
}

function stkSaveData() {
    const payload = { records: stkState.records };
    try { localStorage.setItem(STK_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    appDBSet(STK_STORAGE_KEY, payload);
}

function stkGetTodayRecord() {
    const todayKey = stkGetTodayKey();
    return stkState.records.find((r) => r.date === todayKey) || null;
}

function stkRecord() {
    const closetSelect = $('#stk-closet-select');
    const colorSelect = $('#stk-color-select');
    const closetId = closetSelect ? closetSelect.value : '';
    const selectedColor = colorSelect ? colorSelect.value : '';

    if (!closetId) {
        alert('请先从收藏柜选择一双丝袜哦~乖女孩要记清楚穿的什么♠');
        return;
    }

    const todayKey = stkGetTodayKey();

    // 检查今天是否已记录
    if (stkGetTodayRecord()) {
        alert('今天已经记录过了~乖女孩每天只能记录一次♠');
        return;
    }

    // 从 closet 中找到对应的丝袜信息
    const closetItem = closetState.items.find((i) => i.id === closetId);
    if (!closetItem) {
        alert('选择的丝袜不存在，请重新选择~');
        return;
    }

    stkState.records.push({
        date: todayKey,
        brand: closetItem.brand,
        model: closetItem.model,
        denier: closetItem.denier || 0,
        type: closetItem.type || '',
        color: selectedColor
    });
    stkSaveData();

    if (navigator.vibrate) navigator.vibrate(50);

    // 重置选择
    if (closetSelect) closetSelect.value = '';
    if (colorSelect) {
        colorSelect.innerHTML = '<option value="">请先选择丝袜...</option>';
    }
    const previewEl = $('#stk-selected-preview');
    if (previewEl) previewEl.classList.add('hidden');

    stkUpdateUI();
}

function stkGetRanking() {
    // 按 brand + model 组合统计穿着次数
    const countMap = {};
    stkState.records.forEach((r) => {
        const key = `${r.brand}|||${r.model}`;
        if (!countMap[key]) {
            countMap[key] = { brand: r.brand, model: r.model, denier: r.denier || 0, type: r.type || '', color: r.color || '', count: 0 };
        }
        countMap[key].count++;
    });

    // 转为数组并按次数降序排列
    return Object.values(countMap).sort((a, b) => b.count - a.count);
}

function stkGetBrandSuggestions() {
    const brands = new Set();
    stkState.records.forEach((r) => brands.add(r.brand));
    return [...brands];
}

function stkGetModelSuggestions() {
    const models = new Set();
    stkState.records.forEach((r) => models.add(r.model));
    return [...models];
}

function stkUpdateUI() {
    const todayKey = stkGetTodayKey();
    const todayDate = new Date();
    const dateStr = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`;

    // 今日日期
    const dateEl = $('#stk-today-date');
    if (dateEl) dateEl.textContent = dateStr;

    // 检查今日是否已记录
    const todayRec = stkGetTodayRecord();
    const formEl = $('#stk-form');
    const recordedEl = $('#stk-recorded');
    const cardEl = $('#stk-today-card');

    if (todayRec) {
        // 已记录
        if (formEl) formEl.classList.add('hidden');
        if (recordedEl) recordedEl.classList.remove('hidden');
        if (cardEl) cardEl.classList.add('recorded');
        $('#stk-recorded-brand').textContent = todayRec.brand;
        $('#stk-recorded-model').textContent = todayRec.model;
        // 显示额外信息（丹数、类型、颜色）
        const extraParts = [];
        if (todayRec.denier) extraParts.push(`${todayRec.denier}D`);
        if (todayRec.type) extraParts.push(todayRec.type);
        if (todayRec.color) extraParts.push(todayRec.color);
        const extraEl = $('#stk-recorded-extra');
        if (extraEl) extraEl.textContent = extraParts.length ? extraParts.join(' · ') : '';
    } else {
        // 未记录
        if (formEl) formEl.classList.remove('hidden');
        if (recordedEl) recordedEl.classList.add('hidden');
        if (cardEl) cardEl.classList.remove('recorded');
    }

    // 更新收藏柜下拉选单
    stkUpdateClosetSelect();

    // 渲染排行榜
    stkRenderRanking();

    // 渲染最近记录
    stkRenderHistory();
}

function stkRenderRanking() {
    const container = $('#stk-ranking-list');
    if (!container) return;

    const ranking = stkGetRanking();

    if (ranking.length === 0) {
        container.innerHTML = '<div class="stk-ranking__empty">还没有记录呢~快穿上丝袜记录吧，骚货♠</div>';
        return;
    }

    container.innerHTML = ranking.map((item, i) => {
        const medalIcons = ['👑', '🥈', '🥉'];
        const rankDisplay = i < 3 ? medalIcons[i] : (i + 1);
        const extraParts = [];
        if (item.denier) extraParts.push(`${item.denier}D`);
        if (item.type) extraParts.push(item.type);
        if (item.color) extraParts.push(item.color);
        const extraHtml = extraParts.length ? `<div class="stk-ranking__item-extra">${extraParts.join(' · ')}</div>` : '';
        return `
        <div class="stk-ranking__item">
            <div class="stk-ranking__rank">${rankDisplay}</div>
            <div class="stk-ranking__item-info">
                <div class="stk-ranking__item-brand">${item.brand}</div>
                <div class="stk-ranking__item-model">${item.model}</div>
                ${extraHtml}
            </div>
            <div class="stk-ranking__item-count">${item.count}<span class="stk-ranking__item-unit">次</span></div>
        </div>`;
    }).join('');
}

function stkRenderHistory() {
    const container = $('#stk-history-list');
    if (!container) return;

    // 最近20条记录，按日期倒序
    const recent = [...stkState.records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

    if (recent.length === 0) {
        container.innerHTML = '<div class="stk-history__empty">还没有穿着记录~乖女孩快穿上丝袜吧♠</div>';
        return;
    }

    container.innerHTML = recent.map((r) => {
        const extraParts = [];
        if (r.denier) extraParts.push(`${r.denier}D`);
        if (r.type) extraParts.push(r.type);
        if (r.color) extraParts.push(r.color);
        const extraHtml = extraParts.length ? `<div class="stk-history__item-extra">${extraParts.join(' · ')}</div>` : '';
        return `
        <div class="stk-history__item">
            <div class="stk-history__item-date">${stkFormatDate(r.date)}</div>
            <div class="stk-history__item-info">
                <div class="stk-history__item-brand">${r.brand}</div>
                <div class="stk-history__item-model">${r.model}</div>
                ${extraHtml}
            </div>
        </div>`;
    }).join('');
}

/**
 * 更新丝袜日记中的收藏柜下拉选单
 * 从 closetState.items 中筛选 pantyhose 类别，按 brand+model 分组
 */
function stkUpdateClosetSelect() {
    const select = $('#stk-closet-select');
    if (!select) return;

    // 只取 pantyhose 类别
    const phItems = closetState.items.filter((i) => i.category === 'pantyhose');

    // 按 brand+model 分组（去重）
    const groupMap = {};
    phItems.forEach((item) => {
        const key = `${item.brand}|||${item.model}`;
        if (!groupMap[key]) {
            groupMap[key] = {
                brand: item.brand,
                model: item.model,
                denier: item.denier || 0,
                type: item.type || '',
                items: []
            };
        }
        groupMap[key].items.push(item);
    });

    const groups = Object.values(groupMap);

    if (groups.length === 0) {
        select.innerHTML = '<option value="">收藏柜是空的~先去添加丝袜吧♠</option>';
        return;
    }

    select.innerHTML = '<option value="">请选择丝袜...</option>' +
        groups.map((g) => {
            // 用第一个 item 的 id 作为 value（后续通过 id 找到具体 item）
            const firstId = g.items[0].id;
            const denierStr = g.denier ? ` ${g.denier}D` : '';
            const typeStr = g.type ? ` · ${g.type}` : '';
            const colorCount = new Set(g.items.filter(i => i.color).map(i => i.color)).size;
            const colorHint = colorCount > 0 ? ` (${colorCount}色)` : '';
            return `<option value="${firstId}">${g.brand} — ${g.model}${denierStr}${typeStr}${colorHint}</option>`;
        }).join('');
}

/**
 * 当选择丝袜后，更新颜色下拉选单
 */
function stkOnClosetSelectChange() {
    const closetSelect = $('#stk-closet-select');
    const colorSelect = $('#stk-color-select');
    const previewEl = $('#stk-selected-preview');
    const previewInfo = $('#stk-preview-info');
    if (!closetSelect || !colorSelect) return;

    const selectedId = closetSelect.value;
    if (!selectedId) {
        colorSelect.innerHTML = '<option value="">请先选择丝袜...</option>';
        if (previewEl) previewEl.classList.add('hidden');
        return;
    }

    // 找到选中的 item，然后找到同 brand+model 的所有 items
    const selectedItem = closetState.items.find((i) => i.id === selectedId);
    if (!selectedItem) return;

    const sameGroup = closetState.items.filter(
        (i) => i.brand === selectedItem.brand && i.model === selectedItem.model && i.category === 'pantyhose'
    );

    // 收集所有颜色
    const colors = new Set();
    sameGroup.forEach((i) => {
        if (i.color) colors.add(i.color);
    });

    if (colors.size === 0) {
        colorSelect.innerHTML = '<option value="">无颜色信息</option>';
    } else {
        colorSelect.innerHTML = '<option value="">请选择颜色...</option>' +
            [...colors].map((c) => `<option value="${c}">${c}</option>`).join('');
    }

    // 显示预览
    if (previewEl && previewInfo) {
        const parts = [selectedItem.brand, selectedItem.model];
        if (selectedItem.denier) parts.push(`${selectedItem.denier}D`);
        if (selectedItem.type) parts.push(selectedItem.type);
        previewInfo.textContent = parts.join(' · ');
        previewEl.classList.remove('hidden');
    }
}

function initStockingsDiary() {
    return stkLoadData().then(() => {
    // 绑定记录按钮
    $('#btn-stk-record')?.addEventListener('click', stkRecord);

    // 绑定收藏柜选择联动
    $('#stk-closet-select')?.addEventListener('change', stkOnClosetSelectChange);

    // 初始渲染
    stkUpdateUI();
    });
}

/* ============================================
 * MODULE 6B: LEOTARD DIARY (连体衣日记)
 * ============================================ */
const LEO_STORAGE_KEY = 'sissy_leotard_diary';

const leoState = {
    records: [],  // [{ date: 'YYYY-MM-DD', brand: '', model: '', type: '', color: '' }]
};

async function leoLoadData() {
    try {
        const idbData = await appDBGet(LEO_STORAGE_KEY);
        if (idbData) { leoState.records = idbData.records || []; return; }
        const raw = localStorage.getItem(LEO_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            leoState.records = data.records || [];
        }
    } catch (e) { leoState.records = []; }
}

function leoSaveData() {
    const payload = { records: leoState.records };
    try { localStorage.setItem(LEO_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    appDBSet(LEO_STORAGE_KEY, payload);
}

function leoGetTodayRecord() {
    const todayKey = stkGetTodayKey();
    return leoState.records.find((r) => r.date === todayKey);
}

function leoRecord() {
    const closetSelect = $('#leo-closet-select');
    const colorSelect = $('#leo-color-select');
    const closetId = closetSelect ? closetSelect.value : '';
    const selectedColor = colorSelect ? colorSelect.value : '';

    if (!closetId) {
        alert('请先从收藏柜选择一件连体衣哦~乖女孩要记清楚穿的什么♠');
        return;
    }
    if (!selectedColor) {
        alert('请选择颜色哦~主人要知道你穿的是哪一件♠');
        return;
    }

    const todayKey = stkGetTodayKey();
    if (leoGetTodayRecord()) {
        alert('今天已经记录过了~乖女孩每天只能记录一次♠');
        return;
    }

    const closetItem = closetState.items.find((i) => i.id === closetId);
    if (!closetItem) {
        alert('选择的连体衣不存在，请重新选择~');
        return;
    }

    leoState.records.push({
        date: todayKey,
        brand: closetItem.brand,
        model: closetItem.model,
        type: closetItem.type || '',
        color: selectedColor
    });
    leoSaveData();

    if (navigator.vibrate) navigator.vibrate(50);

    if (closetSelect) closetSelect.value = '';
    if (colorSelect) colorSelect.innerHTML = '<option value="">请先选择连体衣...</option>';
    const previewEl = $('#leo-selected-preview');
    if (previewEl) previewEl.classList.add('hidden');

    leoUpdateUI();
}

function leoUpdateUI() {
    const todayDate = new Date();
    const dateStr = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`;

    const dateEl = $('#leo-today-date');
    if (dateEl) dateEl.textContent = dateStr;

    const todayRec = leoGetTodayRecord();
    const formEl = $('#leo-form');
    const recordedEl = $('#leo-recorded');
    const cardEl = $('#leo-today-card');

    if (todayRec) {
        if (formEl) formEl.classList.add('hidden');
        if (recordedEl) recordedEl.classList.remove('hidden');
        if (cardEl) cardEl.classList.add('recorded');
        $('#leo-recorded-brand').textContent = todayRec.brand;
        $('#leo-recorded-model').textContent = todayRec.model;
        const extraParts = [];
        if (todayRec.type) extraParts.push(todayRec.type);
        if (todayRec.color) extraParts.push(todayRec.color);
        const extraEl = $('#leo-recorded-extra');
        if (extraEl) extraEl.textContent = extraParts.length ? extraParts.join(' · ') : '';
    } else {
        if (formEl) formEl.classList.remove('hidden');
        if (recordedEl) recordedEl.classList.add('hidden');
        if (cardEl) cardEl.classList.remove('recorded');
    }

    leoUpdateClosetSelect();
}

/**
 * 更新连体衣日记中的收藏柜下拉选单
 * 从 closetState.items 中筛选 leotard 类别
 */
function leoUpdateClosetSelect() {
    const select = $('#leo-closet-select');
    if (!select) return;

    const leoItems = closetState.items.filter((i) => i.category === 'leotard');

    const groupMap = {};
    leoItems.forEach((item) => {
        const key = `${item.brand}|||${item.model}`;
        if (!groupMap[key]) {
            groupMap[key] = {
                brand: item.brand,
                model: item.model,
                type: item.type || '',
                items: []
            };
        }
        groupMap[key].items.push(item);
    });

    const groups = Object.values(groupMap);

    if (groups.length === 0) {
        select.innerHTML = '<option value="">连体衣柜是空的~先去添加连体衣吧♠</option>';
        return;
    }

    select.innerHTML = '<option value="">请选择连体衣...</option>' +
        groups.map((g) => {
            const firstId = g.items[0].id;
            const typeStr = g.type ? ` · ${g.type}` : '';
            const colorCount = new Set(g.items.filter(i => i.color).map(i => i.color)).size;
            const colorHint = colorCount > 0 ? ` (${colorCount}色)` : '';
            return `<option value="${firstId}">${g.brand} — ${g.model}${typeStr}${colorHint}</option>`;
        }).join('');
}

function leoOnClosetSelectChange() {
    const closetSelect = $('#leo-closet-select');
    const colorSelect = $('#leo-color-select');
    const previewEl = $('#leo-selected-preview');
    const previewInfo = $('#leo-preview-info');
    if (!closetSelect || !colorSelect) return;

    const selectedId = closetSelect.value;
    if (!selectedId) {
        colorSelect.innerHTML = '<option value="">请先选择连体衣...</option>';
        if (previewEl) previewEl.classList.add('hidden');
        return;
    }

    const selectedItem = closetState.items.find((i) => i.id === selectedId);
    if (!selectedItem) return;

    const sameGroup = closetState.items.filter(
        (i) => i.brand === selectedItem.brand && i.model === selectedItem.model && i.category === 'leotard'
    );

    const colors = new Set();
    sameGroup.forEach((i) => { if (i.color) colors.add(i.color); });

    if (colors.size === 0) {
        colorSelect.innerHTML = '<option value="">无颜色信息</option>';
    } else {
        colorSelect.innerHTML = '<option value="">请选择颜色...</option>' +
            [...colors].map((c) => `<option value="${c}">${c}</option>`).join('');
    }

    if (previewEl && previewInfo) {
        const parts = [selectedItem.brand, selectedItem.model];
        if (selectedItem.type) parts.push(selectedItem.type);
        previewInfo.textContent = parts.join(' · ');
        previewEl.classList.remove('hidden');
    }
}

function initLeotardDiary() {
    return leoLoadData().then(() => {
        $('#btn-leo-record')?.addEventListener('click', leoRecord);
        $('#leo-closet-select')?.addEventListener('change', leoOnClosetSelectChange);
        leoUpdateUI();
    });
}

/* ============================================
 * MODULE 7: BRAND MANAGER (品牌管理)
 * ============================================ */
const BRAND_STORAGE_KEY = 'sissy_brand_list';

const brandState = {
    brands: []  // ['Wolford', 'Atsugi', ...]
};

async function brandLoad() {
    try {
        // 优先从 IndexedDB 读取
        const idbData = await appDBGet(BRAND_STORAGE_KEY);
        if (idbData) { brandState.brands = idbData || []; return; }
        // 兼容：从 localStorage 读取
        const raw = localStorage.getItem(BRAND_STORAGE_KEY);
        if (raw) {
            brandState.brands = JSON.parse(raw) || [];
        }
    } catch (e) { brandState.brands = []; }
}

function brandSave() {
    try { localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brandState.brands)); } catch (e) {}
    appDBSet(BRAND_STORAGE_KEY, brandState.brands);
}

function brandAdd() {
    const input = $('#brand-input');
    const name = (input?.value || '').trim();
    if (!name) {
        alert('品牌名不能为空哦~♠');
        return;
    }
    if (brandState.brands.includes(name)) {
        alert('这个品牌已经添加过了~♠');
        return;
    }
    brandState.brands.push(name);
    brandSave();
    if (input) input.value = '';
    brandRenderList();
    // 更新所有使用品牌列表的 datalist
    brandUpdateAllDataLists();
}

function brandRemove(name) {
    brandState.brands = brandState.brands.filter((b) => b !== name);
    brandSave();
    brandRenderList();
    brandUpdateAllDataLists();
}

function brandRenderList() {
    const container = $('#brand-list');
    if (!container) return;

    if (brandState.brands.length === 0) {
        container.innerHTML = '<div class="brand-empty">还没有添加品牌哦~快加几个常用的吧♠</div>';
        return;
    }

    container.innerHTML = brandState.brands.map((b) => {
        return `<div class="brand-tag">
            <span>${b}</span>
            <button class="brand-tag__remove" onclick="brandRemove('${b.replace(/'/g, "\\'")}')">✕</button>
        </div>`;
    }).join('');
}

function brandGetAll() {
    // 合并品牌管理中的品牌和历史记录中的品牌
    const allBrands = new Set(brandState.brands);
    stkState.records.forEach((r) => allBrands.add(r.brand));
    return [...allBrands];
}

function brandUpdateAllDataLists() {
    const brands = brandGetAll();
    const options = brands.map((b) => `<option value="${b}">`).join('');

    // 更新丝袜日记的品牌列表
    const stkBrandList = $('#stk-brand-list');
    if (stkBrandList) stkBrandList.innerHTML = options;

    // 更新愿望清单的品牌列表
    const wishBrandList = $('#wish-brand-list');
    if (wishBrandList) wishBrandList.innerHTML = options;

    // 更新收藏柜的品牌列表
    const closetBrandList = $('#closet-brand-list');
    if (closetBrandList) closetBrandList.innerHTML = options;

    // 更新连体衣衣柜的品牌列表
    const closetLeoBrandList = $('#closet-leo-brand-list');
    if (closetLeoBrandList) closetLeoBrandList.innerHTML = options;
}

function initBrandManager() {
    return brandLoad().then(() => {
    brandRenderList();

    // 绑定添加按钮
    $('#btn-add-brand')?.addEventListener('click', brandAdd);

    // 回车添加
    $('#brand-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') brandAdd();
    });
    });
}

/* ============================================
 * MODULE 8: WISHLIST (愿望清单)
 * ============================================ */
const WISH_STORAGE_KEY = 'sissy_wishlist';

const wishState = {
    items: []  // [{ id, brand, model, price, purchased }]
};

async function wishLoad() {
    try {
        // 优先从 IndexedDB 读取
        const idbData = await appDBGet(WISH_STORAGE_KEY);
        if (idbData) { wishState.items = idbData.items || []; return; }
        // 兼容：从 localStorage 读取
        const raw = localStorage.getItem(WISH_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            wishState.items = data.items || [];
        }
    } catch (e) { wishState.items = []; }
}

function wishSave() {
    const payload = { items: wishState.items };
    try { localStorage.setItem(WISH_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    appDBSet(WISH_STORAGE_KEY, payload);
}

function wishGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function wishAdd() {
    const brand = ($('#wish-brand')?.value || '').trim();
    const model = ($('#wish-model')?.value || '').trim();
    const priceStr = ($('#wish-price')?.value || '').trim();
    const denierStr = ($('#wish-denier')?.value || '').trim();
    const wishType = ($('#wish-type')?.value || '').trim();
    const color = ($('#wish-color')?.value || '').trim();

    if (!brand) {
        alert('品牌不能为空哦~♠');
        return;
    }
    if (!model) {
        alert('商品型号不能为空哦~♠');
        return;
    }

    const price = priceStr ? parseFloat(priceStr) : 0;
    const denier = denierStr ? parseInt(denierStr) : 0;

    wishState.items.push({
        id: wishGenId(),
        brand,
        model,
        denier,
        type: wishType,
        color,
        price,
        purchased: false
    });
    wishSave();

    // 清空输入
    if ($('#wish-brand')) $('#wish-brand').value = '';
    if ($('#wish-model')) $('#wish-model').value = '';
    if ($('#wish-denier')) $('#wish-denier').value = '';
    if ($('#wish-type')) $('#wish-type').value = '';
    if ($('#wish-color')) $('#wish-color').value = '';
    if ($('#wish-price')) $('#wish-price').value = '';

    if (navigator.vibrate) navigator.vibrate(50);
    wishRenderList();
}

function wishTogglePurchased(id) {
    const item = wishState.items.find((i) => i.id === id);
    if (item) {
        item.purchased = !item.purchased;
        wishSave();
        wishRenderList();
    }
}

function wishDelete(id) {
    wishState.items = wishState.items.filter((i) => i.id !== id);
    wishSave();
    wishRenderList();
}

function wishRenderList() {
    const container = $('#wish-list');
    if (!container) return;

    if (wishState.items.length === 0) {
        container.innerHTML = '<div class="wish-list__empty">还没有心愿呢~想要什么就大胆加进来吧，骚货♠</div>';
        return;
    }

    // 未购买的排前面
    const sorted = [...wishState.items].sort((a, b) => {
        if (a.purchased !== b.purchased) return a.purchased ? 1 : -1;
        return 0;
    });

    container.innerHTML = sorted.map((item) => {
        const priceDisplay = item.price > 0 ? `¥${item.price.toFixed(2)}` : '';
        const extraParts = [];
        if (item.denier) extraParts.push(`${item.denier}D`);
        if (item.type) extraParts.push(item.type);
        if (item.color) extraParts.push(item.color);
        const extraHtml = extraParts.length ? `<div class="wish-item__extra">${extraParts.join(' · ')}</div>` : '';
        return `
        <div class="wish-item ${item.purchased ? 'purchased' : ''}">
            <div class="wish-item__info">
                <div class="wish-item__brand">${item.brand}</div>
                <div class="wish-item__model">${item.model}</div>
                ${extraHtml}
            </div>
            ${priceDisplay ? `<div class="wish-item__price">${priceDisplay}</div>` : ''}
            <button class="wish-item__toggle ${item.purchased ? 'active' : ''}" onclick="wishTogglePurchased('${item.id}')" title="${item.purchased ? '标记为未购买' : '标记为已购买'}"></button>
            <button class="wish-item__delete" onclick="wishDelete('${item.id}')" title="删除">✕</button>
        </div>`;
    }).join('');
}

function initWishlist() {
    return wishLoad().then(() => {
    // 绑定添加按钮
    $('#btn-wish-add')?.addEventListener('click', wishAdd);

    // 初始渲染
    wishRenderList();

    // 更新品牌 datalist
    brandUpdateAllDataLists();
    });
}

/* ============================================
 * MODULE 9: CLOSET / BOUDOIR (收藏柜 - 双衣柜)
 * ============================================ */
const CLOSET_STORAGE_KEY = 'sissy_closet';

const closetState = {
    items: [],  // [{ id, category, brand, model, denier, type, color, note }]  category: 'pantyhose' | 'leotard'
    activeTab: 'pantyhose'
};

async function closetLoad() {
    try {
        // 优先从 IndexedDB 读取
        const idbData = await appDBGet(CLOSET_STORAGE_KEY);
        if (idbData) { closetState.items = idbData.items || []; }
        else {
            // 兼容：从 localStorage 读取
            const raw = localStorage.getItem(CLOSET_STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                closetState.items = data.items || [];
            }
        }
        // 兼容旧数据：没有 category 的默认为 pantyhose
        closetState.items.forEach((item) => {
            if (!item.category) item.category = 'pantyhose';
        });
    } catch (e) { closetState.items = []; }
}

function closetSave() {
    const payload = { items: closetState.items };
    try { localStorage.setItem(CLOSET_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    appDBSet(CLOSET_STORAGE_KEY, payload);
}

function closetGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function closetAdd(category) {
    let prefix;
    if (category === 'leotard') prefix = 'closet-leo';
    else if (category === 'plug') prefix = 'closet-plug';
    else prefix = 'closet-ph';
    const brand = ($(`#${prefix}-brand`)?.value || '').trim();
    const model = ($(`#${prefix}-model`)?.value || '').trim();
    const denierEl = $(`#${prefix}-denier`);
    const denierStr = denierEl ? (denierEl.value || '').trim() : '';
    const closetType = ($(`#${prefix}-type`)?.value || '').trim();
    const color = ($(`#${prefix}-color`)?.value || '').trim();
    const note = ($(`#${prefix}-note`)?.value || '').trim();

    if (!brand) {
        alert('品牌不能为空哦~♠');
        return;
    }
    if (!model) {
        alert('商品型号不能为空哦~♠');
        return;
    }

    const denier = denierStr ? parseInt(denierStr) : 0;

    closetState.items.push({
        id: closetGenId(),
        category: category,
        brand,
        model,
        denier,
        type: closetType,
        color,
        note
    });
    closetSave();

    // 清空输入
    if ($(`#${prefix}-brand`)) $(`#${prefix}-brand`).value = '';
    if ($(`#${prefix}-model`)) $(`#${prefix}-model`).value = '';
    if (denierEl) denierEl.value = '';
    if ($(`#${prefix}-type`)) $(`#${prefix}-type`).value = '';
    if ($(`#${prefix}-color`)) $(`#${prefix}-color`).value = '';
    if ($(`#${prefix}-note`)) $(`#${prefix}-note`).value = '';

    if (navigator.vibrate) navigator.vibrate(50);
    closetRenderList(category);
    // 同步更新日记的收藏柜下拉选单
    if (typeof stkUpdateClosetSelect === 'function') stkUpdateClosetSelect();
    if (typeof leoUpdateClosetSelect === 'function') leoUpdateClosetSelect();
    // 同步更新 Wear Tracker 的 Plug 尺寸选择
    if (typeof plugUpdateSizeSelect === 'function') plugUpdateSizeSelect();
}

function closetDelete(id) {
    const item = closetState.items.find((i) => i.id === id);
    const category = item ? item.category : 'pantyhose';
    closetState.items = closetState.items.filter((i) => i.id !== id);
    closetSave();
    closetRenderList(category);
    // 同步更新日记的收藏柜下拉选单
    if (typeof stkUpdateClosetSelect === 'function') stkUpdateClosetSelect();
    if (typeof leoUpdateClosetSelect === 'function') leoUpdateClosetSelect();
    // 同步更新 Wear Tracker 的 Plug 尺寸选择
    if (typeof plugUpdateSizeSelect === 'function') plugUpdateSizeSelect();
}

function closetRenderList(category) {
    if (!category) category = closetState.activeTab;
    let containerId;
    if (category === 'leotard') containerId = 'closet-leo-list';
    else if (category === 'plug') containerId = 'closet-plug-list';
    else containerId = 'closet-ph-list';
    const container = $(`#${containerId}`);
    if (!container) return;

    const items = closetState.items.filter((i) => i.category === category);
    let unitLabel = '双';
    if (category === 'leotard') unitLabel = '件';
    else if (category === 'plug') unitLabel = '个';

    if (items.length === 0) {
        let emptyMsg = '丝袜柜还是空的~快把宝贝们收进来吧♠';
        if (category === 'leotard') emptyMsg = '连体衣柜还是空的~快把宝贝们收进来吧♠';
        else if (category === 'plug') emptyMsg = 'Plug 柜还是空的~快把宝贝们收进来吧♠';
        container.innerHTML = `<div class="closet-list__empty">${emptyMsg}</div>`;
        return;
    }

    // 按 brand+model 分组
    const groupMap = {};
    items.forEach((item) => {
        const key = `${item.brand}|||${item.model}`;
        if (!groupMap[key]) {
            groupMap[key] = {
                brand: item.brand,
                model: item.model,
                denier: item.denier || 0,
                type: item.type || '',
                items: []
            };
        }
        groupMap[key].items.push(item);
    });

    const groups = Object.values(groupMap);

    container.innerHTML = groups.map((g, gi) => {
        // 统计颜色和数量
        const colorCountMap = {};
        g.items.forEach((item) => {
            const c = item.color || '';
            if (!colorCountMap[c]) colorCountMap[c] = [];
            colorCountMap[c].push(item);
        });
        const totalCount = g.items.length;
        const colorEntries = Object.entries(colorCountMap);
        const colorSummary = colorEntries.map(([c, arr]) => {
            const label = c || '无色';
            return `${label}×${arr.length}`;
        }).join('、');

        const extraParts = [];
        if (g.denier) extraParts.push(`${g.denier}D`);
        if (g.type) extraParts.push(g.type);
        const extraStr = extraParts.length ? extraParts.join(' · ') : '';

        // 详细面板中每个颜色的条目
        const detailHtml = colorEntries.map(([color, arr]) => {
            const itemRows = arr.map((item) => {
                // 只在有备注时才显示条目行，否则不渲染空行
                if (!item.note) {
                    return `<div class="closet-detail__item closet-detail__item--compact">
                        <div class="closet-detail__item-actions">
                            <button class="closet-detail__item-edit" onclick="closetEditColor('${item.id}')" title="修改颜色">✎</button>
                            <button class="closet-detail__item-delete" onclick="closetDelete('${item.id}')" title="删除">✕</button>
                        </div>
                    </div>`;
                }
                return `<div class="closet-detail__item">
                    <span class="closet-detail__item-label"><span class="closet-detail__note">${item.note}</span></span>
                    <div class="closet-detail__item-actions">
                        <button class="closet-detail__item-edit" onclick="closetEditColor('${item.id}')" title="修改颜色">✎</button>
                        <button class="closet-detail__item-delete" onclick="closetDelete('${item.id}')" title="删除">✕</button>
                    </div>
                </div>`;
            }).join('');
            const colorLabel = color || '无颜色';
            return `<div class="closet-detail__color-group">
                <div class="closet-detail__color-header">
                    <span class="closet-detail__color-dot" style="background:${closetGetCSSColor(color)};"></span>
                    <span class="closet-detail__color-name">${colorLabel}</span>
                    <span class="closet-detail__color-count">×${arr.length}</span>
                </div>
                ${itemRows}
            </div>`;
        }).join('');

        // 新增颜色按钮（使用第一个 item 的 brand+model 信息来定位分组）
        const firstItemId = g.items[0].id;
        const addColorBtn = `<div class="closet-detail__add-color">
            <button class="closet-detail__add-color-btn" onclick="closetAddColorToGroup('${firstItemId}', '${category}')" title="新增颜色">+ 新增颜色</button>
        </div>`;

        const groupKey = `${category}_cg_${gi}`;

        return `
        <div class="closet-group" data-group-key="${groupKey}">
            <div class="closet-group__header" onclick="closetToggleGroup('${groupKey}')">
                <div class="closet-group__info">
                    <div class="closet-group__brand">${g.brand}</div>
                    <div class="closet-group__model">${g.model}</div>
                    ${extraStr ? `<div class="closet-group__extra">${extraStr}</div>` : ''}
                </div>
                <div class="closet-group__meta">
                    <div class="closet-group__colors">${colorSummary}</div>
                    <div class="closet-group__count">${totalCount}<span class="closet-group__count-unit">${unitLabel}</span></div>
                </div>
                <div class="closet-group__arrow">›</div>
            </div>
            <div class="closet-group__detail hidden" id="closet-detail-${groupKey}">
                ${detailHtml}
                ${addColorBtn}
            </div>
        </div>`;
    }).join('');
}

/**
 * 根据颜色名返回 CSS 颜色值（用于小圆点）
 */
function closetGetCSSColor(colorName) {
    const colorMap = {
        '黑色': '#333', '肤色': '#e8c4a0', '白色': '#f5f5f5',
        '灰色': '#999', '咖啡色': '#6f4e37', '棕色': '#8b4513',
        '红色': '#e74c3c', '粉色': '#f8a5c2', '紫色': '#9b59b6',
        '蓝色': '#3498db', '深蓝': '#2c3e50', '绿色': '#27ae60',
        '米色': '#f5e6cc', '裸色': '#e8c4a0', '透明': 'rgba(255,255,255,0.3)',
    '未指定': 'rgba(217,70,239,0.3)',
    '无颜色': 'rgba(217,70,239,0.3)',
    '': 'rgba(217,70,239,0.3)'
    };
    return colorMap[colorName] || 'var(--accent)';
}

/**
 * 修改指定收藏条目的颜色
 */
function closetEditColor(itemId) {
    const item = closetState.items.find((i) => i.id === itemId);
    if (!item) return;
    const currentColor = item.color || '';
    const newColor = prompt(`修改颜色（当前：${currentColor || '无'}）`, currentColor);
    if (newColor === null) return; // 用户取消
    item.color = newColor.trim();
    closetSave();
    closetRenderList(item.category);
    // 同步更新日记的收藏柜下拉选单
    if (typeof stkUpdateClosetSelect === 'function') stkUpdateClosetSelect();
    if (typeof leoUpdateClosetSelect === 'function') leoUpdateClosetSelect();
}

/**
 * 给指定分组新增一个颜色条目（复制 brand/model/denier/type，只需输入新颜色）
 */
function closetAddColorToGroup(refItemId, category) {
    const refItem = closetState.items.find((i) => i.id === refItemId);
    if (!refItem) return;
    const newColor = prompt(`为 ${refItem.brand} ${refItem.model} 新增颜色：`, '');
    if (newColor === null) return; // 用户取消
    const trimmed = newColor.trim();
    if (!trimmed) {
        alert('颜色不能为空哦~♠');
        return;
    }
    const note = prompt('备注（可选，如尺码等）：', '') || '';
    closetState.items.push({
        id: closetGenId(),
        category: category || refItem.category,
        brand: refItem.brand,
        model: refItem.model,
        denier: refItem.denier || 0,
        type: refItem.type || '',
        color: trimmed,
        note: note.trim()
    });
    closetSave();
    if (navigator.vibrate) navigator.vibrate(50);
    closetRenderList(category || refItem.category);
    // 同步更新日记的收藏柜下拉选单
    if (typeof stkUpdateClosetSelect === 'function') stkUpdateClosetSelect();
    if (typeof leoUpdateClosetSelect === 'function') leoUpdateClosetSelect();
}

/**
 * 展开/收起收藏柜分组详情
 */
function closetToggleGroup(groupKey) {
    const detail = $(`#closet-detail-${groupKey}`);
    if (!detail) return;
    detail.classList.toggle('hidden');
    // 切换箭头方向
    const group = detail.closest('.closet-group');
    if (group) group.classList.toggle('expanded');
}

function initCloset() {
    return closetLoad().then(() => {
    // 绑定添加按钮（三衣柜）
    $('#btn-closet-ph-add')?.addEventListener('click', () => closetAdd('pantyhose'));
    $('#btn-closet-leo-add')?.addEventListener('click', () => closetAdd('leotard'));
    $('#btn-closet-plug-add')?.addEventListener('click', () => closetAdd('plug'));

    // 衣柜子页签切换
    document.querySelectorAll('.closet-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.closetTab;
            closetState.activeTab = targetTab;
            // 切换 tab 按钮高亮
            document.querySelectorAll('.closet-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            // 切换内容面板
            document.querySelectorAll('.closet-tab-content').forEach((c) => c.classList.remove('active'));
            const targetPanel = $(`#closet-${targetTab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // 初始渲染三个衣柜
    closetRenderList('pantyhose');
    closetRenderList('leotard');
    closetRenderList('plug');

    // 更新品牌 datalist
    brandUpdateAllDataLists();
    });
}

/* ============================================
 * MODULE 10.5: RANDOM DRAW (随机抽取)
 * 随机抽取 Cage/Plug 佩戴时间和 Plug 尺寸
 * ============================================ */
const RANDOM_STORAGE_KEY = 'sissy_random_draw';
const RANDOM_SETTINGS_KEY = 'sissy_random_settings';

const randomState = {
    history: [],  // { date, cageHours, plugHours, plugSize, timestamp }
    settings: {
        cageMin: 1,
        cageMax: 8,
        plugMin: 0.5,
        plugMax: 4
    }
};

async function randomLoadData() {
    try {
        let data = await appDBGet(RANDOM_STORAGE_KEY);
        if (!data) {
            const raw = localStorage.getItem(RANDOM_STORAGE_KEY);
            if (raw) data = JSON.parse(raw);
        }
        if (data && data.history) {
            randomState.history = data.history;
        }

        // 加载设置
        let settings = await appDBGet(RANDOM_SETTINGS_KEY);
        if (!settings) {
            const raw = localStorage.getItem(RANDOM_SETTINGS_KEY);
            if (raw) settings = JSON.parse(raw);
        }
        if (settings) {
            Object.assign(randomState.settings, settings);
        }
    } catch (e) {}
}

function randomSaveData() {
    const data = { history: randomState.history };
    try { localStorage.setItem(RANDOM_STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    appDBSet(RANDOM_STORAGE_KEY, data);
}

function randomSaveSettings() {
    try { localStorage.setItem(RANDOM_SETTINGS_KEY, JSON.stringify(randomState.settings)); } catch (e) {}
    appDBSet(RANDOM_SETTINGS_KEY, randomState.settings);
}

function randomFormatHours(hours) {
    if (hours < 1) {
        return `${Math.round(hours * 60)}分钟`;
    }
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}小时`;
    return `${h}小时${m}分钟`;
}

function randomDraw() {
    const s = randomState.settings;

    // 随机 Cage 时间
    const cageHours = +(s.cageMin + Math.random() * (s.cageMax - s.cageMin)).toFixed(1);

    // 随机 Plug 时间
    const plugHours = +(s.plugMin + Math.random() * (s.plugMax - s.plugMin)).toFixed(1);

    // 随机 Plug 尺寸（从 closet 中获取）
    const plugItems = closetState.items.filter((i) => i.category === 'plug');
    const sizes = [...new Set(plugItems.map((i) => i.type).filter(Boolean))];
    const plugSize = sizes.length > 0 ? sizes[Math.floor(Math.random() * sizes.length)] : '未配置';

    // 显示结果
    const resultCard = $('#random-result-card');
    if (resultCard) resultCard.classList.remove('hidden');

    const cageTimeEl = $('#random-cage-time');
    const plugTimeEl = $('#random-plug-time');
    const plugSizeEl = $('#random-plug-size');
    const hintEl = $('#random-result-hint');

    if (cageTimeEl) cageTimeEl.textContent = randomFormatHours(cageHours);
    if (plugTimeEl) plugTimeEl.textContent = randomFormatHours(plugHours);
    if (plugSizeEl) plugSizeEl.textContent = plugSize;

    // 生成调教风格的提示语
    const hints = [
        `乖女孩~今天要戴着 Cage ${randomFormatHours(cageHours)}，Plug ${randomFormatHours(plugHours)}哦♠`,
        `主人决定了~${plugSize} 的 Plug 塞好，Cage 锁紧，不许偷偷摘掉♠`,
        `今天的任务已经抽好了~乖乖执行，不许讨价还价♠`,
        `骚货~${randomFormatHours(plugHours)}的 Plug 和 ${randomFormatHours(cageHours)}的 Cage，享受吧♠`,
        `主人给你安排好了~快去 Wear Tracker 开始计时吧，乖女孩♠`
    ];
    if (hintEl) hintEl.textContent = hints[Math.floor(Math.random() * hints.length)];

    // 保存到历史
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    randomState.history.unshift({
        date: dateStr,
        cageHours,
        plugHours,
        plugSize,
        timestamp: Date.now()
    });
    // 只保留最近 30 条
    if (randomState.history.length > 30) randomState.history.length = 30;
    randomSaveData();

    if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50]);

    randomRenderHistory();
}

function randomRenderHistory() {
    const container = $('#random-history-list');
    if (!container) return;

    if (randomState.history.length === 0) {
        container.innerHTML = '<div class="random-history__empty">还没有抽取记录~快让主人决定你的命运吧♠</div>';
        return;
    }

    container.innerHTML = randomState.history.slice(0, 10).map((r) => {
        const dateStr = r.date;
        const time = new Date(r.timestamp);
        const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
        return `
        <div class="random-history__item">
            <div class="random-history__item-date">${dateStr} ${timeStr}</div>
            <div class="random-history__item-detail">
                <span>🔒 ${randomFormatHours(r.cageHours)}</span>
                <span>♠ ${randomFormatHours(r.plugHours)}</span>
                <span>📏 ${r.plugSize}</span>
            </div>
        </div>`;
    }).join('');
}

function randomLoadSettingsUI() {
    const s = randomState.settings;
    const cageMinEl = $('#setting-cage-min');
    const cageMaxEl = $('#setting-cage-max');
    const plugMinEl = $('#setting-plug-min');
    const plugMaxEl = $('#setting-plug-max');
    if (cageMinEl) cageMinEl.value = s.cageMin;
    if (cageMaxEl) cageMaxEl.value = s.cageMax;
    if (plugMinEl) plugMinEl.value = s.plugMin;
    if (plugMaxEl) plugMaxEl.value = s.plugMax;
}

function randomSaveSettingsFromUI() {
    const cageMin = parseFloat($('#setting-cage-min')?.value) || 1;
    const cageMax = parseFloat($('#setting-cage-max')?.value) || 8;
    const plugMin = parseFloat($('#setting-plug-min')?.value) || 0.5;
    const plugMax = parseFloat($('#setting-plug-max')?.value) || 4;

    randomState.settings.cageMin = Math.max(0.5, Math.min(24, cageMin));
    randomState.settings.cageMax = Math.max(randomState.settings.cageMin, Math.min(24, cageMax));
    randomState.settings.plugMin = Math.max(0.5, Math.min(24, plugMin));
    randomState.settings.plugMax = Math.max(randomState.settings.plugMin, Math.min(24, plugMax));

    randomSaveSettings();
    randomLoadSettingsUI();
    alert('设置已保存~♠');
}

function initRandomDraw() {
    return randomLoadData().then(() => {
        $('#btn-random-draw')?.addEventListener('click', randomDraw);
        $('#btn-save-random-settings')?.addEventListener('click', randomSaveSettingsFromUI);
        randomLoadSettingsUI();
        randomRenderHistory();
    });
}

/* ============================================
 * MODULE 10: OOTD (今日穿搭)
 * 从 Wear Tracker 和 Stockings Diary 读取数据，
 * 在剪影上展示今日穿搭状态。
 * ============================================ */

function ootdUpdateUI() {
    // 连体衣状态 — 从 Leotard Diary 读取
    const bodysuitEl = $('#ootd-status-bodysuit');
    const bodysuitDetailEl = $('#ootd-bodysuit-detail');
    const todayLeo = leoGetTodayRecord();
    if (bodysuitEl) {
        if (todayLeo) {
            const parts = [];
            if (todayLeo.color) parts.push(todayLeo.color);
            if (todayLeo.type) parts.push(todayLeo.type);
            bodysuitEl.textContent = parts.length ? parts.join(' ') : 'Recorded';
            bodysuitEl.classList.add('active');
        } else {
            bodysuitEl.textContent = '未记录';
            bodysuitEl.classList.remove('active');
        }
    }
    if (bodysuitDetailEl) {
        if (todayLeo) {
            const label = [];
            label.push(todayLeo.brand);
            if (todayLeo.model) label.push(todayLeo.model);
            bodysuitDetailEl.textContent = label.join(' ');
        } else {
            bodysuitDetailEl.textContent = '—';
        }
    }

    // Cage 状态 — 从 Wear Tracker 读取
    const cageEl = $('#ootd-status-cage');
    if (cageEl) {
        if (wearState.cage.isWearing) {
            cageEl.textContent = '佩戴中';
            cageEl.classList.add('active');
        } else if (wearState.cage.todaySessions.length > 0) {
            cageEl.textContent = wearFormatHours(wearState.cage.todayTotal);
            cageEl.classList.add('active');
        } else {
            cageEl.textContent = '未佩戴';
            cageEl.classList.remove('active');
        }
    }

    // 丝袜状态 — 从 Stockings Diary 读取
    const stockingsEl = $('#ootd-status-stockings');
    const stockingsDetailEl = $('#ootd-stockings-detail');
    const todayStk = stkGetTodayRecord();
    if (stockingsEl) {
        if (todayStk) {
            const parts = [];
            if (todayStk.color) parts.push(todayStk.color);
            if (todayStk.denier) parts.push(`${todayStk.denier}D`);
            stockingsEl.textContent = parts.length ? parts.join(' ') : '已记录';
            stockingsEl.classList.add('active');
        } else {
            stockingsEl.textContent = '未记录';
            stockingsEl.classList.remove('active');
        }
    }
    if (stockingsDetailEl) {
        if (todayStk) {
            const label = [];
            label.push(todayStk.brand);
            if (todayStk.model) label.push(todayStk.model);
            stockingsDetailEl.textContent = label.join(' ');
        } else {
            stockingsDetailEl.textContent = '—';
        }
    }

    // 高跟鞋状态 — 暂时固定提示（后续可扩展）
    const heelsEl = $('#ootd-status-heels');
    if (heelsEl) {
        heelsEl.textContent = '♠';
        heelsEl.classList.add('active');
    }
}

/* ============================================
 * INIT
 * ============================================ */
document.addEventListener('DOMContentLoaded', async () => {
    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 显示版本号
    const versionEl = $('#app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    // 先执行 localStorage → IndexedDB 数据迁移（仅首次）
    await migrateLocalStorageToIDB();

    // 同步初始化（不涉及异步数据加载）
    initTabs();
    initFitness();
    initCountdownTimer();

    // 异步初始化（需要从 IndexedDB 加载数据）
    // 品牌管理需要先加载，其他模块依赖品牌列表
    await initBrandManager();
    await Promise.all([
        initCalendar(),
        initMusicPlayer(),
        initWearTracker(),
        initStockingsDiary(),
        initLeotardDiary(),
        initWishlist(),
        initCloset(),
        initRandomDraw()
    ]);

    // 初始化完成后统一更新品牌 datalist
    brandUpdateAllDataLists();

    // 初始化数据管理（导出/导入按钮）
    initDataManager();

    // 初始化 OOTD 页面（依赖 Wear Tracker 和 Stockings Diary 数据）
    ootdUpdateUI();

    // 检测首次打开，提示导入数据
    checkFirstLaunchImport();
});
