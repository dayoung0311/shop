'use strict';

// ===== 설정 =====
const TILE = 48;
const COLS = 13;
const ROWS = 11;
const HUD = 48;

const EMPTY = 0;
const WALL = 1;
const BLOCK = 2;

const BALLOON_TIME = 2.5; // 설치 후 폭발까지 (초)
const FLAME_TIME = 0.5;   // 물줄기 유지 시간 (초)
const TRAP_TIME = 3;      // 물방울에 갇힌 후 탈락까지 (초)
const MATCH_TIME = 180;   // 제한 시간 (초)
const ITEM_CHANCE = 0.3;  // 블록 파괴 시 아이템 드롭 확률
const BLOCK_RATIO = 0.6;  // 빈 칸 중 블록 비율
const END_DELAY = 1.2;    // 승패 결정 후 결과 화면까지 (초)

const BASE_SPEED = 4;     // 타일/초
const MAX_SPEED_LV = 4;   // 4 + 4 = 8 타일/초
const MAX_BALLOONS = 5;
const MAX_RANGE = 6;

const ITEM_TYPES = ['balloon', 'range', 'speed'];

const DIR_KEYS = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
const DIRS4 = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const PLAYER_START = { c: 1, r: 1 };
const AI_START = { c: COLS - 2, r: ROWS - 2 };

// ===== 캔버스 =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE + HUD;

// ===== 유틸 =====
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const key = (c, r) => r * COLS + c;
const inBounds = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const manhattan = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
const tileOf = (e) => ({ c: Math.round(e.x), r: Math.round(e.y) });
const grid2D = (fill) => Array.from({ length: ROWS }, () => Array(COLS).fill(fill));

// ===== 게임 상태 =====
let state = 'title'; // title | playing | paused | ending | result
let grid, flames, items, balloons, player, ai;
let timeLeft, endTimer, resultText;
const heldDirs = [];
let spaceQueued = false;

// 단일 고정 맵: 시드 고정이라 매 판 같은 블록 배치
function buildMap() {
  const rnd = mulberry32(20261114);
  const g = grid2D(EMPTY);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
      const pillar = r % 2 === 0 && c % 2 === 0;
      const roll = rnd();
      if (border || pillar) g[r][c] = WALL;
      else if (manhattan({ c, r }, PLAYER_START) <= 2 || manhattan({ c, r }, AI_START) <= 2) g[r][c] = EMPTY;
      else g[r][c] = roll < BLOCK_RATIO ? BLOCK : EMPTY;
    }
  }
  return g;
}

function makeChar(start, color, isAI) {
  return {
    x: start.c, y: start.r, tx: start.c, ty: start.r,
    moving: false,
    face: { x: 0, y: 1 },
    speedLv: 0, maxBalloons: 1, range: 1, active: 0,
    state: 'alive', // alive | trapped | dead
    trapT: 0, deadT: 0,
    color, isAI,
    placeCd: 0,
  };
}
const speedOf = (e) => BASE_SPEED + e.speedLv;

function resetGame() {
  grid = buildMap();
  flames = grid2D(0);
  items = grid2D(null);
  balloons = [];
  player = makeChar(PLAYER_START, '#ff5d5d', false);
  ai = makeChar(AI_START, '#a66bff', true);
  timeLeft = MATCH_TIME;
  endTimer = 0;
  resultText = '';
  spaceQueued = false;
  state = 'playing';
}

// ===== 맵 질의 =====
const balloonAt = (c, r) => balloons.find((b) => b.c === c && b.r === r);
function isPassable(c, r) {
  return inBounds(c, r) && grid[r][c] === EMPTY && !balloonAt(c, r);
}

// ===== 이동 =====
// chain=true: 도착 후 남은 이동량으로 같은 방향 계속 (플레이어 키 누르고 있을 때)
function moveChar(e, dir, dt, chain) {
  let budget = speedOf(e) * dt;
  while (budget > 1e-9) {
    if (!e.moving) {
      if (!dir) break;
      e.face = dir;
      const nc = Math.round(e.x) + dir.x;
      const nr = Math.round(e.y) + dir.y;
      if (!isPassable(nc, nr)) break;
      e.tx = nc;
      e.ty = nr;
      e.moving = true;
    }
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (budget >= dist) {
      e.x = e.tx;
      e.y = e.ty;
      e.moving = false;
      budget -= dist;
      if (!chain) break;
    } else {
      e.x += Math.sign(dx) * budget;
      e.y += Math.sign(dy) * budget;
      budget = 0;
    }
  }
}

// ===== 물풍선 =====
function placeBalloon(e) {
  if (e.state !== 'alive') return false;
  const { c, r } = tileOf(e);
  if (grid[r][c] !== EMPTY || balloonAt(c, r) || e.active >= e.maxBalloons) return false;
  balloons.push({ c, r, t: BALLOON_TIME, range: e.range, owner: e, done: false });
  e.active++;
  return true;
}

function detonate(first) {
  const queue = [first];
  const toBreak = new Map();
  while (queue.length) {
    const b = queue.shift();
    if (b.done) continue;
    b.done = true;
    balloons = balloons.filter((x) => x !== b);
    b.owner.active--;
    flames[b.r][b.c] = FLAME_TIME;
    items[b.r][b.c] = null;
    for (const d of DIRS4) {
      for (let i = 1; i <= b.range; i++) {
        const c = b.c + d.x * i;
        const r = b.r + d.y * i;
        if (!inBounds(c, r) || grid[r][c] === WALL) break;
        flames[r][c] = FLAME_TIME;
        if (grid[r][c] === BLOCK) {
          toBreak.set(key(c, r), { c, r });
          break;
        }
        items[r][c] = null;
        const other = balloonAt(c, r);
        if (other && !other.done) {
          queue.push(other); // 연쇄 폭발
          break;
        }
      }
    }
  }
  for (const { c, r } of toBreak.values()) {
    grid[r][c] = EMPTY;
    if (Math.random() < ITEM_CHANCE) {
      items[r][c] = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    }
  }
}

function applyItem(e, type) {
  if (type === 'balloon') e.maxBalloons = Math.min(MAX_BALLOONS, e.maxBalloons + 1);
  else if (type === 'range') e.range = Math.min(MAX_RANGE, e.range + 1);
  else if (type === 'speed') e.speedLv = Math.min(MAX_SPEED_LV, e.speedLv + 1);
}

// ===== AI =====
// 폭발 예상 범위 (벽에서 멈춤, 블록·물풍선 칸 포함 후 멈춤)
function blastCells(c0, r0, range, out) {
  out.add(key(c0, r0));
  for (const d of DIRS4) {
    for (let i = 1; i <= range; i++) {
      const c = c0 + d.x * i;
      const r = r0 + d.y * i;
      if (!inBounds(c, r) || grid[r][c] === WALL) break;
      out.add(key(c, r));
      if (grid[r][c] === BLOCK || balloonAt(c, r)) break;
    }
  }
  return out;
}

function computeDanger() {
  const danger = new Set();
  for (const b of balloons) blastCells(b.c, b.r, b.range, danger);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (flames[r][c] > 0) danger.add(key(c, r));
  }
  return danger;
}

// BFS: 지나갈 수 있는 칸 (현재 불붙은 칸 제외). avoid 집합에 있는 칸은 통과 불가.
function bfs(start, avoid) {
  const dist = new Map([[key(start.c, start.r), 0]]);
  const prev = new Map();
  const order = [start];
  for (let i = 0; i < order.length; i++) {
    const cur = order[i];
    const cd = dist.get(key(cur.c, cur.r));
    for (const d of DIRS4) {
      const c = cur.c + d.x;
      const r = cur.r + d.y;
      const k = key(c, r);
      if (dist.has(k) || !isPassable(c, r) || flames[r][c] > 0) continue;
      if (avoid && avoid.has(k)) continue;
      dist.set(k, cd + 1);
      prev.set(k, cur);
      order.push({ c, r });
    }
  }
  return { dist, prev, order };
}

function firstStep(start, target, prev) {
  let cur = target;
  let p = prev.get(key(cur.c, cur.r));
  while (p && !(p.c === start.c && p.r === start.r)) {
    cur = p;
    p = prev.get(key(cur.c, cur.r));
  }
  return p ? cur : null;
}

function findEscape(start, danger) {
  const { order, prev } = bfs(start, null);
  for (const cell of order) {
    if (!danger.has(key(cell.c, cell.r))) {
      if (cell.c === start.c && cell.r === start.r) return start;
      return firstStep(start, cell, prev);
    }
  }
  return null;
}

function adjacentToBlock(t) {
  return DIRS4.some((d) => inBounds(t.c + d.x, t.r + d.y) && grid[t.r + d.y][t.c + d.x] === BLOCK);
}

function playerInBlast(t, range) {
  if (player.state !== 'alive') return false;
  const p = tileOf(player);
  return blastCells(t.c, t.r, range, new Set()).has(key(p.c, p.r));
}

function startStep(e, step) {
  e.face = { x: step.c - Math.round(e.x), y: step.r - Math.round(e.y) };
  e.tx = step.c;
  e.ty = step.r;
  e.moving = true;
}

function updateAI(dt) {
  const e = ai;
  if (e.state !== 'alive') return;
  e.placeCd -= dt;
  if (e.moving) {
    moveChar(e, null, dt, false);
    return;
  }
  const here = tileOf(e);
  const danger = computeDanger();

  // 1) 위험하면 도망
  if (danger.has(key(here.c, here.r))) {
    const step = findEscape(here, danger);
    if (step && step !== here) {
      startStep(e, step);
      moveChar(e, null, dt, false);
    }
    return;
  }

  // 2) 물풍선 설치 (탈출로 있을 때만)
  const wantPlace = adjacentToBlock(here) || playerInBlast(here, e.range);
  if (wantPlace && e.placeCd <= 0 && e.active < e.maxBalloons && Math.random() < 0.15) {
    const hypo = blastCells(here.c, here.r, e.range, new Set(danger));
    const esc = findEscape(here, hypo);
    if (esc && esc !== here && placeBalloon(e)) {
      e.placeCd = 0.8;
      return;
    }
  }

  // 3) 목표 칸 선택 후 이동 (위험 칸 회피)
  const { order, dist, prev } = bfs(here, danger);
  const p = tileOf(player);
  let best = null;
  let bestScore = -Infinity;
  for (const cell of order) {
    if (cell.c === here.c && cell.r === here.r) continue;
    const d = dist.get(key(cell.c, cell.r));
    let score = Math.random() * 2 - d * 0.6;
    if (items[cell.r][cell.c]) score += 30 - d;
    if (adjacentToBlock(cell)) score += 6;
    if (player.state === 'alive') score += Math.max(0, 6 - manhattan(cell, p)) * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  if (best) {
    const step = firstStep(here, best, prev);
    if (step) {
      startStep(e, step);
      moveChar(e, null, dt, false);
    }
  }
}

// ===== 업데이트 =====
function currentDir() {
  return heldDirs.length ? DIR_KEYS[heldDirs[heldDirs.length - 1]] : null;
}

function updateChar(e, other, dt) {
  if (e.state === 'dead') {
    e.deadT += dt;
    return;
  }
  const t = tileOf(e);
  if (e.state === 'alive') {
    if (flames[t.r][t.c] > 0) {
      e.state = 'trapped';
      e.trapT = TRAP_TIME;
      e.moving = false;
      e.x = t.c;
      e.y = t.r;
      return;
    }
    const it = items[t.r][t.c];
    if (it) {
      applyItem(e, it);
      items[t.r][t.c] = null;
    }
  } else if (e.state === 'trapped') {
    e.trapT -= dt;
    const touched = other.state === 'alive' && Math.abs(other.x - e.x) + Math.abs(other.y - e.y) < 0.7;
    if (e.trapT <= 0 || touched) e.state = 'dead';
  }
}

function update(dt) {
  if (state !== 'playing' && state !== 'ending') return;

  if (state === 'playing') {
    timeLeft -= dt;
    if (player.state === 'alive') {
      moveChar(player, currentDir(), dt, true);
      if (spaceQueued) placeBalloon(player);
    }
    updateAI(dt);
  }
  spaceQueued = false;

  // 물풍선 타이머 (불붙은 칸에 놓인 물풍선은 즉시 폭발)
  for (const b of [...balloons]) {
    if (b.done) continue;
    b.t -= dt;
    if (b.t <= 0 || flames[b.r][b.c] > 0) detonate(b);
  }

  // 물줄기 감소
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (flames[r][c] > 0) flames[r][c] = Math.max(0, flames[r][c] - dt);
  }

  updateChar(player, ai, dt);
  updateChar(ai, player, dt);

  if (state === 'playing') {
    const pd = player.state === 'dead';
    const ad = ai.state === 'dead';
    if (pd || ad || timeLeft <= 0) {
      timeLeft = Math.max(0, timeLeft);
      resultText = pd && ad ? '무승부' : pd ? '패배...' : ad ? '승리!' : '시간 종료 · 무승부';
      state = 'ending';
      endTimer = END_DELAY;
    }
  } else {
    endTimer -= dt;
    if (endTimer <= 0) state = 'result';
  }
}

// ===== 렌더링 =====
function roundRect(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawTile(c, r) {
  const x = c * TILE;
  const y = HUD + r * TILE;
  ctx.fillStyle = (c + r) % 2 ? '#6fc97a' : '#79d184';
  ctx.fillRect(x, y, TILE, TILE);
  const g = grid[r][c];
  if (g === WALL) {
    ctx.fillStyle = '#4a5568';
    roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 6);
    ctx.fill();
    ctx.fillStyle = '#718096';
    roundRect(x + 6, y + 5, TILE - 12, TILE - 18, 4);
    ctx.fill();
  } else if (g === BLOCK) {
    ctx.fillStyle = '#c47a3a';
    roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 5);
    ctx.fill();
    ctx.strokeStyle = '#8a4f1f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 10);
    ctx.lineTo(x + TILE - 10, y + TILE - 10);
    ctx.moveTo(x + TILE - 10, y + 10);
    ctx.lineTo(x + 10, y + TILE - 10);
    ctx.stroke();
  }
}

const ITEM_STYLE = {
  balloon: { color: '#3b82f6', label: '풍선' },
  range: { color: '#06b6d4', label: '물줄기' },
  speed: { color: '#f59e0b', label: '신발' },
};

function drawItem(c, r, type, time) {
  const x = c * TILE + TILE / 2;
  const y = HUD + r * TILE + TILE / 2 + Math.sin(time * 4 + c) * 2;
  const s = ITEM_STYLE[type];
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(x - 17, y - 17, 34, 34, 8);
  ctx.fill();
  ctx.fillStyle = s.color;
  roundRect(x - 14, y - 14, 28, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.label, x, y - 3);
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('+1', x, y + 8);
}

function drawBalloon(b, time) {
  const x = b.c * TILE + TILE / 2;
  const y = HUD + b.r * TILE + TILE / 2;
  const pulse = 1 + Math.sin(time * (b.t < 0.8 ? 25 : 8)) * 0.06;
  const rad = 16 * pulse;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.t < 0.8 ? '#60a5fa' : '#2563eb';
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(x - 5, y - 6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e40af';
  ctx.beginPath();
  ctx.moveTo(x - 3, y - rad - 4);
  ctx.lineTo(x + 3, y - rad - 4);
  ctx.lineTo(x, y - rad + 1);
  ctx.fill();
}

function drawFlame(c, r, t) {
  const x = c * TILE;
  const y = HUD + r * TILE;
  const a = Math.min(1, t / FLAME_TIME + 0.2);
  ctx.fillStyle = `rgba(56,189,248,${0.75 * a})`;
  roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 10);
  ctx.fill();
  ctx.fillStyle = `rgba(224,242,254,${0.9 * a})`;
  roundRect(x + 12, y + 12, TILE - 24, TILE - 24, 6);
  ctx.fill();
}

function drawChar(e, time) {
  if (e.state === 'dead' && e.deadT > 0.6) return;
  const x = e.x * TILE + TILE / 2;
  const y = HUD + e.y * TILE + TILE / 2;
  const bob = e.moving ? Math.sin(time * 18) * 2 : 0;
  ctx.save();
  if (e.state === 'dead') ctx.globalAlpha = Math.max(0, 1 - e.deadT / 0.6);

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 17, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y + bob, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 눈 (바라보는 방향)
  const ex = e.face.x * 4;
  const ey = e.face.y * 3;
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + s * 6 + ex, y - 3 + ey + bob, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a202c';
    ctx.beginPath();
    ctx.arc(x + s * 6 + ex * 1.4, y - 3 + ey * 1.4 + bob, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 물방울에 갇힘
  if (e.state === 'trapped' || e.state === 'dead') {
    const wob = Math.sin(time * 6) * 1.5;
    ctx.fillStyle = 'rgba(147,210,255,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22 + wob, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (e.state === 'trapped') {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.trapT) / TRAP_TIME);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#16263f';
  ctx.fillRect(0, 0, canvas.width, HUD);
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 16px system-ui, sans-serif';

  const stats = (e) => `풍선 ${e.maxBalloons}  물줄기 ${e.range}  속도 ${e.speedLv + 1}`;
  ctx.fillStyle = player.color;
  ctx.textAlign = 'left';
  ctx.fillText('● 나', 14, HUD / 2 - 9);
  ctx.fillStyle = ai.color;
  ctx.textAlign = 'right';
  ctx.fillText('AI ●', canvas.width - 14, HUD / 2 - 9);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#c3d3ea';
  ctx.textAlign = 'left';
  ctx.fillText(stats(player), 14, HUD / 2 + 10);
  ctx.textAlign = 'right';
  ctx.fillText(stats(ai), canvas.width - 14, HUD / 2 + 10);

  const t = Math.ceil(Math.max(0, timeLeft));
  const mm = Math.floor(t / 60);
  const ss = String(t % 60).padStart(2, '0');
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = t <= 30 ? '#fca5a5' : '#e8f1ff';
  ctx.fillText(`${mm}:${ss}`, canvas.width / 2, HUD / 2);
}

function drawOverlay(title, lines) {
  ctx.fillStyle = 'rgba(10,18,32,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8f1ff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  const cy = canvas.height / 2 - 30;
  ctx.fillText(title, canvas.width / 2, cy);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#b8cbe6';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, cy + 56 + i * 28));
}

function render(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawTile(c, r);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (items[r][c]) drawItem(c, r, items[r][c], time);
  }
  for (const b of balloons) drawBalloon(b, time);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (flames[r][c] > 0) drawFlame(c, r, flames[r][c]);
  }
  drawChar(ai, time);
  drawChar(player, time);
  drawHUD();

  if (state === 'title') {
    drawOverlay('Splash Arena', [
      'Enter를 눌러 시작',
      '방향키 이동 · Space 물풍선',
      'AI를 물방울에 가두면 승리!',
    ]);
  } else if (state === 'paused') {
    drawOverlay('일시정지', ['Esc를 눌러 계속']);
  } else if (state === 'result') {
    drawOverlay(resultText, ['Enter를 눌러 다시 하기']);
  }
}

// ===== 입력 =====
window.addEventListener('keydown', (ev) => {
  if (DIR_KEYS[ev.code]) {
    ev.preventDefault();
    if (!heldDirs.includes(ev.code)) heldDirs.push(ev.code);
  } else if (ev.code === 'Space') {
    ev.preventDefault();
    if (!ev.repeat && state === 'playing') spaceQueued = true;
  } else if (ev.code === 'Enter') {
    if (state === 'title' || state === 'result') resetGame();
  } else if (ev.code === 'Escape') {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
  }
});
window.addEventListener('keyup', (ev) => {
  const i = heldDirs.indexOf(ev.code);
  if (i >= 0) heldDirs.splice(i, 1);
});
window.addEventListener('blur', () => {
  heldDirs.length = 0;
});

// ===== 루프 =====
let last = 0;
function frame(ts) {
  const now = ts / 1000;
  const dt = Math.min(0.05, last ? now - last : 0);
  last = now;
  update(dt);
  render(now);
  requestAnimationFrame(frame);
}

resetGame();
state = 'title';
requestAnimationFrame(frame);
