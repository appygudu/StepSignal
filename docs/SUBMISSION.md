# Hackathon submission guide

## Elevator pitch
StepSignal is street-level accessibility evidence for wheelchair and mobility users. It samples a walking route every ~50 m, retrieves real Mapillary photographs, analyses each with Meta Muse Spark (`muse-spark-1.3`), and reports — per stretch — what barriers were actually detected, which photograph supports each observation, how confident the model was, and how old the evidence is. Stretches without sufficient evidence are marked **uncertain**, never accessible. No route is ever labelled fully wheelchair accessible.

## Verified demo (no paid calls needed)
The Bandra West route (Bandra Station → Linking Road, 1.2 km, 18 stretches) was analysed for real: 32 photographs, 32 successful Muse Spark calls, 0 failed. Results are cached in `docs/evidence-report.json` and served at `GET /api/report`, so judges can run the full demo offline of model billing.

Headline result: 66.7% evidence coverage · 11 stretches with confirmed barrier evidence · 1 with no barrier visible in evidence · 6 uncertain. Dominant barriers: pavement obstructions, sidewalk discontinuities, surface damage, stairs on seg #10.

## How judges run it
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8001
cd ../frontend && npm install && npm run dev   # http://localhost:3001
```
Open the UI: the verified Bandra report loads automatically. Click orange/grey/teal pins, open photo evidence, filter by status.

For a fresh route: copy `.env.example` to `.env` and add `MAPILLARY_ACCESS_TOKEN` (free, mapillary.com) and `MODEL_API_KEY` (Meta Model API, https://api.meta.ai/v1). Then use "Analyse a new route" — note this can incur vision API costs, one call per uncached photograph, cached thereafter in SQLite.

## Meta AI usage
- **Muse Spark `muse-spark-1.3`** (Meta Model API, Bearer auth): every accessibility observation, with confidence and evidence text, returned as validated structured JSON. Images are embedded as base64 because the API cannot fetch Mapillary URLs (`media_url_not_fetchable`).
- **SAM 3.1**: integration hook implemented (`SAM_API_URL`); not configured in this environment, and the app says so instead of fabricating masks.
- **Muse (engineering)**: assisted implementation during the hackathon.

## Honest limitations
- 6 of 18 Bandra stretches have no Mapillary coverage; they remain uncertain.
- Public Overpass mirrors were unreachable from the development network, so OSM kerb/tactile corroboration is coded and tested but not live-verified; the app reports this in the gaps panel.
- Photograph dates range 2021–2025; old evidence is labelled with its age everywhere it is used.
- Gradients, widths and surface quality are never measured from photographs.
