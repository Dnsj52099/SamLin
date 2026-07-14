/* 夢入蜀山 — 前端引擎 */

const SAVE_KEY = "mrss_save_v1";

const state = {
  name: "",
  zhao: 0,
  zhuge: 0,
  zhaoArc: 0,
  zhugeArc: 0,
  currentNode: "p1",
};

const el = {
  screens: {
    title: document.getElementById("screen-title"),
    naming: document.getElementById("screen-naming"),
    story: document.getElementById("screen-story"),
  },
  stage: document.getElementById("stage"),
  speaker: document.getElementById("speaker-name"),
  text: document.getElementById("story-text"),
  choices: document.getElementById("choices"),
  continueBtn: document.getElementById("continue-btn"),
  nameInput: document.getElementById("name-input"),
  overlay: document.getElementById("overlay"),
  overlayBody: document.getElementById("overlay-body"),
  overlayTitle: document.getElementById("overlay-title"),
  btnContinueSave: document.getElementById("btn-continue-save"),
};

function showScreen(key) {
  Object.values(el.screens).forEach((s) => s.classList.remove("active"));
  el.screens[key].classList.add("active");
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    Object.assign(state, JSON.parse(raw));
    return true;
  } catch (e) {
    return false;
  }
}

function resolveText(node) {
  const raw = typeof node.text === "function" ? node.text(state) : node.text;
  return withName(raw, state);
}

function setStageBg(bgClass) {
  el.stage.className = "stage " + (bgClass || "scene-void");
}

function renderNode(nodeId) {
  const node = STORY[nodeId];
  if (!node) return;
  state.currentNode = nodeId;
  saveGame();

  setStageBg(node.bg);

  if (node.speaker) {
    el.speaker.textContent = node.speaker;
    el.speaker.style.display = "inline-block";
  } else {
    el.speaker.style.display = "none";
  }

  el.text.innerHTML = "";
  const paragraphs = resolveText(node).split(/\n\n+/);
  paragraphs.forEach((p) => {
    const pEl = document.createElement("p");
    pEl.textContent = p;
    el.text.appendChild(pEl);
  });

  el.choices.innerHTML = "";
  el.continueBtn.style.display = "none";

  if (node.end) {
    const btnRow = document.createElement("div");
    btnRow.className = "end-row";

    const hubBtn = document.createElement("button");
    hubBtn.className = "btn choice-btn";
    hubBtn.textContent = "◀ 返回岔路口";
    hubBtn.onclick = () => renderNode("hub_1");
    btnRow.appendChild(hubBtn);

    const titleBtn = document.createElement("button");
    titleBtn.className = "btn choice-btn ghost";
    titleBtn.textContent = "回到標題";
    titleBtn.onclick = () => showScreen("title");
    btnRow.appendChild(titleBtn);

    el.choices.appendChild(btnRow);
    return;
  }

  const resolvedChoices =
    typeof node.choices === "function" ? node.choices(state) : node.choices;

  if (resolvedChoices && resolvedChoices.length) {
    resolvedChoices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "btn choice-btn";
      btn.textContent = choice.label;
      btn.onclick = () => {
        if (choice.effect) choice.effect(state);
        if (choice.special) {
          openOverlay(choice.special);
          return;
        }
        renderNode(choice.next);
      };
      el.choices.appendChild(btn);
    });
  } else if (node.next) {
    el.continueBtn.style.display = "inline-block";
    el.continueBtn.onclick = () => renderNode(node.next);
  }
}

/* ───────── 疊層：人物誌 / 世界觀 ───────── */

function openOverlay(kind) {
  el.overlay.classList.add("active");
  if (kind === "codex") {
    el.overlayTitle.textContent = "人物誌";
    el.overlayBody.innerHTML = "";
    CODEX.forEach((group) => {
      const h = document.createElement("h3");
      h.className = "codex-faction";
      h.textContent = "── " + group.faction + " ──";
      el.overlayBody.appendChild(h);

      group.entries.forEach((person) => {
        const card = document.createElement("div");
        card.className = "codex-card";
        card.innerHTML = `
          <div class="codex-card-head">
            <span class="codex-name">${person.name}</span>
            <span class="codex-status${person.status === "已故" ? " status-dead" : ""}">${person.status}</span>
          </div>
          <div class="codex-title">${person.title}</div>
          <p class="codex-desc">${person.desc}</p>
        `;
        el.overlayBody.appendChild(card);
      });
    });
  } else if (kind === "worldview") {
    el.overlayTitle.textContent = "世界觀";
    el.overlayBody.innerHTML = "";
    WORLDVIEW_TEXT.split(/\n\n+/).forEach((p) => {
      const pEl = document.createElement("p");
      pEl.textContent = p;
      pEl.className = "worldview-p";
      el.overlayBody.appendChild(pEl);
    });
  }
}

function closeOverlay() {
  el.overlay.classList.remove("active");
  if (state.currentNode) renderNode(state.currentNode);
}

/* ───────── 啟動流程 ───────── */

document.getElementById("btn-new-game").addEventListener("click", () => {
  showScreen("naming");
});

document.getElementById("btn-confirm-name").addEventListener("click", () => {
  const val = el.nameInput.value.trim();
  state.name = val || "沈知微";
  state.zhao = 0;
  state.zhuge = 0;
  state.zhaoArc = 0;
  state.zhugeArc = 0;
  showScreen("story");
  renderNode("p1");
});

el.btnContinueSave.addEventListener("click", () => {
  if (loadGame()) {
    showScreen("story");
    renderNode(state.currentNode);
  }
});

document.getElementById("overlay-close").addEventListener("click", closeOverlay);
el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeOverlay();
});

document.getElementById("btn-codex-title").addEventListener("click", () => openOverlay("codex"));
document.getElementById("btn-worldview-title").addEventListener("click", () => openOverlay("worldview"));

document.getElementById("btn-menu").addEventListener("click", () => {
  const menu = document.getElementById("in-game-menu");
  menu.classList.toggle("active");
});
document.getElementById("btn-menu-codex").addEventListener("click", () => openOverlay("codex"));
document.getElementById("btn-menu-worldview").addEventListener("click", () => openOverlay("worldview"));
document.getElementById("btn-menu-title").addEventListener("click", () => {
  document.getElementById("in-game-menu").classList.remove("active");
  showScreen("title");
});

/* 若存在存檔，標題頁顯示「續上回」 */
window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem(SAVE_KEY)) {
    el.btnContinueSave.style.display = "inline-block";
  }
});
