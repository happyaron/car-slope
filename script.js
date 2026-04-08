'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const TIGHT_MM = 50; // gap < 50mm = tight warning even if passing

// ─── Presets ─────────────────────────────────────────────────────────────────
const PRESETS = {
  ramp_15: {
    mode: 'ramp',
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 15,
  },
  ramp_20: {
    mode: 'ramp',
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 20,
  },
  bump_100: {
    mode: 'bump',
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 20, rampGradeFall: 20, bumpHeight: 100, bumpWidth: 1000,
  },
  bump_150: {
    mode: 'bump',
    wheelbase: 2875, clearance: 138, frontOverhang: 840, rearOverhang: 978,
    approachAngle: 15, departureAngle: 16, breakoverAngle: 12, tireRadius: 340,
    rampGrade: 20, rampGradeFall: 20, bumpHeight: 150, bumpWidth: 1000,
  },
};

function loadPreset(key) {
  const p = PRESETS[key];
  if (p.mode) {
    document.getElementById(p.mode === 'bump' ? 'modeBump' : 'modeRamp').checked = true;
    syncModeUI();
  }
  for (const [id, val] of Object.entries(p)) {
    if (id === 'mode') continue;
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      if (id === 'rampGrade') {
        document.getElementById('rampAngle').value = gradeToDeg(val).toFixed(2);
      }
      if (id === 'rampGradeFall') {
        document.getElementById('rampAngleFall').value = gradeToDeg(val).toFixed(2);
      }
    }
  }
  update();
}

function syncModeUI() {
  const bump = document.getElementById('modeBump').checked;
  document.querySelectorAll('.ramp-only').forEach(el => el.style.display = bump ? 'none' : '');
  document.querySelectorAll('.bump-only').forEach(el => el.style.display = bump ? '' : 'none');
  document.getElementById('slopeLegend').textContent = bump ? 'Bump obstacle' : 'Ramp obstacle';
  if (bump) {
    // Default fall angle = rise angle for symmetric bump when switching modes
    const riseAngle = document.getElementById('rampAngle').value;
    const riseGrade = document.getElementById('rampGrade').value;
    if (!document.getElementById('rampAngleFall').value || document.getElementById('rampAngleFall').value === '0') {
      document.getElementById('rampAngleFall').value = riseAngle;
      document.getElementById('rampGradeFall').value = riseGrade;
    }
  }
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────
const deg2rad = d => d * Math.PI / 180;
const rad2deg = r => r * 180 / Math.PI;
const gradeToDeg = g => Math.atan(g / 100) * 180 / Math.PI;
const degToGrade = d => Math.tan(deg2rad(d)) * 100;

// ─── Read inputs ──────────────────────────────────────────────────────────────
function readInputs() {
  const v = id => parseFloat(document.getElementById(id).value) || 0;
  const mode = document.getElementById('modeBump').checked ? 'bump' : 'ramp';
  const base = {
    L:   v('wheelbase'),
    h:   v('clearance'),
    Of:  v('frontOverhang'),
    Or:  v('rearOverhang'),
    αa:  v('approachAngle'),
    αd:  v('departureAngle'),
    αb:  v('breakoverAngle'),
    r:   v('tireRadius'),
    θ:   v('rampAngle'),
    mode,
  };
  // Lengths are auto-computed from car geometry — they only affect canvas display,
  // not any clearance calculation (all length terms cancel in the perp-distance algebra).
  base.Uf = base.L + 3000;            // flat before obstacle: wheelbase + 3m margin
  base.Lf = base.L + base.Or + 2000;  // flat after obstacle: wheelbase + rear overhang + 2m

  if (mode === 'bump') {
    base.bH = v('bumpHeight');
    base.bW = v('bumpWidth');
    const fallAngle = v('rampAngleFall');
    base.θf = fallAngle > 0 ? fallAngle : base.θ; // fall angle, defaults to rise angle (symmetric)
  } else {
    // Ramp length: at least 8m horizontal run or 2× wheelbase, expressed along slope
    base.Lr = Math.max(base.L * 2, 8000) / Math.cos(deg2rad(base.θ));
  }
  return base;
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

// ─── Bump offset helper ──────────────────────────────────────────────────────
// Returns the x-offset for the bump rise base, so upper flat starts at x=-3000.
function bumpOx(c) { return -3000 + c.Uf; }

// ─── Road polyline ────────────────────────────────────────────────────────────
// World: +x right, +y up. Origin = transition point.
// Ramp: origin at top crest, ramp descends RIGHT.
// Bump: origin at base of rise, bump rises RIGHT.

function buildRoad(c) {
  if (c.mode === 'bump') {
    const { θ, θf, bH, bW, Lf } = c;
    const rXrise = bH / Math.tan(deg2rad(θ));
    const rXfall = bH / Math.tan(deg2rad(θf));
    const ox = bumpOx(c);
    return [
      [-3000, 0],                                    // upper flat (shifted)
      [ox, 0],                                       // base of rise
      [ox + rXrise, bH],                             // front edge of bump top
      [ox + rXrise + bW, bH],                        // rear edge of bump top
      [ox + rXrise + bW + rXfall, 0],                // back to ground level
      [ox + rXrise + bW + rXfall + Lf, 0],           // lower flat
    ];
  }
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

// Projects a point onto the ramp line and returns the road-side point.
function closestOnRamp(x, y, θ) {
  const θr = deg2rad(θ);
  const t = x * Math.cos(θr) - y * Math.sin(θr);
  return [t * Math.cos(θr), -t * Math.sin(θr)];
}

// For a RISE face (going UP at angle θ): direction (cos θ, +sin θ).
// Signed distance positive = above the rise face.
function perpToRise(x, y, θ) {
  const θr = deg2rad(θ);
  return y * Math.cos(θr) - x * Math.sin(θr);
}

function closestOnRise(x, y, θ) {
  const θr = deg2rad(θ);
  const t = x * Math.cos(θr) + y * Math.sin(θr);
  return [t * Math.cos(θr), t * Math.sin(θr)];
}

// Distance above a flat segment at height y0
function perpToFlat(x, y, y0) {
  return y - y0;
}

// ─── Four clearance checks ────────────────────────────────────────────────────
// Each returns { gap, carPt, roadPt } where carPt/roadPt mark the tightest spot.
// Positive gap = clear, negative = collision.

function checkApproach(c) {
  const profile = buildCarProfile(c);

  if (c.mode === 'bump') {
    const { θ, bH, bW } = c;
    const rX = bH / Math.tan(deg2rad(θ));
    const ox = bumpOx(c);
    const riseBase = ox;
    const world = carToWorld(profile, riseBase, 0, 0);
    let minGap = Infinity, carPt = null, roadPt = null;
    for (const [x, y] of world) {
      if (x >= riseBase && x < riseBase + rX) {
        const dx = x - riseBase;
        const gap = perpToRise(dx, y, θ);
        const rp = closestOnRise(dx, y, θ);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + riseBase, rp[1]]; }
      } else if (x >= riseBase + rX) {
        const gap = y - bH;
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, bH]; }
      } else {
        if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
      }
    }
    return { gap: minGap, carPt, roadPt };
  }

  const world = carToWorld(profile, 0, 0, 0);
  let minGap = Infinity, carPt = null, roadPt = null;
  for (const [x, y] of world) {
    if (x > 0) {
      const gap = perpToRamp(x, y, c.θ);
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = closestOnRamp(x, y, c.θ); }
    } else {
      if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
    }
  }
  return { gap: minGap, carPt, roadPt };
}

function checkBreakoverTop(c) {
  if (c.mode === 'bump') {
    // Front tire on bump top, rear tire at base of rise. Car angle = +θ (nose up).
    const { L, θ, bH, bW } = c;
    const rX = bH / Math.tan(deg2rad(θ));
    const θr = deg2rad(θ);
    const ox = bumpOx(c);
    const riseBase = ox;
    const profile = buildCarProfile(c);
    const fa2 = [riseBase + L * Math.cos(θr), L * Math.sin(θr)];
    const world = carToWorld(profile, fa2[0], fa2[1], θr);
    const riseEnd = riseBase + rX;
    const bumpEnd = riseEnd + bW;
    let minGap = Infinity, carPt = null, roadPt = null;
    for (const [x, y] of world) {
      if (x >= riseBase && x < riseEnd) {
        const dx = x - riseBase;
        const gap = perpToRise(dx, y, θ);
        const rp = closestOnRise(dx, y, θ);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + riseBase, rp[1]]; }
      } else if (x >= riseEnd && x <= bumpEnd) {
        const gap = y - bH;
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, bH]; }
      } else {
        if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
      }
    }
    return { gap: minGap, carPt, roadPt };
  }

  // Ramp mode (unchanged)
  const { L, θ } = c;
  const θr = deg2rad(θ);
  const fx = L * Math.cos(θr), fy = -L * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, fx, fy, -θr);
  let minGap = Infinity, carPt = null, roadPt = null;
  for (const [x, y] of world) {
    if (x > 0) {
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = closestOnRamp(x, y, θ); }
    } else {
      if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
    }
  }
  return { gap: minGap, carPt, roadPt };
}

function checkBreakoverBottom(c) {
  if (c.mode === 'bump') {
    // Front tire at fall base (fallEnd, 0), rear tire on upper flat.
    // Both tires at y=0, car horizontal, bump rises between them.
    const { L, θ, θf, bH, bW } = c;
    const rXrise = bH / Math.tan(deg2rad(θ));
    const rXfall = bH / Math.tan(deg2rad(θf));
    const ox = bumpOx(c);
    const riseBase = ox;
    const riseEnd = riseBase + rXrise;
    const fallTopX = riseEnd + bW;
    const fallEnd = fallTopX + rXfall;
    const profile = buildCarProfile(c);
    const world = carToWorld(profile, fallEnd, 0, 0);
    let minGap = Infinity, carPt = null, roadPt = null;
    for (const [x, y] of world) {
      if (x >= riseEnd && x <= fallTopX) {
        const gap = y - bH;
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, bH]; }
      } else if (x > fallTopX && x <= fallEnd) {
        // fall face: perpendicular distance to descent from (fallTopX, bH)
        const dx = x - fallTopX, dy = y - bH;
        const gap = perpToRamp(dx, dy, θf);
        const rp = closestOnRamp(dx, dy, θf);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + fallTopX, rp[1] + bH]; }
      } else if (x > fallEnd) {
        if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
      } else if (x >= riseBase && x < riseEnd) {
        const dx = x - riseBase;
        const gap = perpToRise(dx, y, θ);
        const rp = closestOnRise(dx, y, θ);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + riseBase, rp[1]]; }
      } else {
        if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
      }
    }
    return { gap: minGap, carPt, roadPt };
  }

  // Ramp mode (unchanged)
  const { L, θ, Lr } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr), rH = Lr * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, rX, -rH, -θr);
  let minGap = Infinity, carPt = null, roadPt = null;
  for (const [x, y] of world) {
    if (x <= rX + 50) {
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = closestOnRamp(x, y, θ); }
    } else {
      const gap = y + rH;
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, -rH]; }
    }
  }
  return { gap: minGap, carPt, roadPt };
}

function checkDeparture(c) {
  if (c.mode === 'bump') {
    // Rear tire at fall base (fallEnd, 0), car on lower flat. Car angle = 0.
    const { L, θ, θf, bH, bW } = c;
    const rXrise = bH / Math.tan(deg2rad(θ));
    const rXfall = bH / Math.tan(deg2rad(θf));
    const ox = bumpOx(c);
    const riseBase = ox;
    const riseEnd = riseBase + rXrise;
    const fallTopX = riseEnd + bW;
    const fallEnd = fallTopX + rXfall;
    const profile = buildCarProfile(c);
    const world = carToWorld(profile, fallEnd + L, 0, 0);
    let minGap = Infinity, carPt = null, roadPt = null;
    for (const [x, y] of world) {
      if (x > fallTopX && x <= fallEnd) {
        // fall face: perpendicular distance to descent from (fallTopX, bH)
        const dx = x - fallTopX, dy = y - bH;
        const gap = perpToRamp(dx, dy, θf);
        const rp = closestOnRamp(dx, dy, θf);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + fallTopX, rp[1] + bH]; }
      } else if (x >= riseEnd && x <= fallTopX) {
        const gap = y - bH;
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, bH]; }
      } else if (x >= riseBase && x < riseEnd) {
        const dx = x - riseBase;
        const gap = perpToRise(dx, y, θ);
        const rp = closestOnRise(dx, y, θ);
        if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [rp[0] + riseBase, rp[1]]; }
      } else {
        if (y < minGap) { minGap = y; carPt = [x, y]; roadPt = [x, 0]; }
      }
    }
    return { gap: minGap, carPt, roadPt };
  }

  // Ramp mode (unchanged)
  const { L, θ, Lr } = c;
  const θr = deg2rad(θ);
  const rX = Lr * Math.cos(θr), rH = Lr * Math.sin(θr);
  const profile = buildCarProfile(c);
  const world = carToWorld(profile, rX + L, -rH, 0);
  let minGap = Infinity, carPt = null, roadPt = null;
  for (const [x, y] of world) {
    if (x <= rX + 50) {
      const gap = perpToRamp(x, y, θ);
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = closestOnRamp(x, y, θ); }
    } else {
      const gap = y + rH;
      if (gap < minGap) { minGap = gap; carPt = [x, y]; roadPt = [x, -rH]; }
    }
  }
  return { gap: minGap, carPt, roadPt };
}

// ─── Run all checks ───────────────────────────────────────────────────────────
function runChecks(c) {
  return {
    approach:      { ...checkApproach(c), label: 'Front bumper vs ramp' },
    breakoverTop:  { ...checkBreakoverTop(c), label: 'Belly vs top crest' },
    breakoverBot:  { ...checkBreakoverBottom(c), label: 'Belly vs bottom' },
    departure:     { ...checkDeparture(c), label: 'Rear bumper vs ramp' },
  };
}

// ─── Build car world points for rendering (with all data) ─────────────────────
function buildScenarios(c) {
  const { L, θ } = c;
  const θr = deg2rad(θ);
  const profile = buildCarProfile(c);

  if (c.mode === 'bump') {
    const { bH, bW, θf } = c;
    const rXrise = bH / Math.tan(θr);
    const rXfall = bH / Math.tan(deg2rad(θf));
    const ox = bumpOx(c);
    const riseBase = ox;
    const fallEnd = ox + rXrise + bW + rXfall; // bottom of fall face (road[4])

    // S1: approach. Front tire at rise base, angle 0.
    const s1 = carToWorld(profile, riseBase, 0, 0);
    const fa1 = [riseBase, 0], ra1 = [riseBase - L, 0];

    // S2: top breakover. Rear tire at rise base, front tire on rise, nose up.
    const fa2 = [riseBase + L * Math.cos(θr), L * Math.sin(θr)], ra2 = [riseBase, 0];
    const s2 = carToWorld(profile, fa2[0], fa2[1], θr);

    // S3: bottom breakover. Front tire at fall base (fallEnd), rear tire on upper flat.
    const s3 = carToWorld(profile, fallEnd, 0, 0);
    const fa3 = [fallEnd, 0], ra3 = [fallEnd - L, 0];

    // S4: departure. Rear tire at fall base (fallEnd), front ahead, angle 0.
    const s4 = carToWorld(profile, fallEnd + L, 0, 0);
    const fa4 = [fallEnd + L, 0], ra4 = [fallEnd, 0];

    return [
      { pts: s1, fa: fa1, ra: ra1 },
      { pts: s2, fa: fa2, ra: ra2 },
      { pts: s3, fa: fa3, ra: ra3 },
      { pts: s4, fa: fa4, ra: ra4 },
    ];
  }

  // Ramp mode (unchanged)
  const { Lr } = c;
  const rX = Lr * Math.cos(θr);
  const rH = Lr * Math.sin(θr);

  const s1 = carToWorld(profile, 0, 0, 0);
  const s2 = carToWorld(profile, L * Math.cos(θr), -L * Math.sin(θr), -θr);
  const s3 = carToWorld(profile, rX, -rH, -θr);
  const s4 = carToWorld(profile, rX + L, -rH, 0);

  const fa1 = [0, 0], ra1 = [-L, 0];
  const fa2 = [L * Math.cos(θr), -L * Math.sin(θr)], ra2 = [0, 0];
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
  const W = parseFloat(canvas.style.width) || canvas.width;
  const H = parseFloat(canvas.style.height) || canvas.height;
  ctx.clearRect(0, 0, W, H);

  const road = buildRoad(c);
  const scenarios = buildScenarios(c);
  const scenarioKeys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const colors = ['#1976d2', '#e65100', '#7b1fa2', '#00796b'];
  const gaps = scenarioKeys.map(k => results[k].gap);
  const worstIdx = gaps.indexOf(Math.min(...gaps));

  // Bounding box: left edge tracks road start with a fixed margin; total width is
  // constant across modes so the car renders at the same scale in both.
  const bumpMode = c.mode === 'bump';
  const BOX_W = 26500; // fixed world width — determines car scale
  const bx1 = road[0][0] - 500; // 500mm margin to the left of road start
  const bx2 = bx1 + BOX_W;
  const by1 = bumpMode ? -1500 : -6500;
  const by2 = 1200;

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
  ctx.lineTo(tx(road[road.length - 1][0]), ty(by1));
  ctx.lineTo(tx(road[0][0]), ty(by1));
  ctx.closePath();
  ctx.fillStyle = '#c8d8b0';
  ctx.fill();

  // Bump fill (above ground)
  if (c.mode === 'bump') {
    ctx.beginPath();
    ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
    for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
    ctx.lineTo(tx(road[road.length - 1][0]), ty(0));
    ctx.lineTo(tx(road[0][0]), ty(0));
    ctx.closePath();
    ctx.fillStyle = '#d8ccb0';
    ctx.fill();
  }

  // Road surface line
  ctx.beginPath();
  ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
  for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Hatch lines on sloped faces
  function drawHatch(x0, y0, x1, y1) {
    const rd = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    if (rd < 1) return;
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

  if (c.mode === 'bump') {
    // Hatch the rise (road[1]→road[2]) and fall (road[3]→road[4]) faces
    drawHatch(road[1][0], road[1][1], road[2][0], road[2][1]);
    drawHatch(road[3][0], road[3][1], road[4][0], road[4][1]);
  } else {
    drawHatch(road[1][0], road[1][1], road[2][0], road[2][1]);
  }

  // Grade annotation — arc at the transition point(s)
  {
    const arcR = 60;
    ctx.save();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui';

    if (c.mode === 'bump') {
      // Rise arc at road[1] — upward from horizontal (counterclockwise)
      const [rx0, ry0] = road[1];
      ctx.beginPath();
      ctx.arc(tx(rx0), ty(ry0), arcR, Math.PI, Math.PI - deg2rad(c.θ), true);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(`${degToGrade(c.θ).toFixed(1)}% rise`, tx(rx0) - arcR - 4, ty(ry0) + 14);

      // Fall arc at road[3] — downward from horizontal (clockwise in screen coords)
      const [fx0, fy0] = road[3];
      ctx.beginPath();
      ctx.arc(tx(fx0), ty(fy0), arcR, 0, deg2rad(c.θf));
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(`${degToGrade(c.θf).toFixed(1)}% fall`, tx(fx0) + arcR + 4, ty(fy0) + 14);
    } else {
      const [x0, y0] = road[1];
      ctx.beginPath();
      ctx.arc(tx(x0), ty(y0), arcR, Math.PI, Math.PI + deg2rad(c.θ));
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(`${degToGrade(c.θ).toFixed(1)}% grade`, tx(x0) - arcR - 40, ty(y0) + 14);
    }
    ctx.restore();
  }

  // Length annotation
  {
    if (c.mode === 'bump') {
      // Place bump dimensions to the right of the fall, below ground line
      const { θ, θf, bH } = c;
      const rXrise = bH / Math.tan(deg2rad(θ));
      const rXfall = bH / Math.tan(deg2rad(θf));
      const riseFaceLen = Math.sqrt(rXrise * rXrise + bH * bH);
      const fallFaceLen = Math.sqrt(rXfall * rXfall + bH * bH);
      const fallEnd = road[4][0];
      const labelX = fallEnd + 800;
      ctx.save();
      ctx.fillStyle = '#555';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`height = ${(c.bH / 1000).toFixed(2)} m,  width = ${(c.bW / 1000).toFixed(1)} m`, tx(labelX), ty(0) + 20);
      if (Math.abs(riseFaceLen - fallFaceLen) < 1) {
        ctx.fillText(`rise = fall length = ${(riseFaceLen / 1000).toFixed(2)} m`, tx(labelX), ty(0) + 36);
      } else {
        ctx.fillText(`rise length = ${(riseFaceLen / 1000).toFixed(2)} m`, tx(labelX), ty(0) + 36);
        ctx.fillText(`fall length = ${(fallFaceLen / 1000).toFixed(2)} m`, tx(labelX), ty(0) + 50);
      }
      ctx.restore();
    } else {
      // Mirror the "travel direction" arrow position: same x on the upper flat,
      // but below the road surface line (into the ground fill).
      const flatMidX = road[0][0] + (road[1][0] - road[0][0]) * 0.15;
      const anchorCx = tx(flatMidX);
      const anchorCy = ty(road[0][1]);
      ctx.save();
      ctx.fillStyle = '#555';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`L = ${(c.Lr / 1000).toFixed(1)} m`, anchorCx, anchorCy + 18);
      ctx.restore();
    }
  }

  // Short names used in left panel and results bar
  const shortLabels = ['Front bumper', 'Belly (top)', 'Belly (bottom)', 'Rear bumper'];
  // Descriptive texts shown near the car/ramp on canvas
  const descLabels = c.mode === 'bump' ? [
    'front bumper hits rise',
    'belly clears bump top',
    'belly clears fall face',
    'rear bumper clears fall',
  ] : [
    'front bumper approaches crest',
    'belly clears top crest',
    'belly clears bottom edge',
    'rear bumper leaves ramp',
  ];

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

      // Descriptive label near each ghost car — adjusted to avoid collisions:
      //   S1 when S2 is also a ghost (worst=S3/S4): nudge left ~44px so it
      //     doesn't crowd "belly clears top crest" which sits just to its right.
      //   S2: fixed -28px vertical offset to clear the solid car's REAR label.
      //   S3 when S4 is also a ghost (worst=S1/S2): anchor at rear bumper so the
      //     label lands near the ramp top, away from S4's lower-flat label.
      const anchorPt = (si === 2 && worstIdx <= 1) ? pts[pts.length - 1] : pts[0];
      const [fx, fy] = anchorPt;
      const xNudge = (si === 0 && worstIdx >= 2) ? -44 : 0;
      const yOff = si === 1 ? -28 : -10;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = color;
      ctx.font = 'italic 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(descLabels[si], tx(fx) + xNudge, ty(fy) + yOff);
      ctx.restore();
      continue;
    }

    ctx.save();
    // Worst car drawn in neutral gray — the callout labels carry the per-scenario colors
    const carColor = '#444';
    // Fill car body
    const topY = Math.max(...pts.map(([, y]) => y)) + c.r + 80;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    ctx.lineTo(tx(pts[pts.length - 1][0]), ty(topY));
    ctx.lineTo(tx(pts[0][0]), ty(topY));
    ctx.closePath();
    ctx.fillStyle = carColor;
    ctx.globalAlpha = 0.08;
    ctx.fill();

    // Underside outline
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = carColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    ctx.stroke();

    // Wheels
    const screenR = c.r * scale;
    for (const [ax, ay] of [fa, ra]) {
      ctx.beginPath();
      ctx.arc(tx(ax), ty(ay), screenR, 0, Math.PI * 2);
      ctx.strokeStyle = carColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.globalAlpha = 0.06;
      ctx.fill();
    }

    // Descriptive label near the worst car — use scenario color (matches left panel)
    {
      const [fx2, fy2] = pts[0];
      const { gap: wGap } = results[scenarioKeys[worstIdx]];
      const wFail = wGap < 0;
      const wTight = !wFail && wGap < TIGHT_MM;
      const descColor = wFail ? '#d32f2f' : wTight ? '#e69500' : colors[worstIdx];
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = descColor;
      ctx.font = 'italic 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(descLabels[worstIdx], tx(fx2), ty(fy2) - 28);
    }

    ctx.restore();
  }

  // Direction arrow on the worst-scenario car (FRONT / REAR labels)
  {
    const { pts, fa, ra } = scenarios[worstIdx];
    const color = '#555';
    // Car front = P0 (index 0), rear = P4 (index 4)
    const [fx, fy] = pts[0]; // front bumper bottom
    const [rx, ry] = pts[pts.length - 1]; // rear bumper bottom

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';

    // "FRONT" label above P0
    ctx.fillStyle = color;
    ctx.fillText('FRONT', tx(fx), ty(fy) - 12);
    // small arrow pointing at P0
    ctx.beginPath();
    ctx.moveTo(tx(fx), ty(fy) - 8);
    ctx.lineTo(tx(fx) - 4, ty(fy) - 2);
    ctx.lineTo(tx(fx) + 4, ty(fy) - 2);
    ctx.closePath();
    ctx.fill();

    // "REAR" label above P4
    ctx.fillText('REAR', tx(rx), ty(ry) - 12);
    ctx.beginPath();
    ctx.moveTo(tx(rx), ty(ry) - 8);
    ctx.lineTo(tx(rx) - 4, ty(ry) - 2);
    ctx.lineTo(tx(rx) + 4, ty(ry) - 2);
    ctx.closePath();
    ctx.fill();

    // Travel direction arrow — anchored to the road surface in the lower-left
    // of the road canvas area: placed on the upper flat, 60% of the way to
    // the first obstacle transition, sitting just above the road surface line.
    {
      const flatMidX = road[0][0] + (road[1][0] - road[0][0]) * 0.15;
      const anchorCx = tx(flatMidX);
      const anchorCy = ty(road[0][1]); // road[0][1] is 0 (flat surface)
      const arrowLen = 56;
      const arrowX1 = anchorCx - arrowLen / 2;
      const arrowX2 = anchorCx + arrowLen / 2;
      const arrowY = anchorCy - 10;

      ctx.strokeStyle = '#888';
      ctx.fillStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(arrowX1, arrowY);
      ctx.lineTo(arrowX2, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX2, arrowY);
      ctx.lineTo(arrowX2 - 7, arrowY - 4);
      ctx.lineTo(arrowX2 - 7, arrowY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('travel direction', anchorCx, arrowY - 8);
    }

    ctx.restore();
  }

  // ─── Clearance callout annotations ──────────────────────────────────────────
  // Labels are arranged in a vertical column at the top-left of the canvas.
  // Each label has a small colored dot, the scenario name, clearance value,
  // and an elbow leader line to the measurement point on the car/road.
  // This avoids text congestion near the car silhouette.

  {
    const LABEL_FONT = '11px system-ui';
    const LABEL_FONT_BOLD = 'bold 11px system-ui';
    const ROW_H = 22;
    const COL_X = 12;
    const DOT_R = 4;

    // Pre-measure label width for background
    ctx.font = LABEL_FONT;
    const allLabels = scenarioKeys.map((k, i) => {
      const r = results[k];
      return shortLabels[i] + ' ' + (r.gap < 0 ? '' : '+') + r.gap.toFixed(0) + 'mm';
    });
    const maxLabelW = Math.max(...allLabels.map(t => ctx.measureText(t).width));
    const bgW = maxLabelW + DOT_R * 2 + 28;
    const bgH = scenarioKeys.length * ROW_H + 12;

    // Semi-transparent background panel for the labels
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    const bgX = 4, bgY = 6;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bgX, bgY, bgW, bgH, 5);
    } else {
      const r = 5;
      ctx.moveTo(bgX + r, bgY);
      ctx.arcTo(bgX + bgW, bgY, bgX + bgW, bgY + bgH, r);
      ctx.arcTo(bgX + bgW, bgY + bgH, bgX, bgY + bgH, r);
      ctx.arcTo(bgX, bgY + bgH, bgX, bgY, r);
      ctx.arcTo(bgX, bgY, bgX + bgW, bgY, r);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    for (let si = 0; si < scenarioKeys.length; si++) {
      const key = scenarioKeys[si];
      const { gap, carPt, roadPt, label } = results[key];
      if (!carPt || !roadPt) continue;

      const fail = gap < 0;
      const tight = !fail && gap < TIGHT_MM;
      const markColor = fail ? '#d32f2f' : tight ? '#e69500' : colors[si];

      // Label row position — center dot and text vertically within the row
      const rowY = bgY + 6 + si * ROW_H + ROW_H / 2;
      const dotX = COL_X + DOT_R + 2;
      const textX = COL_X + DOT_R * 2 + 8;
      const textY = rowY;

      // Colored dot
      ctx.beginPath();
      ctx.arc(dotX, textY, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = markColor;
      ctx.fill();

      // Text
      ctx.font = LABEL_FONT_BOLD;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = markColor;
      const gapText = (fail ? '' : '+') + gap.toFixed(0) + 'mm';
      ctx.fillText(shortLabels[si] + ' ' + gapText, textX, textY);

      // Leader line: elbow from label area out to the measurement spot
      const sx = tx(carPt[0]), sy = ty(carPt[1]);
      const ex = tx(roadPt[0]), ey = ty(roadPt[1]);

      // Measurement dot on the car point
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = markColor;
      ctx.fill();

      // Elbow leader: from right edge of label panel → horizontally to
      // above the measurement point → down to the dot
      const anchorX = bgX + bgW + 6;
      const anchorY = textY;
      ctx.save();
      ctx.strokeStyle = markColor;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(sx, anchorY);   // horizontal arm
      ctx.lineTo(sx, sy);        // vertical arm down to dot
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Dimension line between car point and road point
      ctx.save();
      ctx.strokeStyle = markColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Tick mark at road point
      ctx.save();
      ctx.strokeStyle = markColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55;
      const segLen = 12;
      const onFlat = Math.abs(roadPt[0] - carPt[0]) < 1;
      ctx.beginPath();
      if (onFlat) {
        ctx.moveTo(ex - segLen, ey);
        ctx.lineTo(ex + segLen, ey);
      } else {
        const θr = deg2rad(c.θ);
        ctx.moveTo(ex - segLen * Math.cos(θr), ey + segLen * Math.sin(θr));
        ctx.lineTo(ex + segLen * Math.cos(θr), ey - segLen * Math.sin(θr));
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ─── Results panel ────────────────────────────────────────────────────────────
function updateResults(results, c) {
  const keys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const ids = ['chk-approach', 'chk-breakover-top', 'chk-breakover-bot', 'chk-departure'];
  const labels = ['Front bumper', 'Belly (top)', 'Belly (bottom)', 'Rear bumper'];
  const obstacle = (c && c.mode === 'bump') ? 'bump' : 'ramp';

  let allPass = true;
  let anyTight = false;
  keys.forEach((k, i) => {
    const gap = results[k].gap;
    const el = document.getElementById(ids[i]);
    const pass = gap >= 0;
    const tight = pass && gap < TIGHT_MM;
    if (!pass) allPass = false;
    if (tight) anyTight = true;
    el.className = 'check-item ' + (!pass ? 'bad' : tight ? 'warn' : 'ok');
    el.textContent = `${labels[i]}: ${pass ? '+' : ''}${gap.toFixed(0)} mm`;
  });

  const v = document.getElementById('verdict');
  if (!allPass) {
    v.className = 'verdict fail';
    v.textContent = `FAIL — Collision with ${obstacle}`;
  } else if (anyTight) {
    v.className = 'verdict tight';
    v.textContent = 'PASS — but margins are tight';
  } else {
    v.className = 'verdict pass';
    v.textContent = `PASS — Car clears the ${obstacle}`;
  }
}

// ─── Main update ──────────────────────────────────────────────────────────────
function update() {
  const c = readInputs();
  if (!c.θ || !c.L) return;
  const results = runChecks(c);
  render(c, results);
  updateResults(results, c);
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

// ─── Sync fall angle ↔ fall grade ────────────────────────────────────────────
document.getElementById('rampAngleFall').addEventListener('input', e => {
  document.getElementById('rampGradeFall').value = degToGrade(parseFloat(e.target.value) || 0).toFixed(1);
  update();
});
document.getElementById('rampGradeFall').addEventListener('input', e => {
  document.getElementById('rampAngleFall').value = gradeToDeg(parseFloat(e.target.value) || 0).toFixed(2);
  update();
});

document.querySelectorAll('input[type=number]').forEach(el => {
  if (!['rampAngle', 'rampGrade', 'rampAngleFall', 'rampGradeFall'].includes(el.id))
    el.addEventListener('input', update);
});

// ─── Mode toggle ──────────────────────────────────────────────────────────────
document.querySelectorAll('input[name=mode]').forEach(el => {
  el.addEventListener('change', () => { syncModeUI(); update(); });
});

// ─── Canvas resize ────────────────────────────────────────────────────────────
// Size canvas once on load; subsequent updates only redraw without changing
// canvas dimensions so the visual outline stays stable.
let canvasSized = false;
function sizeCanvas() {
  if (canvasSized) return;
  const wrap = document.getElementById('canvas-wrap');
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(600, wrap.clientWidth - 32);
  const cssH = Math.max(300, wrap.clientHeight - 32);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.scale(dpr, dpr);
  canvasSized = true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
sizeCanvas();
syncModeUI();
loadPreset('ramp_15');
