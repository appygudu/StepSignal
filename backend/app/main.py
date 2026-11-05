import os, json, sqlite3
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from .schemas import BriefRequest, BriefResponse, Segment, EvidencePhoto, Contribution
from .services.routing import parse_place, get_route
from .services.geo import sample_every, estimated_walking_minutes
from .services.osm_access import fetch_osm_access
from .services.mapillary import fetch_photos
from .services.vision import analyse_photo, sam_segment
from .services.continuity import classify, coverage

app = FastAPI(title="StepSignal API")
# Configurable via CORS_ORIGINS (comma-separated). Defaults cover local dev
# hosts — a browser on 127.0.0.1 is a different Origin than localhost and
# was previously rejected, which silently broke the map for those users.
_cors = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001,http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_methods=["*"], allow_headers=["*"])
DB = Path(__file__).resolve().parents[2] / "stepsignal.db"

def cache_get(iid):
    try:
        con = sqlite3.connect(DB); con.execute("CREATE TABLE IF NOT EXISTS signals (image_id TEXT PRIMARY KEY, json TEXT)")
        row = con.execute("SELECT json FROM signals WHERE image_id=?", (iid,)).fetchone(); con.close()
        return json.loads(row[0]) if row else None
    except Exception:
        return None

def cache_put(iid, sig):
    try:
        con = sqlite3.connect(DB); con.execute("CREATE TABLE IF NOT EXISTS signals (image_id TEXT PRIMARY KEY, json TEXT)")
        con.execute("INSERT OR REPLACE INTO signals VALUES (?,?)", (iid, json.dumps(sig))); con.commit(); con.close()
    except Exception:
        pass

def integrations():
    return {
        "osrm_routing": "functional",
        "route_sampling_50m": "functional",
        "openstreetmap_overpass": "functional_code_path (live result depends on public Overpass availability)",
        "mapillary": "functional" if os.environ.get("MAPILLARY_ACCESS_TOKEN") else "not_configured — set MAPILLARY_ACCESS_TOKEN",
        "muse_spark_vision": "functional" if os.environ.get("MODEL_API_KEY") else "not_configured — set MODEL_API_KEY (Meta Model API, https://api.meta.ai/v1, model muse-spark-1.3); no mocked responses are used",
        "sam_3_1_segmentation": "functional" if os.environ.get("SAM_API_URL") else "not_configured — set SAM_API_URL; no masks are fabricated",
        "continuity_engine": "functional",
    }

@app.get("/health")
def health():
    return {"status": "ok", "integrations": integrations()}

@app.post("/api/contributions")
def add_contribution(c: Contribution):
    """Community photo/place invite. Stores the submission locally for review.
    Contributions are leads for future analysis — never displayed as verified evidence."""
    if not c.location_text.strip():
        raise HTTPException(400, "location_text is required")
    if c.mapillary_url and "mapillary.com" not in c.mapillary_url:
        raise HTTPException(400, "mapillary_url must be a Mapillary link")
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS contributions (id INTEGER PRIMARY KEY, location_text TEXT, lat REAL, lon REAL, mapillary_url TEXT, barrier_type TEXT, note TEXT, contact TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    cur = con.execute("INSERT INTO contributions (location_text, lat, lon, mapillary_url, barrier_type, note, contact) VALUES (?,?,?,?,?,?,?)",
                      (c.location_text.strip(), c.lat, c.lon, c.mapillary_url, c.barrier_type, c.note[:1000], c.contact))
    con.commit(); cid = cur.lastrowid; con.close()
    return {"status": "received", "id": cid, "note": "Thank you. This is queued for review and is not treated as verified evidence until analysed."}

@app.get("/api/contributions/count")
def contribution_count():
    try:
        con = sqlite3.connect(DB)
        exists = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='contributions'").fetchone()
        n = con.execute("SELECT COUNT(*) FROM contributions").fetchone()[0] if exists else 0
        con.close()
    except Exception:
        n = 0
    return {"count": n}

@app.get("/api/report")
def report():
    """Verified cached evidence report (docs/evidence-report.json). Makes no model calls."""
    p = Path(__file__).resolve().parents[2] / "docs" / "evidence-report.json"
    if not p.exists():
        raise HTTPException(404, "No verified report yet — run scripts/run_full_route.py")
    d = json.loads(p.read_text())
    # Reclassify stored, already-analysed photos with the current authoritative
    # engine. No AI calls — signals are reused exactly as stored.
    segs = []
    for s in d["segments"]:
        seg = Segment(**s)
        status, reason, obs, warns, quality, vreq = classify(seg.photos, seg.osm)
        seg.status, seg.status_reason = status, reason
        seg.evidence_quality, seg.verification_required = quality, vreq
        if obs: seg.observations = obs
        segs.append(seg)
    from collections import Counter as _C
    counts = dict(_C(s.status for s in segs))
    pct, cov_note = coverage(segs)
    d = {**d, "segments": segs, "counts": counts, "coverage_pct": pct, "coverage_note": cov_note}
    summary = (f"Verified evidence report for {d['origin']} to {d['destination']} ({d['distance_m']/1000:.1f} km). "
               f"{counts.get('confirmed_barrier',0)} confirmed, {counts.get('possible_barrier',0)} possible, "
               f"{counts.get('observed_clear_of_barriers',0)} with no barrier visible in analysed evidence, "
               f"{counts.get('uncertain',0)} uncertain, {counts.get('unassessed',0)} unassessed. "
               "Coverage means evidence availability, not accessibility.")
    return BriefResponse(origin_label=d["origin"], destination_label=d["destination"],
        distance_m=d["distance_m"], duration_min=d["duration_min"], route_geojson=d["route_geojson"],
        alternate_geojson=d.get("alternate_geojson"),
        alternate_note="Alternate route shown for comparison of per-segment evidence. Neither route is labelled accessible overall." if d.get("alternate_geojson") else None,
        segments=segs, coverage_pct=d["coverage_pct"],
        coverage_note=d["coverage_note"], counts=d["counts"], summary=summary,
        warnings=d.get("warnings", []), integrations=integrations())

from .services.vision import MODEL as _MODEL, PROMPT_VERSION as _PV, SCHEMA_VERSION as _SV
ANALYSIS_VERSION = f"{_MODEL}:{_PV}:{_SV}"

def _cache_key(image_id): return f"{ANALYSIS_VERSION}:{image_id}"

@app.post("/api/stage/route")
def stage_route(req: BriefRequest):
    """Stage 1 (fast): routing + sampling only. No imagery, no AI calls."""
    import time; t0 = time.perf_counter()
    try:
        olat, olon, olabel = parse_place(req.origin)
        dlat, dlon, dlabel = parse_place(req.destination)
        routes = get_route((olat, olon), (dlat, dlon))
    except Exception as e:
        raise HTTPException(502, str(e))
    m = routes[0]; samples = sample_every(m["geometry"]["coordinates"], 50.0)
    return {"origin_label": olabel, "destination_label": dlabel, "distance_m": m["distance"],
            "duration_min": estimated_walking_minutes(m["distance"]), "duration_source": "estimated_walking_speed_4.5kmh (OSRM duration not used as a walking estimate)",
            "route_geojson": {"type": "Feature", "geometry": m["geometry"], "properties": {}},
            "alternate_geojson": {"type": "Feature", "geometry": routes[1]["geometry"], "properties": {}} if len(routes) > 1 else None,
            "samples": [{"index": i, "lat": la, "lon": lo} for i, (la, lo) in enumerate(samples)],
            "timings": {"routing_s": round(time.perf_counter()-t0, 2)}}

from pydantic import BaseModel as _BM
class _SamplesReq(_BM):
    samples: list
class _AnalyseReq(_BM):
    photos: list

@app.post("/api/stage/discover")
def stage_discover(req: _SamplesReq):
    """Stage 2: Mapillary + OSM discovery concurrently. No AI calls."""
    import time; t0 = time.perf_counter()
    samples = [(s["lat"], s["lon"]) for s in req.samples]
    from concurrent.futures import ThreadPoolExecutor as _TPE
    with _TPE(max_workers=2) as ex:
        f1 = ex.submit(fetch_osm_access, samples); f2 = ex.submit(fetch_photos, samples, 1)
        osm_by_idx, osm_warn = f1.result(); photos_by_idx, map_warn = f2.result()
    return {"photos_by_index": {str(k): v for k, v in photos_by_idx.items()},
            "osm_by_index": {str(k): v for k, v in osm_by_idx.items()},
            "warnings": [w for w in [map_warn, osm_warn] if w],
            "photos_found": sum(len(v) for v in photos_by_idx.values()),
            "timings": {"discovery_s": round(time.perf_counter()-t0, 2)}}

@app.post("/api/stage/analyse")
def stage_analyse(req: _AnalyseReq):
    """Stage 3: Muse Spark per photo, bounded parallel, versioned SQLite cache.
    Cached photos make no API call. Returns per-photo signals or null (failed).
    Cost protection: hard per-request photo cap (env AI_MAX_PHOTOS_PER_REQUEST,
    default 30). Oversized requests are rejected, never silently billed."""
    import time; t0 = time.perf_counter()
    max_photos = int(os.environ.get("AI_MAX_PHOTOS_PER_REQUEST", "30"))
    if len(req.photos) > max_photos:
        raise HTTPException(413, f"Too many photographs in one request ({len(req.photos)} > {max_photos}). Analyse in smaller batches so AI spend stays explicit.")
    for p in req.photos:
        if not p.get("image_id") or not p.get("thumb_url"):
            raise HTTPException(400, "Each photo requires image_id and thumb_url")
    from .schemas import ImageAccessSignals
    from concurrent.futures import ThreadPoolExecutor
    def _one(p):
        cached = cache_get(_cache_key(p["image_id"]))
        if cached: return p["image_id"], ImageAccessSignals(**cached), "cached"
        sig, _s = analyse_photo(p)
        if sig: cache_put(_cache_key(p["image_id"]), sig.model_dump())
        return p["image_id"], sig, "analysed" if sig else "failed"
    results, stats = {}, {"cached": 0, "analysed": 0, "failed": 0}
    with ThreadPoolExecutor(max_workers=5) as ex:
        for iid, sig, how in ex.map(_one, req.photos):
            results[iid] = sig.model_dump() if sig else None; stats[how] += 1
    return {"results": results, "stats": stats,
            "timings": {"analysis_s": round(time.perf_counter()-t0, 2)}}

class _ClassifyReq(_BM):
    segments: list

@app.post("/api/stage/classify")
def stage_classify(req: _ClassifyReq):
    """Authoritative stretch classification (backend continuity engine).
    Frontend must display these statuses, not recompute its own."""
    from .schemas import EvidencePhoto as _EP
    out = []
    for s in req.segments:
        photos = [_EP(**p) for p in s.get("photos", [])]
        status, reason, obs, warns, quality, verify_req = classify(photos, s.get("osm", {}))
        out.append({"index": s["index"], "status": status, "status_reason": reason,
                    "observations": obs, "warnings": warns, "evidence_quality": quality,
                    "verification_required": verify_req})
    return {"classifications": out}

@app.post("/api/brief", response_model=BriefResponse)
def brief(req: BriefRequest):
    import time; _t0 = time.perf_counter(); _timings = {}
    try:
        olat, olon, olabel = parse_place(req.origin)
        dlat, dlon, dlabel = parse_place(req.destination)
        routes = get_route((olat, olon), (dlat, dlon))
    except Exception as e:
        raise HTTPException(502, str(e))
    main = routes[0]
    samples = sample_every(main["geometry"]["coordinates"], 50.0)
    # OSM and imagery run concurrently — Overpass mirrors can be slow to time out.
    from concurrent.futures import ThreadPoolExecutor as _TPE
    with _TPE(max_workers=2) as _ex:
        _f_osm = _ex.submit(fetch_osm_access, samples)
        _f_photos = _ex.submit(fetch_photos, samples, 1)
        osm_by_idx, osm_warn = _f_osm.result()
        photos_by_idx, map_warn = _f_photos.result()
    warnings = [w for w in [map_warn, osm_warn] if w]
    from .schemas import ImageAccessSignals
    from concurrent.futures import ThreadPoolExecutor
    all_photos = [p for ps in photos_by_idx.values() for p in ps]
    def _analyse(p):
        cached = cache_get(_cache_key(p["image_id"]))
        if cached:
            return p["image_id"], ImageAccessSignals(**cached)
        sig, _src = analyse_photo(p)
        if sig:
            cache_put(_cache_key(p["image_id"]), sig.model_dump())
        return p["image_id"], sig
    analysed = {}
    if all_photos:
        with ThreadPoolExecutor(max_workers=5) as ex:
            for iid, sig in ex.map(_analyse, all_photos):
                analysed[iid] = sig
    segments = []
    for i, (lat, lon) in enumerate(samples):
        photos = []
        for p in photos_by_idx.get(i, []):
            sig = analysed.get(p["image_id"])
            src = "muse_spark" if sig else "unavailable"
            sam_status, mask_url = sam_segment(p) if sig else ("unavailable", None)
            photos.append(EvidencePhoto(**p, signals=sig, signals_source=src, sam_status=sam_status, sam_mask_url=mask_url))
        status, reason, obs, warns, quality, verify_req = classify(photos, osm_by_idx.get(i, {}))
        segments.append(Segment(segment_id=f"seg-{i}", index=i, lat=lat, lon=lon, status=status,
                                status_reason=reason, osm=osm_by_idx.get(i, {}), photos=photos,
                                observations=obs, warnings=warns, evidence_quality=quality,
                                verification_required=verify_req))
    pct, cov_note = coverage(segments)
    from collections import Counter
    counts = dict(Counter(s.status for s in segments))
    alt_geo = alt_note = None
    if len(routes) > 1:
        alt_geo = {"type": "Feature", "geometry": routes[1]["geometry"], "properties": {}}
        alt_note = "Alternate OSRM walking route shown for comparison. Compare its per-segment evidence — neither route is labelled accessible overall."
    summary = (f"Route of {main['distance']/1000:.1f} km from {olabel} to {dlabel} sampled into {len(segments)} stretches (~50 m each). "
               f"{counts.get('confirmed_barrier',0)} stretch(es) have confirmed barrier evidence, "
               f"{counts.get('observed_clear_of_barriers',0)} had no barrier visible in analysed evidence, and "
               f"{counts.get('uncertain',0)} remain uncertain. Uncertain means unassessed, not accessible.")
    return BriefResponse(origin_label=olabel, destination_label=dlabel, distance_m=main["distance"],
        duration_min=estimated_walking_minutes(main["distance"]),
        route_geojson={"type": "Feature", "geometry": main["geometry"], "properties": {}},
        alternate_geojson=alt_geo, alternate_note=alt_note, segments=segments,
        coverage_pct=pct, coverage_note=cov_note, counts=counts, summary=summary,
        warnings=warnings, integrations=integrations(), timings={"total_s": round(time.perf_counter()-_t0, 2)})
