# Can my car make it over this slope?

An interactive browser tool that checks whether a car can safely clear a driveway ramp or speed bump without scraping.

## The problem

Low-clearance cars (sports cars, lowered vehicles, many EVs) can scrape their undercarriage on steep ramps — driveways, parking garage entrances, speed bumps. The question is deceptively simple: given my car's geometry and a ramp profile, will any part of the chassis hit the ground?

This tool answers that by checking **four critical clearance points** along the car as it traverses a ramp, then reports the worst-case gap in millimetres.

## What it checks

The simulation places the car at four worst-case positions on the ramp and measures the minimum gap between the car's underside and the road surface at each:

1. **Approach** — front tires at the crest, car still on the upper flat. Checks whether the front bumper clears the ramp face as the car begins to descend.

2. **Top breakover** — rear tires at the crest, front tires already on the ramp. The car is tilted nose-down; this is where the belly can scrape on the ramp crest.

3. **Bottom belly** — front tires on the lower flat, rear tires still on the ramp. The car is tilted nose-up; this catches scrapes at the bottom transition.

4. **Departure** — rear tires at the bottom crest. Checks whether the rear bumper clears as the car finishes crossing.

If any gap is negative, the tool reports **FAIL**. A small negative value (within ~20 mm) shows as a warning rather than a hard fail, since real-world geometry has some give.

## Car model

The car's underside is modeled as a 5-point polyline in car-local coordinates:

```
  Front bumper ─── Approach ramp ─── Belly (flat) ─── Departure ramp ─── Rear bumper
```

Key geometry:
- **Wheelbase** — distance between front and rear axle centres
- **Ground clearance** — height of the lowest chassis point above the road
- **Front/rear overhang** — distance from axle to bumper
- **Approach/departure angles** — the steepest ramp angle the bumper can clear
- **Breakover angle** — the steepest crest the belly can clear
- **Tire radius** — wheel outer radius, used to position axles above the road

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
2. For each car point, the closest point on every nearby road segment is found using point-to-segment projection.
3. The signed distance is computed along the road segment's surface normal — positive means the car is above the road, negative means it's scraping.
4. The minimum gap across all points and all road segments is the clearance for that scenario.

## Presets

Three built-in configurations:
- **Model 3 Perf + 15% ramp** — a common EV with modest ground clearance on a typical driveway
- **Model 3 Perf + 20% ramp** — steeper scenario, more likely to scrape
- **Generic sports car + 18% ramp** — lower clearance, shorter wheelbase

## Design notes

- Pure vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies.
- The canvas auto-sizes to its container and re-renders on any input change.
- The worst-case scenario is drawn solid and opaque; others are drawn dashed and faded for comparison.
- Ramp angle and grade percentage stay bidirectionally synced.
- Units are millimetres and degrees throughout (automotive standard).

## Running it

Open `index.html` in any modern browser. No server needed.
