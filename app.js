(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const titleScreen = document.getElementById("titleScreen");
  const setupScreen = document.getElementById("setupScreen");
  const resultScreen = document.getElementById("resultScreen");

  const playBtn = document.getElementById("playBtn");
  const startBtn = document.getElementById("startBtn");
  const clearBtn = document.getElementById("clearBtn");
  const endBtn = document.getElementById("endBtn");

  const selectedText = document.getElementById("hudSelected");
  const countdownText = document.getElementById("hudCountdown");
  const setupControls = document.getElementById("setupControls");

  const scoreText = document.getElementById("scoreText");
  const resultText = document.getElementById("resultText");

  const GameState = {
    TITLE: "TITLE",
    SETUP: "SETUP",
    RUN: "RUN",
    RESULT: "RESULT",
  };

  const GAME_W = 1000;
  const GAME_H = 1600;

  const m1 = 1;
  const m2 = 1;
  const pxPerMeter = 100;
  const g = 9.81 * pxPerMeter;
  const damping = 0.03;
  const dt = 1 / 240;
  const maxSubsteps = 8;
  const roundDurationSec = 5;

  const N = 20;
  const bobRadius1 = 6;
  const bobRadius2 = 15;

  const titleTimeScale = 0.6;
  const scoreAnimDurationMs = 780;

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let viewScale = 1;
  let viewOffsetX = 0;
  let viewOffsetY = 0;

  let pivotX = GAME_W * 0.5;
  let pivotY = GAME_H * 0.25;

  let cellSize = GAME_W / N;
  let M = Math.max(1, Math.floor(GAME_H / cellSize));
  let gridHeight = M * cellSize;

  let gameState = GameState.TITLE;

  let seed = 0;
  let rand = null;

  let state = {
    theta1: 0,
    theta2: 0,
    omega1: 0,
    omega2: 0,
    L1: 0,
    L2: 0,
  };

  let initialState = null;
  let selectedCells = new Set();

  let correctCell = null;
  let wasHit = false;
  let score = 0;

  let displayedScore = 0;
  let scoreAnimStartTs = 0;
  let scoreAnimating = false;

  let acc = 0;
  let lastTs = 0;
  let runStartTs = 0;
  let remainingSec = roundDurationSec;

  let pointerActive = false;
  let pointerId = -1;
  let pointerDownCell = null;
  let pointerDidDrag = false;
  let lastDragKey = "";

  function toUInt32(n) {
    return (Number(n) >>> 0) || 0;
  }

  function parseSeed() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("seed");
    if (raw === null) {
      return toUInt32(Date.now());
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return toUInt32(Date.now());
    }
    return toUInt32(parsed);
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randRange(min, max) {
    return min + (max - min) * rand();
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatInt(v) {
    return Math.floor(v).toLocaleString("ja-JP");
  }

  function setScoreText(v) {
    scoreText.textContent = `スコア ${formatInt(v)}`;
  }

  function cellKey(row, col) {
    return `${row},${col}`;
  }

  function updateViewTransform() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    viewScale = Math.min(cssW / GAME_W, cssH / GAME_H);
    viewOffsetX = (cssW - GAME_W * viewScale) * 0.5;
    viewOffsetY = (cssH - GAME_H * viewScale) * 0.5;

    document.documentElement.style.setProperty("--dpr", String(dpr));

    cellSize = GAME_W / N;
    M = Math.max(1, Math.floor(GAME_H / cellSize));
    gridHeight = M * cellSize;

    pivotX = GAME_W * 0.5;
    updatePivotForState();

    updateSetupTexts();
  }

  function updatePivotForState() {
    if (gameState === GameState.TITLE) {
      pivotY = GAME_H * 0.16;
    } else {
      pivotY = GAME_H * 0.25;
    }
  }

  function beginWorldDraw() {
    ctx.save();
    ctx.translate(viewOffsetX, viewOffsetY);
    ctx.scale(viewScale, viewScale);
  }

  function endWorldDraw() {
    ctx.restore();
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = (sx - viewOffsetX) / viewScale;
    const wy = (sy - viewOffsetY) / viewScale;
    return { x: wx, y: wy };
  }

  function makeRandomInitialState() {
    const minDim = Math.min(GAME_W, GAME_H);
    const minL = 0.18 * minDim;
    const maxL = 0.32 * minDim;

    return {
      theta1: randRange(-Math.PI, Math.PI),
      theta2: randRange(-Math.PI, Math.PI),
      omega1: 0,
      omega2: 0,
      L1: randRange(minL, maxL),
      L2: randRange(minL, maxL),
    };
  }

  function randomizePendulumState() {
    seed = toUInt32(Date.now());
    rand = mulberry32(seed);
    initialState = makeRandomInitialState();
    state = copyState(initialState);
  }

  function copyState(s) {
    return {
      theta1: s.theta1,
      theta2: s.theta2,
      omega1: s.omega1,
      omega2: s.omega2,
      L1: s.L1,
      L2: s.L2,
    };
  }

  function derivatives(s) {
    const t1 = s.theta1;
    const t2 = s.theta2;
    const w1 = s.omega1;
    const w2 = s.omega2;
    const L1 = s.L1;
    const L2 = s.L2;

    const delta = t1 - t2;
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);

    const den1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * delta));
    const den2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * delta));

    const num1 =
      -g * (2 * m1 + m2) * Math.sin(t1) -
      m2 * g * Math.sin(t1 - 2 * t2) -
      2 * sinDelta * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cosDelta);

    const num2 =
      2 *
      sinDelta *
      (w1 * w1 * L1 * (m1 + m2) +
        g * (m1 + m2) * Math.cos(t1) +
        w2 * w2 * L2 * m2 * cosDelta);

    let alpha1 = num1 / den1;
    let alpha2 = num2 / den2;

    alpha1 -= damping * w1;
    alpha2 -= damping * w2;

    return {
      dtheta1: w1,
      dtheta2: w2,
      domega1: alpha1,
      domega2: alpha2,
    };
  }

  function addState(s, k, factor) {
    return {
      theta1: s.theta1 + k.dtheta1 * factor,
      theta2: s.theta2 + k.dtheta2 * factor,
      omega1: s.omega1 + k.domega1 * factor,
      omega2: s.omega2 + k.domega2 * factor,
      L1: s.L1,
      L2: s.L2,
    };
  }

  function rk4Step(s, h) {
    const k1 = derivatives(s);
    const k2 = derivatives(addState(s, k1, h * 0.5));
    const k3 = derivatives(addState(s, k2, h * 0.5));
    const k4 = derivatives(addState(s, k3, h));

    s.theta1 += (h / 6) * (k1.dtheta1 + 2 * k2.dtheta1 + 2 * k3.dtheta1 + k4.dtheta1);
    s.theta2 += (h / 6) * (k1.dtheta2 + 2 * k2.dtheta2 + 2 * k3.dtheta2 + k4.dtheta2);
    s.omega1 += (h / 6) * (k1.domega1 + 2 * k2.domega1 + 2 * k3.domega1 + k4.domega1);
    s.omega2 += (h / 6) * (k1.domega2 + 2 * k2.domega2 + 2 * k3.domega2 + k4.domega2);

    return s;
  }

  function isStateFinite(s) {
    return (
      Number.isFinite(s.theta1) &&
      Number.isFinite(s.theta2) &&
      Number.isFinite(s.omega1) &&
      Number.isFinite(s.omega2) &&
      Number.isFinite(s.L1) &&
      Number.isFinite(s.L2)
    );
  }

  function getBobPositions(s) {
    const x1 = pivotX + s.L1 * Math.sin(s.theta1);
    const y1 = pivotY + s.L1 * Math.cos(s.theta1);
    const x2 = x1 + s.L2 * Math.sin(s.theta2);
    const y2 = y1 + s.L2 * Math.cos(s.theta2);
    return { x1, y1, x2, y2 };
  }

  function getCellFromPoint(x, y) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (col < 0 || col >= N || row < 0 || row >= M) {
      return null;
    }

    return { row, col };
  }

  function updateSetupTexts() {
    selectedText.textContent = `Selected: ${selectedCells.size}`;
    startBtn.disabled = gameState !== GameState.SETUP || selectedCells.size === 0;
  }

  function setScreenVisibility() {
    titleScreen.classList.toggle("hidden", gameState !== GameState.TITLE);
    setupScreen.classList.toggle("hidden", gameState !== GameState.SETUP && gameState !== GameState.RUN);
    resultScreen.classList.toggle("hidden", gameState !== GameState.RESULT);

    canvas.classList.toggle("title-bg", gameState === GameState.TITLE);

    setupControls.classList.toggle("hidden", gameState !== GameState.SETUP);
    selectedText.classList.toggle("hidden", gameState !== GameState.SETUP);
    countdownText.classList.toggle("hidden", gameState !== GameState.RUN);

    updatePivotForState();
    updateSetupTexts();
  }

  function startNewSetup() {
    gameState = GameState.SETUP;
    randomizePendulumState();

    selectedCells.clear();
    correctCell = null;
    wasHit = false;
    score = 0;

    displayedScore = 0;
    scoreAnimStartTs = 0;
    scoreAnimating = false;
    setScoreText(0);

    acc = 0;
    lastTs = 0;
    runStartTs = 0;
    remainingSec = roundDurationSec;
    countdownText.textContent = roundDurationSec.toFixed(2);

    setScreenVisibility();
  }

  function enterTitle() {
    gameState = GameState.TITLE;
    randomizePendulumState();
    acc = 0;
    lastTs = 0;
    setScreenVisibility();
  }

  function computeScore(k) {
    const T = N * M;
    if (k < 1 || T <= 1) {
      return 0;
    }
    const ratio = (T - k) / (T - 1);
    const raw = Math.floor(1 + 9999 * ratio * ratio);
    return clamp(raw, 1, 10000);
  }

  function beginScoreAnimation(ts) {
    displayedScore = 0;
    scoreAnimStartTs = ts;
    scoreAnimating = true;
    setScoreText(0);
  }

  function updateScoreAnimation(ts) {
    if (!scoreAnimating) {
      return;
    }

    const t = clamp((ts - scoreAnimStartTs) / scoreAnimDurationMs, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    displayedScore = Math.floor(score * eased);
    setScoreText(displayedScore);

    if (t >= 1) {
      displayedScore = score;
      setScoreText(displayedScore);
      scoreAnimating = false;
    }
  }

  function finishRound(ts) {
    const pos = getBobPositions(state);
    const cell = getCellFromPoint(pos.x2, pos.y2);

    if (cell) {
      correctCell = { row: cell.row, col: cell.col, inside: true };
      wasHit = selectedCells.has(cellKey(cell.row, cell.col));
    } else {
      correctCell = { row: -1, col: -1, inside: false };
      wasHit = false;
    }

    score = wasHit ? computeScore(selectedCells.size) : 0;

    if (wasHit) {
      resultText.textContent = "✅ 的中！";
      resultText.className = "good";
    } else {
      resultText.textContent = "❌ はずれ…";
      resultText.className = "bad";
    }

    remainingSec = 0;
    gameState = GameState.RESULT;
    beginScoreAnimation(ts);
    setScreenVisibility();

    lastTs = ts;
  }

  function drawGrid() {
    for (const key of selectedCells) {
      const [rowStr, colStr] = key.split(",");
      const row = Number.parseInt(rowStr, 10);
      const col = Number.parseInt(colStr, 10);
      const x = col * cellSize;
      const y = row * cellSize;
      ctx.fillStyle = "rgba(79, 134, 255, 0.2)";
      ctx.fillRect(x, y, cellSize, cellSize);
    }

    ctx.strokeStyle = "rgba(94, 114, 148, 0.16)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let c = 0; c <= N; c += 1) {
      const x = c * cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridHeight);
    }
    for (let r = 0; r <= M; r += 1) {
      const y = r * cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_W, y);
    }
    ctx.stroke();

    if (gameState === GameState.RESULT && correctCell && correctCell.inside) {
      const x = correctCell.col * cellSize;
      const y = correctCell.row * cellSize;
      ctx.strokeStyle = wasHit ? "#1ea97c" : "#d84e74";
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
    }
  }

  function drawPendulum(styleMode) {
    const p = getBobPositions(state);

    let rodColor = "#5f97ff";
    let pivotColor = "#2f4261";
    let bob1Color = "#5dd8b1";
    let bob2Color = "#ff89be";

    if (styleMode === "title") {
      rodColor = "rgba(92, 124, 184, 0.72)";
      pivotColor = "rgba(84, 102, 138, 0.74)";
      bob1Color = "rgba(108, 169, 219, 0.72)";
      bob2Color = "rgba(129, 170, 214, 0.74)";
    }

    if (styleMode === "game") {
      rodColor = "rgba(55,65,81,0.55)";
      pivotColor = "rgba(55,65,81,0.7)";
      bob1Color = "rgba(55,65,81,0.7)";
      bob2Color = "#1ea97c";
    }

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(p.x1, p.y1);
    ctx.lineTo(p.x2, p.y2);
    ctx.strokeStyle = rodColor;
    ctx.lineWidth = styleMode === "title" ? 2.5 : 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = pivotColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x1, p.y1, bobRadius1, 0, Math.PI * 2);
    ctx.fillStyle = bob1Color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x2, p.y2, bobRadius2, 0, Math.PI * 2);
    ctx.fillStyle = bob2Color;
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);

    beginWorldDraw();

    if (gameState === GameState.TITLE) {
      drawPendulum("title");
      endWorldDraw();
      return;
    }

    if (gameState === GameState.SETUP || gameState === GameState.RUN || gameState === GameState.RESULT) {
      drawGrid();
      drawPendulum("game");
    }

    endWorldDraw();
  }

  function clearPointerSelectionState() {
    pointerActive = false;
    pointerId = -1;
    pointerDownCell = null;
    pointerDidDrag = false;
    lastDragKey = "";
  }

  function onPointerDown(e) {
    if (gameState !== GameState.SETUP) {
      return;
    }

    const pt = screenToWorld(e.clientX, e.clientY);
    const cell = getCellFromPoint(pt.x, pt.y);
    if (!cell) {
      return;
    }

    pointerActive = true;
    pointerId = e.pointerId;
    pointerDownCell = cell;
    pointerDidDrag = false;
    lastDragKey = cellKey(cell.row, cell.col);
    canvas.setPointerCapture(pointerId);
  }

  function onPointerMove(e) {
    if (!pointerActive || e.pointerId !== pointerId || gameState !== GameState.SETUP) {
      return;
    }

    const pt = screenToWorld(e.clientX, e.clientY);
    const cell = getCellFromPoint(pt.x, pt.y);
    if (!cell) {
      return;
    }

    const key = cellKey(cell.row, cell.col);
    if (key === lastDragKey) {
      return;
    }

    pointerDidDrag = true;
    selectedCells.add(key);
    selectedCells.add(cellKey(pointerDownCell.row, pointerDownCell.col));
    lastDragKey = key;
    updateSetupTexts();
  }

  function onPointerUpOrCancel(e) {
    if (!pointerActive || e.pointerId !== pointerId) {
      return;
    }

    if (gameState === GameState.SETUP && pointerDownCell && !pointerDidDrag) {
      const key = cellKey(pointerDownCell.row, pointerDownCell.col);
      if (selectedCells.has(key)) {
        selectedCells.delete(key);
      } else {
        selectedCells.add(key);
      }
      updateSetupTexts();
    }

    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    clearPointerSelectionState();
  }

  function animate(ts) {
    if (!lastTs) {
      lastTs = ts;
    }

    let frameSec = (ts - lastTs) / 1000;
    lastTs = ts;
    frameSec = clamp(frameSec, 0, 0.1);

    if (gameState === GameState.TITLE) {
      frameSec *= titleTimeScale;
    }

    if (gameState === GameState.RUN || gameState === GameState.TITLE) {
      acc += frameSec;

      let substeps = 0;
      while (acc >= dt && substeps < maxSubsteps) {
        rk4Step(state, dt);

        if (!isStateFinite(state)) {
          randomizePendulumState();
          acc = 0;
          if (gameState === GameState.RUN) {
            runStartTs = ts;
            remainingSec = roundDurationSec;
          }
          break;
        }

        acc -= dt;
        substeps += 1;
      }

      if (substeps === maxSubsteps && acc > dt * maxSubsteps) {
        acc = dt * maxSubsteps;
      }

      if (gameState === GameState.RUN) {
        const elapsed = (ts - runStartTs) / 1000;
        remainingSec = Math.max(0, roundDurationSec - elapsed);
        countdownText.textContent = remainingSec.toFixed(2);

        if (elapsed >= roundDurationSec) {
          finishRound(ts);
        }
      }
    } else if (gameState === GameState.RESULT) {
      updateScoreAnimation(ts);
    }

    draw();
    requestAnimationFrame(animate);
  }

  function onResize() {
    updateViewTransform();
    updatePivotForState();
  }

  playBtn.addEventListener("click", () => {
    startNewSetup();
  });

  clearBtn.addEventListener("click", () => {
    if (gameState !== GameState.SETUP) {
      return;
    }
    selectedCells.clear();
    updateSetupTexts();
  });

  startBtn.addEventListener("click", () => {
    if (gameState !== GameState.SETUP || selectedCells.size === 0) {
      return;
    }
    gameState = GameState.RUN;
    runStartTs = performance.now();
    remainingSec = roundDurationSec;
    countdownText.textContent = remainingSec.toFixed(2);
    acc = 0;
    setScreenVisibility();
  });

  endBtn.addEventListener("click", () => {
    enterTitle();
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUpOrCancel);
  canvas.addEventListener("pointercancel", onPointerUpOrCancel);

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  updateViewTransform();
  seed = parseSeed();
  rand = mulberry32(seed);
  initialState = makeRandomInitialState();
  state = copyState(initialState);

  setScoreText(0);
  enterTitle();
  draw();
  requestAnimationFrame(animate);
})();
