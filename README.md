# Can my car make it over this slope?

An interactive browser tool that checks whether a car can safely clear a driveway ramp or speed bump without scraping.

## The problem

Low-clearance cars (sports cars, lowered vehicles, many EVs) can scrape their undercarriage on steep ramps — driveways, parking garage entrances, speed bumps. The question is deceptively simple: given my car's geometry and a ramp profile, will any part of the chassis hit the ground?

This tool answers that by checking **four critical clearance points** along the car as it traverses a ramp, then reports the worst-case gap in millimetres.

## What it checks

The simulation places the car at four worst-case positions on the ramp and measures the minimum gap between the car's underside and the road surface at each:

1. **Approach** — front tires at the crest, car still on the upper flat. Checks whether the front bumper clears the ramp face as the car begins to descend.

2. **Top breakover** — rear tires at the crest, front tires already on the ramp. The car is tilted nose-down; this is where the belly can scrape on the ramp crest.

3. **Bottom belly** — front tires on the lower flat, rear tires still on the ramp. The car is tilted nose-down; this catches scrapes at the bottom transition.

4. **Departure** — rear tires at the bottom crest, car on the lower flat. Checks whether the rear bumper clears as the car finishes crossing.

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

The ramp is a 4-segment polyline:

```
  Upper flat ──► Ramp (slope) ──► Lower flat
                 ▲ crest            ▼ bottom
```

The ramp angle can be entered in degrees or as a percentage grade (e.g. 15% ≈ 8.5°). The two are kept in sync automatically.

## How clearance is computed

For each scenario:
1. The car's 5-point underside is transformed to world coordinates using the front axle position and the car's pitch angle on that section of road.
2. For each car point, the signed perpendicular distance to the nearest road surface is computed — positive means the car is above the road, negative means it's scraping.
3. The point and road contact with the smallest gap are tracked for visualization.
4. The minimum gap across all points is the clearance for that scenario.

## Visual layout

The canvas shows:
- The ramp profile with hatching and a travel direction arrow
- The worst-case car drawn solid (neutral gray), with FRONT/REAR labels
- Ghost outlines of the other three scenarios (dashed, colored)
- A descriptive label near each car (e.g. "front bumper approaches crest")
- An angle arc at the crest with the ramp angle and grade percentage
- A length annotation along the ramp midpoint
- A left-side legend panel with colored dots, scenario names, clearance values, and elbow leader lines pointing to the tightest measurement points

The results bar at the bottom shows a verdict (PASS / PASS-but-tight / FAIL) and per-check clearance with color coding.

## Presets

Three built-in configurations:
- **Model 3 Perf + 15% ramp** — a common EV with modest ground clearance on a typical driveway
- **Model 3 Perf + 20% ramp** — steeper scenario, breakover clearance gets tight
- **Generic sports car + 18% ramp** — lower clearance, shorter wheelbase

## Design notes

- Pure vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies.
- Canvas bounding box is fixed so presets never shift the view.
- Re-renders live on any input change.
- The worst-case scenario is drawn solid; others are dashed ghosts for comparison.
- Ramp angle and grade percentage stay bidirectionally synced.
- Units are millimetres and degrees throughout (automotive standard).

## Running it

Open `index.html` in any modern browser. No server needed.
