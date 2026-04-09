/* ============================================
 * ♠ Mistress Stella's Sissy Hub ♠
 * PWA Core Logic — Fitness + Timer + Music
 * ============================================ */

const APP_VERSION = 'v1.7.0';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============================================
 * 音效系统 — 使用真实音频文件（PointyAux NSFW SFX Pack）
 * countdown-tick.wav : 湿润拍打声（倒数3秒提示）
 * phase-end.wav      : 强力喷射音效（阶段结束）
 * ============================================ */

// 预加载音频文件，避免播放延迟
const _sfx = {
    tick: null,
    end: null,
    _loaded: false
};

/**
 * 预加载所有音效文件。
 * 在页面加载时调用，将音频文件缓存到内存中。
 */
function preloadSFX() {
    if (_sfx._loaded) return;
    _sfx.tick = new Audio('sfx/countdown-tick.wav');
    _sfx.end = new Audio('sfx/phase-end.wav');
    // 预加载：让浏览器提前下载音频数据
    _sfx.tick.preload = 'auto';
    _sfx.end.preload = 'auto';
    _sfx.tick.load();
    _sfx.end.load();
    _sfx._loaded = true;
}

/**
 * 在用户手势中解锁音频播放（iOS Safari 等需要）。
 * 通过播放一个静音操作来解锁 HTMLAudioElement。
 */
let _audioUnlocked = false;
function unlockAudio() {
    if (_audioUnlocked) return;
    preloadSFX();
    // 尝试播放并立即暂停来解锁音频上下文
    const unlock = () => {
        if (_sfx.tick) {
            _sfx.tick.volume = 0;
            const p = _sfx.tick.play();
            if (p) p.then(() => {
                _sfx.tick.pause();
                _sfx.tick.currentTime = 0;
                _sfx.tick.volume = 1;
            }).catch(() => {});
        }
        _audioUnlocked = true;
    };
    unlock();
}

// 全局兜底：首次触摸/点击时解锁音频
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

/**
 * 播放指定音效（克隆方式，支持重叠播放）
 * @param {'tick'|'end'} name 音效名称
 */
function playSFX(name) {
    try {
        preloadSFX();
        const src = _sfx[name];
        if (!src) return;
        // 克隆一个新的 Audio 实例，允许同一音效重叠播放
        const clone = src.cloneNode();
        clone.volume = 1;
        clone.play().catch((e) => {
            console.warn('[SissyHub Audio] play failed:', e);
        });
    } catch (e) {
        console.warn('[SissyHub Audio] sfx error:', e);
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
function initTabs() {
    const moreOverlay = document.getElementById('more-menu-overlay');
    const btnMore = document.getElementById('btn-more-menu');

    // 底部 tab-bar 按钮点击（不含 More 按钮）
    $$('.tab-bar__item').forEach((btn) => {
        if (btn.id === 'btn-more-menu') return;
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            // 切换 tab 按钮高亮
            $$('.tab-bar__item').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            // 清除 more-menu 中的高亮
            $$('.more-menu__item').forEach((b) => b.classList.remove('active'));
            // 切换 tab 内容
            $$('.tab-content').forEach((t) => t.classList.remove('active'));
            const target = $(`#${tabId}`);
            if (target) target.classList.add('active');
        });
    });

    // More 按钮 → 打开/关闭弹出菜单
    if (btnMore) {
        btnMore.addEventListener('click', () => {
            moreOverlay.classList.toggle('active');
        });
    }

    // 点击遮罩关闭
    if (moreOverlay) {
        moreOverlay.addEventListener('click', (e) => {
            if (e.target === moreOverlay) {
                moreOverlay.classList.remove('active');
            }
        });
    }

    // More 菜单内的按钮点击
    $$('.more-menu__item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            // 清除底部 tab-bar 高亮，给 More 按钮加高亮
            $$('.tab-bar__item').forEach((b) => b.classList.remove('active'));
            if (btnMore) btnMore.classList.add('active');
            // 清除 more-menu 中其他高亮，给当前加高亮
            $$('.more-menu__item').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            // 切换 tab 内容
            $$('.tab-content').forEach((t) => t.classList.remove('active'));
            const target = $(`#${tabId}`);
            if (target) target.classList.add('active');
            // 关闭菜单
            moreOverlay.classList.remove('active');
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
}

function musicLoadMeta() {
    try {
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
            const cmp = a.name.localeCompare(b.name, 'zh-Hans');
            return musicState.sortAsc ? cmp : -cmp;
        });
    } else {
        tracks.sort((a, b) => {
            const cmp = (a.addedAt || 0) - (b.addedAt || 0);
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
    if (musicState._playingTrackId) {
        const sorted = musicGetSortedTracks();
        const newIdx = sorted.findIndex((t) => t.id === musicState._playingTrackId);
        if (newIdx >= 0) musicState.currentIndex = newIdx;
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
    // 加载持久化数据
    const hasData = musicLoadMeta();
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

function calLoadData() {
    try {
        const raw = localStorage.getItem(CAL_STORAGE_KEY);
        if (raw) calState.data = JSON.parse(raw);
    } catch (e) { calState.data = {}; }
}

function calSaveData() {
    try {
        localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(calState.data));
    } catch (e) {}
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
    calLoadData();

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

function wearLoadData() {
    try {
        const raw = localStorage.getItem(WEAR_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
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
            allTimeTotal: s.allTimeTotal,
            sessions: s.sessions,
            todayKey: todayKey,
            todayTotal: s.todayTotal,
            todaySessions: s.todaySessions
        };
    });
    try { localStorage.setItem(WEAR_STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
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
        state.todaySessions.push({
            start: state.startTime,
            end: Date.now(),
            duration: elapsed
        });

        state.isWearing = false;
        state.startTime = null;

        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    } else {
        // 开始佩戴
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
                duration: s.duration
            });
        });
    });

    // 按结束时间倒序
    allSessions.sort((a, b) => b.end - a.end);

    if (allSessions.length === 0) {
        container.innerHTML = '<div class="wear-history__empty">今天还没有记录哦~快戴上吧，骚货♠</div>';
        return;
    }

    container.innerHTML = allSessions.map((s) => {
        const startTime = new Date(s.start);
        const endTime = new Date(s.end);
        const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')} - ${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;
        return `
        <div class="wear-history__item">
            <div class="wear-history__item-icon">${s.icon}</div>
            <div class="wear-history__item-info">
                <div class="wear-history__item-type">${s.name}</div>
                <div class="wear-history__item-time">${timeStr}</div>
            </div>
            <div class="wear-history__item-duration">${wearFormatDuration(s.duration)}</div>
        </div>`;
    }).join('');
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
    wearLoadData();

    // 绑定按钮
    $('#btn-cage-toggle')?.addEventListener('click', () => wearToggle('cage'));
    $('#btn-plug-toggle')?.addEventListener('click', () => wearToggle('plug'));

    // 初始渲染
    wearUpdateUI();

    // 启动定时器
    wearStartTicker();
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

function stkLoadData() {
    try {
        const raw = localStorage.getItem(STK_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            stkState.records = data.records || [];
        }
    } catch (e) { stkState.records = []; }
}

function stkSaveData() {
    try {
        localStorage.setItem(STK_STORAGE_KEY, JSON.stringify({ records: stkState.records }));
    } catch (e) {}
}

function stkGetTodayRecord() {
    const todayKey = stkGetTodayKey();
    return stkState.records.find((r) => r.date === todayKey) || null;
}

function stkRecord() {
    const brand = ($('#stk-brand')?.value || '').trim();
    const model = ($('#stk-model')?.value || '').trim();

    if (!brand) {
        alert('品牌不能为空哦~乖女孩要记清楚穿的什么♠');
        return;
    }
    if (!model) {
        alert('型号不能为空哦~主人要知道你穿的是哪一款♠');
        return;
    }

    const todayKey = stkGetTodayKey();

    // 检查今天是否已记录
    if (stkGetTodayRecord()) {
        alert('今天已经记录过了~乖女孩每天只能记录一次♠');
        return;
    }

    stkState.records.push({ date: todayKey, brand, model });
    stkSaveData();

    if (navigator.vibrate) navigator.vibrate(50);

    // 清空输入
    if ($('#stk-brand')) $('#stk-brand').value = '';
    if ($('#stk-model')) $('#stk-model').value = '';

    stkUpdateUI();
}

function stkGetRanking() {
    // 按 brand + model 组合统计穿着次数
    const countMap = {};
    stkState.records.forEach((r) => {
        const key = `${r.brand}|||${r.model}`;
        if (!countMap[key]) {
            countMap[key] = { brand: r.brand, model: r.model, count: 0 };
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
    } else {
        // 未记录
        if (formEl) formEl.classList.remove('hidden');
        if (recordedEl) recordedEl.classList.add('hidden');
        if (cardEl) cardEl.classList.remove('recorded');
    }

    // 更新品牌建议列表（使用统一品牌管理）
    const brandList = $('#stk-brand-list');
    if (brandList) {
        brandList.innerHTML = brandGetAll()
            .map((b) => `<option value="${b}">`).join('');
    }
    const modelList = $('#stk-model-list');
    if (modelList) {
        modelList.innerHTML = stkGetModelSuggestions()
            .map((m) => `<option value="${m}">`).join('');
    }

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
        return `
        <div class="stk-ranking__item">
            <div class="stk-ranking__rank">${rankDisplay}</div>
            <div class="stk-ranking__item-info">
                <div class="stk-ranking__item-brand">${item.brand}</div>
                <div class="stk-ranking__item-model">${item.model}</div>
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
        return `
        <div class="stk-history__item">
            <div class="stk-history__item-date">${stkFormatDate(r.date)}</div>
            <div class="stk-history__item-info">
                <div class="stk-history__item-brand">${r.brand}</div>
                <div class="stk-history__item-model">${r.model}</div>
            </div>
        </div>`;
    }).join('');
}

function initStockingsDiary() {
    stkLoadData();

    // 绑定记录按钮
    $('#btn-stk-record')?.addEventListener('click', stkRecord);

    // 初始渲染
    stkUpdateUI();
}

/* ============================================
 * MODULE 7: BRAND MANAGER (品牌管理)
 * ============================================ */
const BRAND_STORAGE_KEY = 'sissy_brand_list';

const brandState = {
    brands: []  // ['Wolford', 'Atsugi', ...]
};

function brandLoad() {
    try {
        const raw = localStorage.getItem(BRAND_STORAGE_KEY);
        if (raw) {
            brandState.brands = JSON.parse(raw) || [];
        }
    } catch (e) { brandState.brands = []; }
}

function brandSave() {
    try {
        localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brandState.brands));
    } catch (e) {}
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
}

function initBrandManager() {
    brandLoad();
    brandRenderList();

    // 绑定添加按钮
    $('#btn-add-brand')?.addEventListener('click', brandAdd);

    // 回车添加
    $('#brand-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') brandAdd();
    });
}

/* ============================================
 * MODULE 8: WISHLIST (愿望清单)
 * ============================================ */
const WISH_STORAGE_KEY = 'sissy_wishlist';

const wishState = {
    items: []  // [{ id, brand, model, price, purchased }]
};

function wishLoad() {
    try {
        const raw = localStorage.getItem(WISH_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            wishState.items = data.items || [];
        }
    } catch (e) { wishState.items = []; }
}

function wishSave() {
    try {
        localStorage.setItem(WISH_STORAGE_KEY, JSON.stringify({ items: wishState.items }));
    } catch (e) {}
}

function wishGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function wishAdd() {
    const brand = ($('#wish-brand')?.value || '').trim();
    const model = ($('#wish-model')?.value || '').trim();
    const priceStr = ($('#wish-price')?.value || '').trim();

    if (!brand) {
        alert('品牌不能为空哦~♠');
        return;
    }
    if (!model) {
        alert('商品型号不能为空哦~♠');
        return;
    }

    const price = priceStr ? parseFloat(priceStr) : 0;

    wishState.items.push({
        id: wishGenId(),
        brand,
        model,
        price,
        purchased: false
    });
    wishSave();

    // 清空输入
    if ($('#wish-brand')) $('#wish-brand').value = '';
    if ($('#wish-model')) $('#wish-model').value = '';
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
        return `
        <div class="wish-item ${item.purchased ? 'purchased' : ''}">
            <div class="wish-item__info">
                <div class="wish-item__brand">${item.brand}</div>
                <div class="wish-item__model">${item.model}</div>
            </div>
            ${priceDisplay ? `<div class="wish-item__price">${priceDisplay}</div>` : ''}
            <button class="wish-item__toggle ${item.purchased ? 'active' : ''}" onclick="wishTogglePurchased('${item.id}')" title="${item.purchased ? '标记为未购买' : '标记为已购买'}"></button>
            <button class="wish-item__delete" onclick="wishDelete('${item.id}')" title="删除">✕</button>
        </div>`;
    }).join('');
}

function initWishlist() {
    wishLoad();

    // 绑定添加按钮
    $('#btn-wish-add')?.addEventListener('click', wishAdd);

    // 初始渲染
    wishRenderList();

    // 更新品牌 datalist
    brandUpdateAllDataLists();
}

/* ============================================
 * MODULE 9: CLOSET / BOUDOIR (收藏柜)
 * ============================================ */
const CLOSET_STORAGE_KEY = 'sissy_closet';

const closetState = {
    items: [],  // [{ id, type, brand, model, note }]
    filter: 'all'
};

function closetLoad() {
    try {
        const raw = localStorage.getItem(CLOSET_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            closetState.items = data.items || [];
        }
    } catch (e) { closetState.items = []; }
}

function closetSave() {
    try {
        localStorage.setItem(CLOSET_STORAGE_KEY, JSON.stringify({ items: closetState.items }));
    } catch (e) {}
}

function closetGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function closetAdd() {
    const type = ($('#closet-type')?.value || '服饰').trim();
    const brand = ($('#closet-brand')?.value || '').trim();
    const model = ($('#closet-model')?.value || '').trim();
    const note = ($('#closet-note')?.value || '').trim();

    if (!brand) {
        alert('品牌不能为空哦~♠');
        return;
    }
    if (!model) {
        alert('商品型号不能为空哦~♠');
        return;
    }

    closetState.items.push({
        id: closetGenId(),
        type,
        brand,
        model,
        note
    });
    closetSave();

    // 清空输入（保留类型选择）
    if ($('#closet-brand')) $('#closet-brand').value = '';
    if ($('#closet-model')) $('#closet-model').value = '';
    if ($('#closet-note')) $('#closet-note').value = '';

    if (navigator.vibrate) navigator.vibrate(50);
    closetRenderList();
}

function closetDelete(id) {
    closetState.items = closetState.items.filter((i) => i.id !== id);
    closetSave();
    closetRenderList();
}

function closetSetFilter(filter) {
    closetState.filter = filter;
    // 更新筛选按钮高亮
    $$('#closet-filter .closet-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    closetRenderList();
}

function closetRenderList() {
    const container = $('#closet-list');
    if (!container) return;

    const filtered = closetState.filter === 'all'
        ? closetState.items
        : closetState.items.filter((i) => i.type === closetState.filter);

    if (filtered.length === 0) {
        const msg = closetState.filter === 'all'
            ? '收藏柜还是空的~快把宝贝们收进来吧♠'
            : `还没有${closetState.filter}类的收藏~♠`;
        container.innerHTML = `<div class="closet-list__empty">${msg}</div>`;
        return;
    }

    container.innerHTML = filtered.map((item) => {
        return `
        <div class="closet-item">
            <div class="closet-item__type-badge">${item.type}</div>
            <div class="closet-item__info">
                <div class="closet-item__brand">${item.brand}</div>
                <div class="closet-item__model">${item.model}</div>
                ${item.note ? `<div class="closet-item__note">${item.note}</div>` : ''}
            </div>
            <button class="closet-item__delete" onclick="closetDelete('${item.id}')" title="删除">✕</button>
        </div>`;
    }).join('');
}

function initCloset() {
    closetLoad();

    // 绑定添加按钮
    $('#btn-closet-add')?.addEventListener('click', closetAdd);

    // 绑定筛选按钮
    $$('#closet-filter .closet-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            closetSetFilter(btn.dataset.filter);
        });
    });

    // 初始渲染
    closetRenderList();

    // 更新品牌 datalist
    brandUpdateAllDataLists();
}

/* ============================================
 * INIT
 * ============================================ */
document.addEventListener('DOMContentLoaded', () => {
    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 显示版本号
    const versionEl = $('#app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    initTabs();
    initFitness();
    initCalendar();
    initCountdownTimer();
    initMusicPlayer();
    initWearTracker();
    initBrandManager();
    initStockingsDiary();
    initWishlist();
    initCloset();

    // 初始化完成后统一更新品牌 datalist
    brandUpdateAllDataLists();
});
