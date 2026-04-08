/* ============================================
 * ♠ Mistress Stella's Sissy Hub ♠
 * PWA Core Logic — Fitness + Timer + Music
 * ============================================ */

const APP_VERSION = 'v1.2.0';

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
 * MODULE 3: MUSIC PLAYER
 * ============================================ */
const musicState = {
    playlist: [],       // { name, file, objectUrl, duration }
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 'none'      // 'none' | 'all' | 'one'
};

const audio = document.getElementById('audio-player');

function musicFormatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function musicRenderPlaylist() {
    const container = $('#playlist');
    const dropZone = $('#music-drop-zone');
    if (musicState.playlist.length === 0) {
    container.innerHTML = `
            <div class="playlist__empty">
                <p>还没有歌呢~</p>
                <p class="playlist__hint">点下方区域添加音乐/视频~</p>
            </div>`;
        if (dropZone) dropZone.classList.remove('hidden');
        return;
    }
    container.innerHTML = musicState.playlist.map((track, i) => `
        <div class="playlist__item ${i === musicState.currentIndex ? 'active' : ''}" data-index="${i}">
            <div class="playlist__item-num">${i === musicState.currentIndex ? '♠' : (i + 1)}</div>
            <div class="playlist__item-info">
                <div class="playlist__item-title">${track.isVideo ? '🎬 ' : ''}${track.name}</div>
                <div class="playlist__item-duration">${track.duration || '--:--'}</div>
            </div>
            <button class="playlist__item-remove" data-remove="${i}">&times;</button>
        </div>
    `).join('');

    if (dropZone) dropZone.classList.add('hidden');

    // 绑定点击播放
    container.querySelectorAll('.playlist__item').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.playlist__item-remove')) return;
            musicPlayIndex(parseInt(item.dataset.index));
        });
    });

    // 绑定删除
    container.querySelectorAll('.playlist__item-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            musicRemoveTrack(parseInt(btn.dataset.remove));
        });
    });
}

function musicAddFiles(files) {
    Array.from(files).forEach((file) => {
        // 判断是否为音频或视频文件
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        // 通过扩展名兜底判断
        const ext = file.name.split('.').pop().toLowerCase();
        const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus', 'webm'];
        const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'];
        const isValidAudio = isAudio || audioExts.includes(ext);
        const isValidVideo = isVideo || videoExts.includes(ext);

        if (!isValidAudio && !isValidVideo) return; // 跳过不支持的文件

        const objectUrl = URL.createObjectURL(file);
        // 获取文件名（去掉扩展名）
        const name = file.name.replace(/\.[^/.]+$/, '');
        const track = { name, file, objectUrl, duration: null, isVideo: isValidVideo && !isValidAudio };
        musicState.playlist.push(track);

        // 获取时长（视频文件用 video 元素，音频用 audio 元素）
        const tempMedia = track.isVideo ? document.createElement('video') : new Audio();
        tempMedia.preload = 'metadata';
        tempMedia.src = objectUrl;
        tempMedia.addEventListener('loadedmetadata', () => {
            track.duration = musicFormatTime(tempMedia.duration);
            musicRenderPlaylist();
        });
    });
    musicRenderPlaylist();
}

function musicRemoveTrack(index) {
    const track = musicState.playlist[index];
    if (track) {
        URL.revokeObjectURL(track.objectUrl);
    }
    musicState.playlist.splice(index, 1);

    if (index === musicState.currentIndex) {
        audio.pause();
        musicState.isPlaying = false;
        musicState.currentIndex = -1;
        musicUpdateNowPlaying();
        musicUpdatePlayBtn();
    } else if (index < musicState.currentIndex) {
        musicState.currentIndex--;
    }
    musicRenderPlaylist();
}

function musicPlayIndex(index) {
    if (index < 0 || index >= musicState.playlist.length) return;
    musicState.currentIndex = index;
    const track = musicState.playlist[index];
    audio.src = track.objectUrl;
    audio.play().then(() => {
        musicState.isPlaying = true;
        musicUpdatePlayBtn();
        musicUpdateNowPlaying();
        musicRenderPlaylist();
    }).catch(() => {});
}

function musicTogglePlay() {
    if (musicState.playlist.length === 0) return;
    if (musicState.currentIndex < 0) {
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
    if (musicState.playlist.length === 0) return;
    let idx = musicState.currentIndex - 1;
    if (idx < 0) idx = musicState.playlist.length - 1;
    musicPlayIndex(idx);
}

function musicNext() {
    if (musicState.playlist.length === 0) return;
    if (musicState.shuffle) {
        let idx;
        do { idx = Math.floor(Math.random() * musicState.playlist.length); }
        while (idx === musicState.currentIndex && musicState.playlist.length > 1);
        musicPlayIndex(idx);
        return;
    }
    let idx = musicState.currentIndex + 1;
    if (idx >= musicState.playlist.length) {
        if (musicState.repeat === 'all') idx = 0;
        else { musicState.isPlaying = false; musicUpdatePlayBtn(); return; }
    }
    musicPlayIndex(idx);
}

function musicUpdatePlayBtn() {
    $('#icon-play').style.display = musicState.isPlaying ? 'none' : 'block';
    $('#icon-pause').style.display = musicState.isPlaying ? 'block' : 'none';
}

function musicUpdateNowPlaying() {
    if (musicState.currentIndex >= 0 && musicState.currentIndex < musicState.playlist.length) {
        const track = musicState.playlist[musicState.currentIndex];
        $('#music-title').textContent = track.name;
        $('#music-artist').textContent = `第 ${musicState.currentIndex + 1} 首 / 共 ${musicState.playlist.length} 首`;
    } else {
        $('#music-title').textContent = '还没选曲呢~';
        $('#music-artist').textContent = '快加点音乐，骚货~';
    }
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
    // 单曲循环时显示 "1"
    btn.title = musicState.repeat === 'one' ? 'Repeat One'
        : musicState.repeat === 'all' ? 'Repeat All' : 'Repeat';
}

function initMusicPlayer() {
    // 添加文件（主按钮 + 备用大区域按钮）
    const fileInputHandler = (e) => {
        if (e.target.files.length > 0) {
            musicAddFiles(e.target.files);
            e.target.value = ''; // 允许重复选择
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
});
