# StepSignal demo — Bandra West, Mumbai (2 min)

Route: Bandra Station → Linking Road Bandra (1.2 km, 18 stretches).

1. Problem: "A route can look fine on a map and fail at one kerb. StepSignal checks every ~50 m stretch against street-level evidence."
2. Run the route. Point to the coverage indicator: only stretches with analysable evidence count — the rest stay grey/uncertain.
3. Click an orange stretch (confirmed barrier): show the photo, capture date, observation + confidence (e.g. steps observed, no kerb ramp visible).
4. Click a grey stretch: "Uncertain means we don't know — we never upgrade missing data to accessible."
5. Show the dashed alternate route and compare per-stretch evidence, not an overall accessibility claim.
6. Close on limits: gradients/widths are never measured from photos; this is evidence, not a guarantee.

Setup before judging: put MAPILLARY_ACCESS_TOKEN + MUSE_API_KEY in .env, run the demo route once to warm the cache, confirm photo stretches appear. Without keys the app intentionally shows all-uncertain.
