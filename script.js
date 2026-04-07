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
const deg = d => d * Math.PI / 180;
const gradeToDeg = g => Math.atan(g / 100) * 180 / Math.PI;
const degToGrade = d => Math.tan(deg(d)) * 100;

// ─── Read inputs ──────────────────────────────────────────────────────────────
function readInputs() {
  const v = id => parseFloat(document.getElementById(id).value) || 0;
  return {
    wheelbase:      v('wheelbase'),
    h:              v('clearance'),
    Of:             v('frontOverhang'),
    Or:             v('rearOverhang'),
    αa:             v('approachAngle'),
    αd:             v('departureAngle'),
    αb:             v('breakoverAngle'),
    r:              v('tireRadius'),
    θ:              v('rampAngle'),
    rampLength:     v('rampLength'),
    upperFlat:      v('upperFlat'),
    lowerFlat:      v('lowerFlat'),
  };
}

// ─── Car underside polyline ───────────────────────────────────────────────────
// Returns array of {x, y} in car-local coordinates.
// Origin = centre of rear axle projected down to road plane, +x = forward.
// y = height above local road surface under the car.
// The car sits with axles at height `r` (tire radius) above the road.
// We model the *underside* profile only (the part that can scrape).
//
// Points from front to rear:
//  P0: front bumper bottom = (Of, h_bumperFront)
//  P1: front approach ramp meets belly = (Of - h*cot(αa), h)
//  P2: belly nadir (lowest point of breakover V) = midpoint between axles
//  P3: rear approach ramp meets belly = (-Or + h*cot(αd), h)   [x from rear axle]
//  P4: rear bumper bottom = (-Or, h_bumperRear)
//
// The front bumper height: the approach angle starts from bumper bottom and
// rises to the belly. So bumper_y = h - Of * tan(αa) … but that could go
// negative. In practice bumper_y = 0 (touches ground at worst); we keep it
// physical by: bumper_y = max(0, h - Of*tan(αa)).
//
// Actually the approach angle definition: the angle between the ground and a
// line from the lowest front point of the car to the front tyre contact patch.
// So the bumper height = 0 and the angle is arctan(h / horizontal).
// We honour the user's entered αa / αd as the angles, and compute from them.
//
// Breakover belly nadir: standard definition = angle between two lines from
// each axle bottom to the belly lowest point. Half-angle = αb/2.
// Nadir x = midpoint of wheelbase from front axle = L/2 (from front axle),
// nadir y = h (already the chassis clearance — user entered h is the min)
// The breakover half-angle gives: tan(αb/2) = h_drop / (L/2)
// where h_drop = (r - h_axle) ... Actually we just use h directly as the belly
// height and trust the breakover angle for the worst-case span check.
//
// For simplicity we represent the underside as 5 points and use geometry
// relative to the FRONT axle contact patch on the road = (0,0).

function buildCarProfile(c) {
  const { wheelbase: L, h, Of, Or, αa, αd, αb, r } = c;

  // x axis: positive = forward (toward front of car)
  // Front axle at x=0, rear axle at x=-L
  // Tire contact patches at y=0

  // Front bumper bottom x = Of (ahead of front axle)
  const fbx = Of;
  const fby = Math.max(0, h - Of * Math.tan(deg(αa)));   // usually ~0

  // Approach ramp ends at belly height h
  const p1x = Of - h / Math.tan(deg(αa));   // x where ramp meets flat belly
  const p1y = h;

  // Breakover nadir: at x = -L/2 (midpoint between axles from front axle perspective)
  // nadir y = h (ground clearance is the lowest point by definition)
  const midx = -L / 2;
  const midy = h;

  // Departure ramp starts at belly height h, going toward rear
  const p3x = -L - (Or - h / Math.tan(deg(αd)));  // mirrored
  const p3y = h;

  // Rear bumper bottom
  const rbx = -L - Or;
  const rby = Math.max(0, h - Or * Math.tan(deg(αd)));

  // Return: array of [x, y] from front to rear
  return [
    [fbx, fby],
    [p1x, p1y],
    [midx, midy],
    [p3x, p3y],
    [rbx, rby],
  ];
}

// ─── Road profile ─────────────────────────────────────────────────────────────
// Returns array of [x, y] world points (mm), left to right.
// Origin = top crest (where upper flat meets ramp).
function buildRoad(c) {
  const { θ, rampLength, upperFlat, lowerFlat } = c;
  const θr = deg(θ);
  const rampH = rampLength * Math.sin(θr);
  const rampX = rampLength * Math.cos(θr);

  return [
    [-upperFlat, 0],           // left end of upper flat
    [0, 0],                    // top crest
    [rampX, -rampH],           // bottom of ramp
    [rampX + lowerFlat, -rampH], // right end of lower flat
  ];
}

// ─── Point-to-segment closest distance helper ─────────────────────────────────
// Returns signed clearance: positive = above segment, negative = below.
function pointAboveSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return py - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  // Normal direction: perpendicular to segment, pointing "up" (left-hand normal for +x direction)
  // For a road going down-right, the normal pointing upward is (-dy, dx) normalised.
  const segLen = Math.sqrt(len2);
  const nx2 = -dy / segLen, ny2 = dx / segLen; // unit left-hand normal
  const rel = (px - nx) * nx2 + (py - ny) * ny2;
  return rel;
}

// ─── Minimum clearance between car profile and road profile ──────────────────
// car points are in world coords. road is the road polyline.
function minClearance(carPts, roadSegs) {
  let minGap = Infinity;
  for (const [cx, cy] of carPts) {
    for (let i = 0; i < roadSegs.length - 1; i++) {
      const [ax, ay] = roadSegs[i];
      const [bx, by] = roadSegs[i + 1];
      // Only check if car point is horizontally within the segment
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
      if (cx < minX - 1 || cx > maxX + 1) continue;
      const gap = pointAboveSegment(cx, cy, ax, ay, bx, by);
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

// ─── Transform car profile to world coords ───────────────────────────────────
// frontAxleX, frontAxleY = world position of front axle contact patch
// θCar = car angle relative to horizontal (rad), positive = nose up
function transformCar(profile, frontAxleX, frontAxleY, θCar) {
  const cos = Math.cos(θCar), sin = Math.sin(θCar);
  return profile.map(([lx, ly]) => [
    frontAxleX + lx * cos - ly * sin,
    frontAxleY + lx * sin + ly * cos,
  ]);
}

// ─── Position car for each scenario ──────────────────────────────────────────
// Road origin = top crest at (0, 0). +x rightward, +y upward.
// θ = ramp angle (positive, downward slope).
// r = tire radius.
// Returns {pts: worldCarPts, angle: θCar_rad}

function scenarioApproach(c, road) {
  // Front tires just at the crest (x=0), car horizontal on upper flat.
  const { r } = c;
  const frontAxleX = 0;
  const frontAxleY = r;     // tires sitting on flat at y=0
  const profile = buildCarProfile(c);
  return transformCar(profile, frontAxleX, frontAxleY, 0);
}

function scenarioBreakoverTop(c, road) {
  // Front tires on the ramp just past the crest; rear tires still on upper flat.
  // Worst case: rear axle at the crest.
  const { wheelbase: L, r, θ } = c;
  const θr = deg(θ);
  // Rear axle at x=0 (crest), y = r (flat).
  // Front axle: advance by L along the ramp surface from crest.
  const rearAxleX = 0, rearAxleY = r;
  const frontAxleX = rearAxleX + L * Math.cos(θr);
  const frontAxleY = rearAxleY - L * Math.sin(θr) + (r - r * Math.cos(θr));
  // More precisely: front axle is at the road surface + r perpendicular.
  // Road at x = L*cos(θ) is at y = -L*sin(θ). Add r perpendicular to slope.
  const fax = L * Math.cos(θr);
  const fay = -L * Math.sin(θr) + r;   // approximate: r vertical (good enough for small angles)
  // Car angle = -θ (nose down)
  const profile = buildCarProfile(c);
  return transformCar(profile, fax, fay, -θr);
}

function scenarioBreakoverBottom(c, road) {
  // Front tires just reached the lower flat; rear tires still on ramp.
  // Bottom crest x = rampX.
  const { wheelbase: L, r, θ, rampLength } = c;
  const θr = deg(θ);
  const rampX = rampLength * Math.cos(θr);
  const rampY = -rampLength * Math.sin(θr);   // negative (lower)
  // Front axle at bottom crest: x = rampX, y = rampY + r (floor level + r)
  const fax = rampX;
  const fay = rampY + r;
  // Car angle: rear still on slope, so car pitched nose-up relative to bottom flat.
  // Rear axle = fax - L*cos(θ), fay + L*sin(θ) (going back up the slope)
  const profile = buildCarProfile(c);
  return transformCar(profile, fax, fay, θr);  // nose-up = +θ
}

function scenarioDeparture(c, road) {
  // Rear tires just at bottom crest; car horizontal on lower flat.
  const { wheelbase: L, r, θ, rampLength } = c;
  const θr = deg(θ);
  const rampX = rampLength * Math.cos(θr);
  const rampY = -rampLength * Math.sin(θr);
  // Rear axle at bottom crest, front axle forward on flat.
  // Front axle: x = rampX + L, y = rampY + r
  const fax = rampX + L;
  const fay = rampY + r;
  const profile = buildCarProfile(c);
  return transformCar(profile, fax, fay, 0);
}

// ─── Run all checks ───────────────────────────────────────────────────────────
function runChecks(c) {
  const road = buildRoad(c);

  const s1 = scenarioApproach(c, road);
  const s2 = scenarioBreakoverTop(c, road);
  const s3 = scenarioBreakoverBottom(c, road);
  const s4 = scenarioDeparture(c, road);

  return {
    approach:      { pts: s1, gap: minClearance(s1, road), label: 'Approach' },
    breakoverTop:  { pts: s2, gap: minClearance(s2, road), label: 'Top crest' },
    breakoverBot:  { pts: s3, gap: minClearance(s3, road), label: 'Bottom belly' },
    departure:     { pts: s4, gap: minClearance(s4, road), label: 'Departure' },
  };
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

function render(c, results) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const road = buildRoad(c);

  // Determine world bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of road) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // Include all car scenario points
  const allScenarios = [results.approach, results.breakoverTop, results.breakoverBot, results.departure];
  for (const s of allScenarios) {
    for (const [x, y] of s.pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const PAD = 80;
  const scaleX = (W - 2 * PAD) / (maxX - minX || 1);
  const scaleY = (H - 2 * PAD) / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY);

  const ox = PAD - minX * scale;
  const oy = H - PAD + minY * scale;   // flip y

  const tx = x => ox + x * scale;
  const ty = y => oy - y * scale;

  // Sky / ground fill
  ctx.fillStyle = '#f0f4ff';
  ctx.fillRect(0, 0, W, H);

  // Ground fill below road
  ctx.beginPath();
  ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
  for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
  ctx.lineTo(tx(road[road.length - 1][0]), H);
  ctx.lineTo(tx(road[0][0]), H);
  ctx.closePath();
  ctx.fillStyle = '#c8d8b0';
  ctx.fill();

  // Road surface
  ctx.beginPath();
  ctx.moveTo(tx(road[0][0]), ty(road[0][1]));
  for (const [x, y] of road) ctx.lineTo(tx(x), ty(y));
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Road marking — hatch lines on ramp
  {
    const [x0, y0] = road[1]; // top crest
    const [x1, y1] = road[2]; // bottom
    const rampDist = Math.sqrt((x1-x0)**2 + (y1-y0)**2);
    const steps = Math.floor(rampDist / 1200);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mx = x0 + t * (x1 - x0);
      const my = y0 + t * (y1 - y0);
      // perpendicular direction
      const nx = -(y1 - y0) / rampDist, ny = (x1 - x0) / rampDist;
      const hw = 400;
      ctx.beginPath();
      ctx.moveTo(tx(mx - nx * hw), ty(my - ny * hw));
      ctx.lineTo(tx(mx + nx * hw), ty(my + ny * hw));
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Ticks: crest and bottom labels
  ctx.fillStyle = '#555';
  ctx.font = `${Math.max(10, scale * 200)}px system-ui`;
  ctx.textAlign = 'center';

  // Draw each scenario car with different opacity; highlight worst scenario
  const scenarioKeys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const colors = ['#2196f3', '#ff9800', '#9c27b0', '#009688'];
  const minGaps = scenarioKeys.map(k => results[k].gap);
  const worstIdx = minGaps.indexOf(Math.min(...minGaps));

  for (let si = 0; si < scenarioKeys.length; si++) {
    const key = scenarioKeys[si];
    const { pts, gap } = results[key];
    const isFail = gap < 0;
    const isWorst = si === worstIdx;

    ctx.save();
    ctx.globalAlpha = isWorst ? 0.95 : 0.30;

    // Draw car underside as filled shape (close top arbitrarily high)
    const topY = pts.map(([, y]) => y).reduce((a, b) => Math.max(a, b)) + c.h * 2;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    // close at top
    ctx.lineTo(tx(pts[pts.length - 1][0]), ty(topY));
    ctx.lineTo(tx(pts[0][0]), ty(topY));
    ctx.closePath();
    ctx.fillStyle = isFail ? '#ff5252' : colors[si];
    ctx.globalAlpha = isWorst ? 0.18 : 0.07;
    ctx.fill();

    // Underside outline
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (const [x, y] of pts) ctx.lineTo(tx(x), ty(y));
    ctx.strokeStyle = isFail ? '#d32f2f' : colors[si];
    ctx.lineWidth = isWorst ? 2.5 : 1;
    ctx.globalAlpha = isWorst ? 0.9 : 0.35;
    ctx.setLineDash(isWorst ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw wheels (circles) for worst scenario
    if (isWorst) {
      const { wheelbase: L, r } = c;
      // Reconstruct axle world positions from car pts
      // Front axle is at car local (0,0) → first find transform
      // We know pts[1] or pts[2] — instead recompute front axle:
      // pts[2] = nadir = local (-L/2, h). pts[0] = local (Of, bumperY).
      // Use front axle by inverting: we stored transformCar with frontAxle origin.
      // Simpler: the front axle world pos = pts[1] adjusted for p1 offset.
      // Actually let's just draw tires at the road surface under the car centroid.
      // Approximate: front axle at pts[1] projected down to road line, rear at pts[3].
      drawTire(ctx, tx, ty, pts, c, road, true,  isFail ? '#d32f2f' : colors[si]);
      drawTire(ctx, tx, ty, pts, c, road, false, isFail ? '#d32f2f' : colors[si]);
    }

    ctx.restore();
  }

  // Angle arcs
  drawAngleAnnotations(ctx, tx, ty, c, road, scale);

  // Legend
  ctx.save();
  ctx.globalAlpha = 1;
  const legendX = W - 160, legendY = 20;
  for (let si = 0; si < scenarioKeys.length; si++) {
    const { gap } = results[scenarioKeys[si]];
    const fail = gap < 0;
    ctx.fillStyle = fail ? '#d32f2f' : colors[si];
    ctx.fillRect(legendX, legendY + si * 18, 14, 10);
    ctx.fillStyle = '#222';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(results[scenarioKeys[si]].label, legendX + 18, legendY + si * 18 + 9);
    ctx.fillStyle = fail ? '#d32f2f' : '#2e7d32';
    ctx.fillText(gap < 0 ? `${gap.toFixed(0)}mm` : `+${gap.toFixed(0)}mm`, legendX + 100, legendY + si * 18 + 9);
  }
  ctx.restore();
}

function drawTire(ctx, tx, ty, pts, c, road, isFront, color) {
  const { wheelbase: L, r } = c;
  // Estimate axle world position:
  // From the car underside, point index 1 is at local x = (Of - h/tan(αa)), y = h
  // and point index 3 is at local x = (-L - Or + h/tan(αd)), y = h.
  // We need the x = 0 (front axle) and x = -L (rear axle) in world coords.
  // Build a transform from two known local points: pts[1] and pts[3].
  const { Of, Or, h, αa: αaD, αd: αdD } = c;
  const p1lx = Of - h / Math.tan(deg(αaD));
  const p3lx = -L - (Or - h / Math.tan(deg(αdD)));
  const [p1wx, p1wy] = pts[1];
  const [p3wx, p3wy] = pts[3];

  const localDx = p3lx - p1lx, localDy = h - h;  // dy = 0
  const worldDx = p3wx - p1wx, worldDy = p3wy - p1wy;
  // scale = worldDist / localDist
  const localDist = Math.abs(localDx);
  if (localDist < 1) return;
  const angle = Math.atan2(worldDy, worldDx) - Math.atan2(0, localDx);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const sc = Math.sqrt(worldDx * worldDx + worldDy * worldDy) / localDist;

  // Local axle positions:
  const axleLX = isFront ? 0 : -L;
  const axleLY = r; // tires at y=r above contact

  // Transform to world:
  const dLX = axleLX - p1lx, dLY = axleLY - h;
  const axleWX = p1wx + sc * (dLX * cosA - dLY * sinA);
  const axleWY = p1wy + sc * (dLX * sinA + dLY * cosA);

  const screenR = r * (tx(1) - tx(0));  // r * scale
  ctx.beginPath();
  ctx.arc(tx(axleWX), ty(axleWY), Math.abs(screenR), 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.globalAlpha = 0.15;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawAngleAnnotations(ctx, tx, ty, c, road, scale) {
  const { θ } = c;
  const θr = deg(θ);
  const [x0, y0] = road[1];
  const arcR = Math.abs(tx(x0 + 1500) - tx(x0));

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#333';
  ctx.fillStyle = '#333';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';

  // Ramp angle arc at crest
  ctx.beginPath();
  ctx.arc(tx(x0), ty(y0), arcR, Math.PI, Math.PI + θr);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillText(`θ=${θ.toFixed(1)}°`, tx(x0) - arcR - 45, ty(y0) + 14);

  ctx.restore();
}

// ─── Update results panel ─────────────────────────────────────────────────────
function updateResults(results) {
  const keys = ['approach', 'breakoverTop', 'breakoverBot', 'departure'];
  const ids  = ['chk-approach', 'chk-breakover-top', 'chk-breakover-bot', 'chk-departure'];
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
  if (!c.θ || !c.wheelbase) return;
  const results = runChecks(c);
  render(c, results);
  updateResults(results);

  const grade = Math.tan(deg(c.θ)) * 100;
  document.getElementById('slope-info').textContent =
    `Slope: ${c.θ.toFixed(2)}° (${grade.toFixed(1)}% grade)`;
}

// ─── Sync ramp angle ↔ grade ──────────────────────────────────────────────────
document.getElementById('rampAngle').addEventListener('input', e => {
  const d = parseFloat(e.target.value) || 0;
  document.getElementById('rampGrade').value = degToGrade(d).toFixed(1);
  update();
});
document.getElementById('rampGrade').addEventListener('input', e => {
  const g = parseFloat(e.target.value) || 0;
  document.getElementById('rampAngle').value = gradeToDeg(g).toFixed(2);
  update();
});

// Attach update to all other inputs
document.querySelectorAll('input[type=number]').forEach(el => {
  if (el.id !== 'rampAngle' && el.id !== 'rampGrade') {
    el.addEventListener('input', update);
  }
});

// ─── Canvas resize ────────────────────────────────────────────────────────────
function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const W = Math.max(600, wrap.clientWidth - 32);
  const H = Math.max(300, wrap.clientHeight - 32);
  canvas.width = W;
  canvas.height = H;
  update();
}
window.addEventListener('resize', resizeCanvas);

// ─── Init ─────────────────────────────────────────────────────────────────────
resizeCanvas();
loadPreset('m3p_easy');
