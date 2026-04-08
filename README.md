# Can my car make it over this slope?

An interactive browser tool that checks whether a car can safely clear a driveway ramp or speed bump without scraping.

## The problem

Low-clearance cars (sports cars, lowered vehicles, many EVs) can scrape their undercarriage on steep ramps and bumps — driveways, parking garage entrances, speed bumps. The question is deceptively simple: given my car's geometry and an obstacle profile, will any part of the chassis hit the ground?

This tool answers that by checking **four critical clearance points** along the car as it traverses the obstacle, then reports the worst-case gap in millimetres.

## Modes

The tool supports two obstacle types, selectable via a toggle:

- **Ramp** — a descending slope (flat → slope down → flat). Common for driveway ramps and parking garage entrances.
- **Bump** — a speed bump profile (flat → rise → flat top → fall → flat). Models speed bumps, raised obstacles, and driveway lips.

Both modes share the same car geometry and clearance checks, with the math adapted for the obstacle shape.

## What it checks

The simulation places the car at four worst-case positions and measures the minimum gap between the car's underside and the road surface at each:

1. **Approach (Front bumper)** — front tires at the obstacle edge. Checks whether the front bumper clears the ramp face or bump rise.

2. **Top breakover (Belly top)** — rear tires at the obstacle edge, front tires past it. The car is bridging the crest/bump; this is where the belly can scrape.

3. **Bottom breakover (Belly bottom)** — front tires past the obstacle, rear tires still approaching. Catches scrapes at the bottom transition or fall face.

4. **Departure (Rear bumper)** — rear tires at the obstacle exit. Checks whether the rear bumper clears as the car finishes crossing.

Each check reports a signed clearance in millimetres. If any gap is negative, the tool reports **FAIL**. A gap below 50 mm triggers a **tight** warning (amber) even if passing, since real-world conditions vary.

## Car model

The car's underside is modeled as a 5-point polyline in car-local coordinates (origin at front tire contact, +x forward):

```
  Front bumper ─── Approach ramp ─── Belly (flat) ─── Departure ramp ─── Rear bumper
```

Key geometry:
- **Wheelbase** — distance between front and rear axle centres
- **Ground clearance** — height of the lowest chassis point above the road (with tires mounted)
- **Front/rear overhang** — distance from axle to bumper
- **Approach/departure angles** — the steepest ramp angle the bumper can clear
- **Breakover angle** — the steepest crest the belly can clear
- **Tire radius** — wheel outer radius, used for canvas rendering only (not clearance math)

The approach and departure angles determine how steeply the underside rises from the belly to the bumpers. The breakover angle defines the V-shape at the belly nadir (midpoint between axles).

## Road model

### Ramp mode

A 3-segment polyline:

```
  Upper flat ──► Ramp (slope) ──► Lower flat
                 ▲ crest            ▼ bottom
```

### Bump mode

A 5-segment polyline:

```
  Upper flat ──► Rise ──► Flat top ──► Fall ──► Lower flat
```

The bump rise and fall faces can have **independent angles** (asymmetric bump). If only one angle is entered, the other defaults to match — making a symmetric bump a special case.

- **Rise angle / grade** — steepness of the approach face
- **Fall angle / grade** — steepness of the departure face (defaults to rise angle if not set)
- **Bump height** — peak height above ground level
- **Bump width** — length of the flat top

The horizontal run of each face is derived from its angle and the bump height:
`run = height / tan(angle)`

The slope angle can be entered in degrees or as a percentage grade (e.g. 15% ≈ 8.5°). The two are kept in sync automatically, for both rise and fall.

## Road lengths

No road length inputs are exposed. All lengths are auto-computed from the car geometry:

- **Upper flat**: `wheelbase + 2 m` — long enough that the rear tire starts well clear of the obstacle
- **Lower flat** (ramp): `wheelbase + rear overhang + 2 m` — long enough that the rear bumper fully exits
- **Lower flat** (bump): same formula, referenced from the fall base
- **Ramp length**: `max(2 × wheelbase, 8 m) / cos(θ)` — along the slope surface

These lengths are purely visual (they position the road ends on canvas). The clearance math depends only on obstacle angles and heights, not on how long the flat sections are.

## How clearance is computed

For each scenario:
1. The car's 5-point underside is transformed to world coordinates using the front axle position and the car's pitch angle on that section of road.
2. For each car point, the signed perpendicular distance to the nearest road surface is computed — positive means the car is above the road, negative means it's scraping.
   - Descending faces use `perpToRamp(x, y, θ) = y·cos θ + x·sin θ`
   - Ascending faces use `perpToRise(x, y, θ) = y·cos θ − x·sin θ`
   - The fall face reuses `perpToRamp` by translating the coordinate origin to the fall corner `(fallTopX, bH)`
3. The point and road contact with the smallest gap are tracked for visualization.
4. The minimum gap across all points is the clearance for that scenario.

## Visual layout

The canvas shows:
- The road profile with hatching on sloped faces and a travel direction arrow
- The worst-case car drawn solid (neutral gray), with FRONT/REAR labels
- Ghost outlines of the other three scenarios (dashed, colored)
- A descriptive label near each car (context-aware per mode)
- Grade arc annotations at the transition points (both rise and fall in bump mode)
- A height/width/face-length annotation for the obstacle
- A left-side legend panel with colored dots, scenario names, clearance values, and elbow leader lines pointing to the tightest measurement points

The results bar at the bottom shows a verdict (PASS / PASS-but-tight / FAIL) and per-check clearance with color coding.

## Presets

Five built-in configurations:

**Ramp mode:**
- **Model 3 Perf + 15% ramp** — a common EV with modest ground clearance on a typical driveway
- **Model 3 Perf + 20% ramp** — steeper scenario, breakover clearance gets tight
- **Sports car + 18% ramp** — lower clearance, shorter wheelbase

**Bump mode:**
- **Model 3 Perf + 100mm bump** — 100mm speed bump at 20% grade (symmetric)
- **Model 3 Perf + 150mm bump** — 150mm speed bump at 20% grade (symmetric)

## Design notes

- Pure vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies.
- Canvas bounding box tracks the road's left edge with a fixed 500 mm margin, then extends a fixed total width. This keeps the car rendered at the same scale regardless of obstacle type or car size.
- Re-renders live on any input change.
- The worst-case scenario is drawn solid; others are dashed ghosts for comparison.
- Slope angle and grade percentage stay bidirectionally synced, independently for rise and fall.
- Asymmetric bump: rise and fall faces each have their own angle; symmetric is the default (fall defaults to rise).
- Units are millimetres and degrees throughout (automotive standard).

## Why ramp and bump are separate modes

The two modes are topologically different obstacles:

- **Ramp** — net height change. The road descends from one level to another permanently.
- **Bump** — closed loop. The road rises and returns to the original level.

The road geometry, scenario positioning, and clearance math all differ as a result. The four clearance checks test the car at the same conceptual positions (approach, top breakover, bottom breakover, departure), but the exact axle placement for each check depends on the obstacle topology — ramp has one top and one bottom transition; bump has four (rise base, rise top, fall top, fall base).

A general segment-list road model could unify `buildRoad()` and the canvas drawing loop, but scenario positioning would still need separate logic per obstacle type. The current explicit branching keeps each mode self-contained and easy to reason about without adding a more abstract framework.

## Running it

Open `index.html` in any modern browser. No server needed.
