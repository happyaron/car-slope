'use strict';

// ─── Presets ─────────────────────────────────────────────────────────────────
const PRESETS = {
  m3p_easy: {
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 15, rampLength: 20000, upperFlat: 3000, lowerFlat: 3000,
  },
  m3p_hard: {
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 20, rampLength: 20000, upperFlat: 3000, lowerFlat: 3000,
  },
  sports: {
    wheelbase: 2450, clearance: 110, frontOverhang: 900, rearOverhang: 750,
    approachAngle: 12, departureAngle: 14, breakoverAngle: 10, tireRadius: 320,
    rampGrade: 18, rampLength: 15000, upperFlat: 3000, lowerFlat: 3000,
  },
};

function loadPreset(key) {
  const p = PRESETS[key];
  for (const [id, val] of Object.entries(p)) {
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      if (id === 'rampGrade') {
        document.getElementById('rampAngle').value = gradeToDeg(val).toFixed(2);
      }
    }
  }
  update();
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────
const deg2rad = d => d * Math.PI / 180;
const rad2deg = r => r * 180 / Math.PI;
const gradeToDeg = g => Math.atan(g / 100) * 180 / Math.PI;
const degToGrade = d => Math.tan(deg2rad(d)) * 100;

// ─── Read inputs ──────────────────────────────────────────────────────────────
function readInputs() {
  const v = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    L:   v('wheelbase'),
    h:   v('clearance'),
    Of:  v('frontOverhang'),
    Or:  v('rearOverhang'),
    αa:  v('approachAngle'),
    αd:  v('departureAngle'),
    αb:  v('breakoverAngle'),
    r:   v('tireRadius'),
    θ:   v('rampAngle'),
    Lr:  v('rampLength'),
    Uf:  v('upperFlat'),
    Lf:  v('lowerFlat'),
  };
}

// ─── Car underside polyline ───────────────────────────────────────────────────
// Local coords: origin = front tire contact on flat road.
//   y=0 = road surface, y>0 = above road.
//   x positive = forward (direction of travel = ahead of front tire).
//   front tire at x=0, rear tire at x = -L (behind by wheelbase).
//
// Car underside points (front to rear):
//   P0: front bumper bottom  — x = +Of, y = Of*tan(αa)
//   P1: approach ramp meets belly — x = h/tan(αa), y = h
//   P2: breakover nadir — x = -L/2, y = h
//   P3: departure ramp meets belly — x = -(L - h/tan(αd)), y = h
//   P4: rear bumper bottom — x = -(L+Or), y = Or*tan(αd)

function buildCarProfile(c) {
  const { L, h, Of, Or, αa, αd } = c;
  const tanAa = Math.tan(deg2rad(αa));
  const tanAd = Math.tan(deg2rad(αd));
  return [
    [Of, Math.max(0, Of * tanAa)],
    [h / tanAa, h],
    [-L / 2, h],
    [-(L - h / tanAd), h],
    [-(L + Or), Math.max(0, Or * tanAd)],
  ];
}

// ─── Road polyline ────────────────────────────────────────────────────────────
// World: +x right, +y up. Origin = top crest.
// Upper flat goes LEFT from origin. Ramp descends RIGHT.

function buildRoad(c) {
  const { θ, Lr, Uf, Lf } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr);
  const rH = Lr * Math.sin(θr);
  return [
    [-Uf, 0],
    [0, 0],                  // top crest
    [rX, -rH],               // bottom of ramp
    [rX + Lf, -rH],          // end of lower flat
  ];
}

// ─── Transform car profile to world coords ────────────────────────────────────
// frontWX/WY = world position of front tire contact patch.
// θCar = car body angle. +θ = nose up, -θ = nose down, 0 = horizontal.

function carToWorld(profile, fx, fy, θCar) {
  const co = Math.cos(θCar), si = Math.sin(θCar);
  return profile.map(([lx, ly]) => [
    fx + lx * co - ly * si,
    fy + lx * si + ly * co,
  ]);
}

// ─── Road geometry helpers ────────────────────────────────────────────────────
// The ramp line passes through (0,0) and goes to (rX, -rH).
// Direction: (cos(θ), -sin(θ)).
// Perpendicular distance from a point (x,y) to the ramp line = |y*cos(θ) + x*sin(θ)|.
// Signed: positive = point is ABOVE the ramp line.
function perpToRamp(x, y, θ) {
  const θr = deg2rad(θ);
  return y * Math.cos(θr) + x * Math.sin(θr);
}

// ─── Four clearance checks ────────────────────────────────────────────────────
// Each check computes clearance in millimeters.
// Positive = clear, negative = collision.

function checkApproach(c) {
  // Front tire at crest (0,0), car horizontal. Front bumper extends forward (+x) on the ramp.
  // The front bumper bottom is at local (Of, Bf) where Bf = Of*tan(αa).
  // Ramp at x = Of: road_y = -Of * tan(θ).
  // Bumper at y = Bf = Of * tan(αa).
  // Clearance = bumper_y - road_y = Of*(tan(αa) + tan(θ)).
  // But the bumper might not be the lowest point. Check all profile points on the ramp.
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, 0, 0, 0);
  let minGap = Infinity;
  for (const [x, y] of world) {
    if (x > 0) { // point is on the ramp (past crest)
      const gap = perpToRamp(x, y, c.θ);
      if (gap < minGap) minGap = gap;
    } else { // point is on the upper flat
      const gap = y; // flat is at y=0
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

function checkBreakoverTop(c) {
  // Front tire on ramp, rear tire at crest (0,0). Worst case: rear at crest.
  // Car is tilted nose-down by θ.
  const { L, θ } = c;
  const θr = deg2rad(θ);
  const fx = L * Math.cos(θr);
  const fy = -L * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, fx, fy, -θr);
  let minGap = Infinity;
  for (const [x, y] of world) {
    if (x > 0) { // on the ramp
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) minGap = gap;
    } else { // on the upper flat
      const gap = y;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

function checkBreakoverBottom(c) {
  // Front tire at bottom crest on flat (rX, -rH). Rear tire still on ramp.
  // Car tilts nose-down because front is on the lower flat, rear on the ramp.
  // Car angle = -θ.
  const { L, h, θ, Lr } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr);
  const rH = Lr * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, rX, -rH, -θr);
  let minGap = Infinity;
  for (const [x, y] of world) {
    if (x <= rX + 50) { // on the ramp or at the crest
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) minGap = gap;
    } else { // on the lower flat
      const gap = y + rH; // flat is at y = -rH
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

function checkDeparture(c) {
  // Rear tire at bottom crest, car horizontal on lower flat.
  // Rear tire at (rX, -rH). Car angle = 0.
  const { L, θ, Lr } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr);
  const rH = Lr * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, rX + L, -rH, 0);
  let minGap = Infinity;
  for (const [x, y] of world) {
    if (x <= rX + 50) { // on the ramp
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) minGap = gap;
    } else { // on the lower flat
      const gap = y + rH;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

// ─── Run all checks ───────────────────────────────────────────────────────────
function runChecks(c) {
  return {
    approach:      { gap: checkApproach(c), label: 'Approach' },
    breakoverTop:  { gap: checkBreakoverTop(c), label: 'Top crest' },
    breakoverBot:  { gap: checkBreakoverBottom(c), label: 'Bottom belly' },
    departure:     { gap: checkDeparture(c), label: 'Departure' },
  };
}

// ─── Build car world points for rendering (with all data) ─────────────────────
function buildScenarios(c) {
  const { L, θ, Lr } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr);
  const rH = Lr * Math.sin(θr);
  const profile = buildCarProfile(c);

  // S1: approach. Front tire at (0,0), angle 0.
  const s1 = carToWorld(profile, 0, 0, 0);
  // S2: top breakover. Front tire at (L*cos(θ), -L*sin(θ)), angle -θ.
  const s2 = carToWorld(profile, L * Math.cos(θr), -L * Math.sin(θr), -θr);
  // S3: bottom breakover. Front tire at (rX, -rH), angle -θ (nose down).
  const s3 = carToWorld(profile, rX, -rH, -θr);
  // S4: departure. Front tire at (rX+L, -rH), angle 0.
  const s4 = carToWorld(profile, rX + L, -rH, 0);

  // Tire world positions (front axle contact, rear axle contact)
  const fa1 = [0, 0], ra1 = [-L, 0]; // local: front at (0,0), rear at (-L,0)
  const fa2 = [L * Math.cos(θr), -L * Math.sin(θr)], ra2 = [0, 0]; // rear at crest
  const fa3 = [rX, -rH], ra3 = [rX - L * Math.cos(θr), -rH + L * Math.sin(θr)];
  const fa4 = [rX + L, -rH], ra4 = [rX, -rH];

  return [
    { pts: s1, fa: fa1, ra: ra1 },
    { pts: s2, fa: fa2, ra: ra2 },
    { pts: s3, fa: fa3, ra: ra3 },
    { pts: s4, fa: fa4, ra: ra4 },
  ];
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

function render(c, results) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const road = buildRoad(c);
  const scenarios = buildScenarios(c);
  const scenarioKeys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const colors = ['#2196f3', '#ff9800', '#9c27b0', '#009688'];
  const gaps = scenarioKeys.map(k => results[k].gap);
  const worstIdx = gaps.indexOf(Math.min(...gaps));

  // Bounding box
  let bx1 = Infinity, bx2 = -Infinity, by1 = Infinity, by2 = -Infinity;
  const expand = ([x, y]) => {
    if (x < bx1) bx1 = x; if (x > bx2) bx2 = x;
    if (y < by1) by1 = y; if (y > by2) by2 = y;
  };
  road.forEach(expand);
  scenarios.forEach(s => s.pts.forEach(expand));

  const PAD = 90;
  const scale = Math.min(
    (W - 2 * PAD) / (bx2 - bx1 || 1),
    (H - 2 * PAD) / (by2 - by1 || 1)
  );
  const ox = PAD - bx1 * scale;
  const oy = H - PAD + by1 * scale;
  const tx = x => ox + x * scale;
  const ty = y => oy - y * scale;

  // Sky
  ctx.fillStyle = '#f0f4ff';
  ctx.fillRect(0, 0, W, H);

  // Ground fill
  ctx.beginPath();
  ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
  for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
  ctx.lineTo(tx(road[road.length - 1][0]), ty(by1 - 500));
  ctx.lineTo(tx(road[0][0]), ty(by1 - 500));
  ctx.closePath();
  ctx.fillStyle = '#c8d8b0';
  ctx.fill();

  // Road surface line
  ctx.beginPath();
  ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
  for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Ramp hatch lines
  {
    const [x0, y0] = road[1], [x1, y1] = road[2];
    const rd = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    if (rd > 1) {
      const n = Math.floor(rd / 1200);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const mx = x0 + t * (x1 - x0), my = y0 + t * (y1 - y0);
        const nx = -(y1 - y0) / rd, ny = (x1 - x0) / rd;
        ctx.beginPath();
        ctx.moveTo(tx(mx - nx * 400), ty(my - ny * 400));
        ctx.lineTo(tx(mx + nx * 400), ty(my + ny * 400));
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  // Ramp angle annotation
  {
    const [x0, y0] = road[1];
    const arcR = 60;
    ctx.save();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx(x0), ty(y0), arcR, Math.PI, Math.PI + deg2rad(c.θ));
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`θ=${c.θ.toFixed(1)}°`, tx(x0) - arcR - 40, ty(y0) + 14);
    ctx.restore();
  }

  // Draw scenarios
  for (let si = 0; si < scenarios.length; si++) {
    const { pts, fa, ra } = scenarios[si];
    const { gap } = results[scenarioKeys[si]];
    const fail = gap < 0;
    const worst = si === worstIdx;
    const color = fail ? '#d32f2f' : colors[si];

    if (!worst) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
      for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }

    ctx.save();
    // Fill car body
    const topY = Math.max(...pts.map(([, y]) => y)) + c.r + 80;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    ctx.lineTo(tx(pts[pts.length - 1][0]), ty(topY));
    ctx.lineTo(tx(pts[0][0]), ty(topY));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.fill();

    // Underside outline
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    ctx.stroke();

    // Wheels
    const screenR = c.r * scale;
    for (const [ax, ay] of [fa, ra]) {
      ctx.beginPath();
      ctx.arc(tx(ax), ty(ay), screenR, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.globalAlpha = 0.08;
      ctx.fill();
    }
    ctx.restore();
  }

  // Legend
  ctx.save();
  ctx.globalAlpha = 1;
  const lx = W - 165, ly = 15;
  for (let si = 0; si < scenarioKeys.length; si++) {
    const { gap, label } = results[scenarioKeys[si]];
    const fail = gap < 0;
    const y = ly + si * 20;
    ctx.fillStyle = fail ? '#d32f2f' : colors[si];
    ctx.fillRect(lx, y, 14, 10);
    ctx.fillStyle = '#222';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + 18, y + 10);
    ctx.fillStyle = fail ? '#d32f2f' : '#2e7d32';
    ctx.fillText(`${fail ? '' : '+'}${gap.toFixed(0)} mm`, lx + 105, y + 10);
  }
  ctx.restore();
}

// ─── Results panel ────────────────────────────────────────────────────────────
function updateResults(results) {
  const keys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const ids = ['chk-approach', 'chk-breakover-top', 'chk-breakover-bot', 'chk-departure'];
  const labels = ['Approach', 'Top crest', 'Bottom belly', 'Departure'];

  let allPass = true;
  keys.forEach((k, i) => {
    const gap = results[k].gap;
    const el = document.getElementById(ids[i]);
    const pass = gap >= 0;
    if (!pass) allPass = false;
    el.className = 'check-item ' + (pass ? 'ok' : (gap > -20 ? 'warn' : 'bad'));
    el.textContent = `${labels[i]}: ${pass ? '+' : ''}${gap.toFixed(0)} mm`;
  });

  const v = document.getElementById('verdict');
  v.className = 'verdict ' + (allPass ? 'pass' : 'fail');
  v.textContent = allPass ? 'PASS — Car clears the ramp' : 'FAIL — Collision detected';
}

// ─── Main update ──────────────────────────────────────────────────────────────
function update() {
  const c = readInputs();
  if (!c.θ || !c.L) return;
  const results = runChecks(c);
  render(c, results);
  updateResults(results);
  document.getElementById('slope-info').textContent =
    `Slope: ${c.θ.toFixed(2)}° (${degToGrade(c.θ).toFixed(1)}% grade)`;
}

// ─── Sync ramp angle ↔ grade ──────────────────────────────────────────────────
document.getElementById('rampAngle').addEventListener('input', e => {
  document.getElementById('rampGrade').value = degToGrade(parseFloat(e.target.value) || 0).toFixed(1);
  update();
});
document.getElementById('rampGrade').addEventListener('input', e => {
  document.getElementById('rampAngle').value = gradeToDeg(parseFloat(e.target.value) || 0).toFixed(2);
  update();
});

document.querySelectorAll('input[type=number]').forEach(el => {
  if (el.id !== 'rampAngle' && el.id !== 'rampGrade') el.addEventListener('input', update);
});

// ─── Canvas resize ────────────────────────────────────────────────────────────
function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  canvas.width = Math.max(600, wrap.clientWidth - 32);
  canvas.height = Math.max(300, wrap.clientHeight - 32);
  update();
}
window.addEventListener('resize', resizeCanvas);

// ─── Init ─────────────────────────────────────────────────────────────────────
resizeCanvas();
loadPreset('m3p_easy');
