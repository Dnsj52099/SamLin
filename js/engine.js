/*
 * 三國異客 —— 遊戲引擎
 * 純前端狀態機：處理場景推進、選項效果、好感度、存讀檔與畫面切換。
 */

// 任何未攔截的例外都會顯示在畫面頂端，方便在無法開啟開發者工具的
// 環境（例如預覽用的沙盒 iframe）中回報問題。
function showFatalError(msg) {
  let el = document.getElementById('fatal-error-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal-error-banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b00020;' +
      'color:#fff;padding:10px 16px;font-family:monospace;font-size:12px;white-space:pre-wrap;' +
      'line-height:1.5;';
    (document.body || document.documentElement).appendChild(el);
  }
  el.textContent = '⚠ 發生錯誤，請將這段文字回報：\n' + msg;
}
window.addEventListener('error', (e) => {
  showFatalError((e.message || '未知錯誤') + '\n@ ' + (e.filename || '') + ':' + (e.lineno || '?'));
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError('Promise 例外：' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
});

const SAVE_KEY = 'sgyk_save_v1';

const defaultState = () => ({
  name: '蘇挽',
  currentScene: null,
  flags: {},
  affection: { liubei: 0, zhuge: 0, zhaoyun: 0 },
  completedThreads: {},
  activeThread: null,
  ch1Done: false,
  seenCodex: [],
  lineIndex: 0,
});

let state = defaultState();
let pendingCodex = [];

// ---------------------------------------------------------------------
// 存讀檔
// ---------------------------------------------------------------------
// 部分沙盒環境（如預覽用的內嵌 iframe）會封鎖或拋出例外，
// 因此存讀檔一律容錯：失敗時遊戲仍可繼續，只是不會保留進度。
function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // 存檔空間不可用，略過即可
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const loaded = JSON.parse(raw);
    state = Object.assign(defaultState(), loaded);
    return true;
  } catch (e) {
    return false;
  }
}

function resetGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // 忽略
  }
  state = defaultState();
}

// ---------------------------------------------------------------------
// 畫面切換
// ---------------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---------------------------------------------------------------------
// 遊戲開始
// ---------------------------------------------------------------------
function startNewGame(name) {
  state = defaultState();
  state.name = name && name.trim() ? name.trim() : '蘇挽';
  state.currentScene = 'p1';
  state.lineIndex = 0;
  saveGame();
  showScreen('screen-game');
  renderScene();
}

function continueGame() {
  if (!loadGame()) return;
  if (state.ch1Done) {
    showScreen('screen-hub');
    renderHub();
  } else {
    showScreen('screen-game');
    if (!state.currentScene) state.currentScene = 'p1';
    renderScene();
  }
}

// ---------------------------------------------------------------------
// 場景渲染
// ---------------------------------------------------------------------
function currentSceneDef() {
  return SCENES[state.currentScene];
}

function visibleLines(sceneDef) {
  return sceneDef.lines.filter((line) => {
    if (line.cond && !state.flags[line.cond]) return false;
    if (line.condNot && state.flags[line.condNot]) return false;
    return true;
  });
}

function applyEffect(effect) {
  if (!effect) return;
  if (effect.affection) {
    Object.keys(effect.affection).forEach((k) => {
      state.affection[k] = (state.affection[k] || 0) + effect.affection[k];
    });
  }
  if (effect.flags) {
    effect.flags.forEach((f) => {
      state.flags[f] = true;
    });
  }
}

function unlockCodexFromFlags() {
  Object.keys(CODEX).forEach((id) => {
    if (state.flags[id] && !state.seenCodex.includes(id)) {
      state.seenCodex.push(id);
      pendingCodex.push(id);
    }
  });
}

function renderScene() {
  const sceneDef = currentSceneDef();
  if (!sceneDef) return;

  if (sceneDef.onEnter && !state.flags['__entered_' + state.currentScene]) {
    applyEffect(sceneDef.onEnter);
    state.flags['__entered_' + state.currentScene] = true;
  }
  unlockCodexFromFlags();

  const stage = document.getElementById('stage');
  stage.className = 'bg-' + (sceneDef.bg || 'default');

  const lines = visibleLines(sceneDef);
  if (state.lineIndex >= lines.length) {
    renderSceneEnd(sceneDef);
    return;
  }

  const line = lines[state.lineIndex];
  const speakerEl = document.getElementById('speaker-name');
  const textEl = document.getElementById('dialogue-text');
  const choicesEl = document.getElementById('choices');
  const nextBtn = document.getElementById('next-btn');

  choicesEl.innerHTML = '';
  choicesEl.classList.add('hidden');
  nextBtn.classList.remove('hidden');

  if (line.speaker) {
    speakerEl.textContent = t(line.speaker, state);
    speakerEl.classList.remove('hidden');
  } else {
    speakerEl.classList.add('hidden');
  }

  textEl.textContent = t(line.text, state);
  textEl.className = 'dialogue-text' + (line.cls === 'thought' ? ' thought' : '') + (!line.speaker ? ' narration' : '');

  saveGame();
  maybeShowCodexToast();
}

function renderSceneEnd(sceneDef) {
  const choicesEl = document.getElementById('choices');
  const nextBtn = document.getElementById('next-btn');
  const speakerEl = document.getElementById('speaker-name');
  speakerEl.classList.add('hidden');

  nextBtn.classList.add('hidden');
  choicesEl.innerHTML = '';
  choicesEl.classList.remove('hidden');

  if (sceneDef.endChapter) {
    state.ch1Done = true;
    saveGame();
    const btn = document.createElement('button');
    btn.className = 'choice-btn primary';
    btn.textContent = '進入——蜀漢風雲';
    btn.onclick = () => {
      showScreen('screen-hub');
      renderHub();
    };
    choicesEl.appendChild(btn);
    document.getElementById('dialogue-text').textContent = '';
    return;
  }

  if (sceneDef.choices) {
    sceneDef.choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = t(choice.text, state);
      btn.onclick = () => {
        applyEffect(choice.effect);
        goToScene(choice.next);
      };
      choicesEl.appendChild(btn);
    });
    document.getElementById('dialogue-text').textContent = '';
    return;
  }

  if (sceneDef.next) {
    goToScene(sceneDef.next);
  }
}

function goToScene(sceneId) {
  if (sceneId === 'hub') {
    if (state.activeThread) {
      state.completedThreads[state.activeThread] = true;
      state.activeThread = null;
    }
    saveGame();
    showScreen('screen-hub');
    renderHub();
    return;
  }
  state.currentScene = sceneId;
  state.lineIndex = 0;
  renderScene();
}

function advanceLine() {
  state.lineIndex += 1;
  renderScene();
}

function launchThread(threadId) {
  state.activeThread = threadId;
  showScreen('screen-game');
  goToScene(threadId);
}

// ---------------------------------------------------------------------
// 拾遺 Toast
// ---------------------------------------------------------------------
function maybeShowCodexToast() {
  if (!pendingCodex.length) return;
  const id = pendingCodex.shift();
  const entry = CODEX[id];
  if (!entry) return;
  const toast = document.getElementById('codex-toast');
  toast.querySelector('.codex-toast-title').textContent = '獲得新線索：' + entry.title;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3200);
}

// ---------------------------------------------------------------------
// 樞紐畫面
// ---------------------------------------------------------------------
function renderHub() {
  document.getElementById('hub-player-name').textContent = state.name;
  renderHubThreads();
  renderHubCharacters();
  renderHubCodex();
  renderHubAffection();
  saveGame();
}

function renderHubAffection() {
  const el = document.getElementById('affection-list');
  el.innerHTML = '';
  const rows = [
    ['liubei', '劉備'],
    ['zhuge', '諸葛亮'],
    ['zhaoyun', '趙雲'],
  ];
  rows.forEach(([key, label]) => {
    const val = state.affection[key] || 0;
    const pct = Math.min(100, (val / 12) * 100);
    const row = document.createElement('div');
    row.className = 'affection-row';
    row.innerHTML = `
      <span class="affection-label">${label}</span>
      <div class="affection-bar"><div class="affection-fill" style="width:${pct}%"></div></div>
    `;
    el.appendChild(row);
  });
}

function renderHubThreads() {
  const el = document.getElementById('thread-list');
  el.innerHTML = '';
  THREAD_ORDER.forEach((id) => {
    const def = THREADS[id];
    const unlocked = def.requires(state);
    const done = !!state.completedThreads[id];
    const card = document.createElement('button');
    card.className = 'thread-card' + (done ? ' done' : '') + (!unlocked ? ' locked' : '');
    card.disabled = !unlocked || done;
    const routeLabel = { liubei: '劉備線', zhuge: '諸葛亮線', ganfuren: '甘夫人' }[def.route];
    card.innerHTML = `
      <div class="thread-route">${routeLabel}</div>
      <div class="thread-name">${unlocked ? def.name : '？？？'}</div>
      <div class="thread-status">${done ? '已完成' : unlocked ? '可進行' : '尚未解鎖'}</div>
    `;
    if (unlocked && !done) {
      card.onclick = () => launchThread(id);
    }
    el.appendChild(card);
  });

  const allMainDone = state.completedThreads.lb3 && state.completedThreads.zl3 && state.completedThreads.gf1;
  const banner = document.getElementById('hub-banner');
  if (allMainDone) {
    banner.textContent = '【第一卷 · 完】敬請期待後續章節——魏、吳風雲，即將展開。';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function renderHubCharacters() {
  const el = document.getElementById('character-list');
  el.innerHTML = '';
  Object.keys(CHARACTERS).forEach((key) => {
    const c = CHARACTERS[key];
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-name">${c.name}</div>
      <div class="char-title">${c.title}</div>
      <div class="char-desc">${t(c.desc, state)}</div>
    `;
    el.appendChild(card);
  });
}

function renderHubCodex() {
  const el = document.getElementById('codex-list');
  el.innerHTML = '';
  if (!state.seenCodex.length) {
    el.innerHTML = '<div class="codex-empty">尚無線索，繼續探索這座宅院罷。</div>';
    return;
  }
  state.seenCodex.forEach((id) => {
    const entry = CODEX[id];
    if (!entry) return;
    const card = document.createElement('div');
    card.className = 'codex-card';
    card.innerHTML = `<div class="codex-title">${entry.title}</div><div class="codex-text">${entry.text}</div>`;
    el.appendChild(card);
  });
}

// ---------------------------------------------------------------------
// 綁定
// ---------------------------------------------------------------------
// 此腳本本就置於 <body> 最末端，執行當下所有元素其實都已存在——
// 不必非得等 DOMContentLoaded 不可（某些外嵌預覽環境注入時機特殊，
// 該事件有時不會如預期觸發），因此改用「若尚未就緒才等待，否則立刻執行」。
function initGame() {
  const continueBtn = document.getElementById('btn-continue');
  if (hasSave()) {
    continueBtn.classList.remove('hidden');
  }
  continueBtn.onclick = continueGame;

  document.getElementById('btn-new-game').onclick = () => {
    document.getElementById('name-input-wrap').classList.remove('hidden');
    document.getElementById('name-input').focus();
  };

  document.getElementById('btn-confirm-name').onclick = () => {
    const name = document.getElementById('name-input').value;
    startNewGame(name);
  };

  document.getElementById('name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-name').click();
  });

  document.getElementById('next-btn').onclick = advanceLine;
  document.getElementById('stage').addEventListener('click', (e) => {
    if (e.target.closest('.choice-btn') || e.target.closest('#choices')) return;
    if (!document.getElementById('next-btn').classList.contains('hidden')) {
      advanceLine();
    }
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // 部分預覽環境會靜默封鎖 window.confirm()（不拋例外，直接回傳
  // false），導致「重新開始」看起來完全沒反應。改用按鈕自身的
  // 兩段式確認，不依賴瀏覽器原生對話框。
  const restartBtn = document.getElementById('btn-hub-restart');
  let restartArmed = false;
  let restartTimer = null;
  restartBtn.onclick = () => {
    if (!restartArmed) {
      restartArmed = true;
      restartBtn.textContent = '確定重來？再按一次';
      restartTimer = setTimeout(() => {
        restartArmed = false;
        restartBtn.textContent = '重新開始';
      }, 3000);
      return;
    }
    clearTimeout(restartTimer);
    restartArmed = false;
    restartBtn.textContent = '重新開始';
    resetGame();
    startNewGame('唯馨');
  };
}

function boot() {
  try {
    initGame();
  } catch (err) {
    showFatalError('初始化失敗：' + (err && err.stack ? err.stack : String(err)));
    return;
  }
  try {
    // 暫時繞過標題畫面：某些預覽環境下標題畫面的按鈕互動不穩定，
    // 因此直接以固定角色名開場，讓劇情本身先能被玩到。
    startNewGame('唯馨');
  } catch (err) {
    showFatalError('開場失敗：' + (err && err.stack ? err.stack : String(err)));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
