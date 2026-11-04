"""Full-route batch analysis: one Muse Spark call per uncached photo, cached forever.
Usage: .venv/bin/python scripts/run_full_route.py "Bandra Station" "Linking Road Bandra"
Writes docs/evidence-report.json. Actual images are embedded base64 (never sent as URLs)."""
import json, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.main import cache_get, cache_put
from app.schemas import ImageAccessSignals
from app.services.routing import parse_place, get_route
from app.services.geo import sample_every
from app.services.osm_access import fetch_osm_access
from app.services.mapillary import fetch_photos
from app.services.vision import analyse_photo
from app.services.continuity import classify, coverage

def main():
    origin, dest = sys.argv[1], sys.argv[2]
    olat, olon, olabel = parse_place(origin)
    dlat, dlon, dlabel = parse_place(dest)
    routes = get_route((olat, olon), (dlat, dlon))
    main_route = routes[0]
    samples = sample_every(main_route["geometry"]["coordinates"], 50.0)
    print(f"samples={len(samples)}", flush=True)
    osm_by_idx, osm_warn = fetch_osm_access(samples)
    print(f"osm_done warn={bool(osm_warn)}", flush=True)
    photos_by_idx, map_warn = fetch_photos(samples)
    all_photos = [(i, p) for i, ps in photos_by_idx.items() for p in ps]
    print(f"photos_total={len(all_photos)}", flush=True)

    results, stats = {}, {"cached": 0, "success": 0, "failed": 0, "calls": 0}
    def work(item):
        i, p = item
        cached = cache_get(p["image_id"])
        if cached:
            return p["image_id"], ImageAccessSignals(**cached), "cached"
        sig, src = analyse_photo(p)
        if sig:
            cache_put(p["image_id"], sig.model_dump())
            return p["image_id"], sig, "analysed"
        return p["image_id"], None, "failed"

    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(work, it): it for it in all_photos}
        for f in as_completed(futs):
            iid, sig, how = f.result()
            results[iid] = sig
            if how == "cached": stats["cached"] += 1
            elif how == "analysed": stats["success"] += 1; stats["calls"] += 1
            else: stats["failed"] += 1; stats["calls"] += 1
            print(f"progress {sum(1 for _ in results)}/{len(all_photos)} {how} {iid}", flush=True)

    segments_out = []
    from app.schemas import Segment, EvidencePhoto
    segments = []
    for i, (lat, lon) in enumerate(samples):
        photos = []
        for p in photos_by_idx.get(i, []):
            sig = results.get(p["image_id"])
            photos.append(EvidencePhoto(**p, signals=sig,
                signals_source="muse_spark" if sig else "unavailable"))
        status, reason, obs, warns = classify(photos, osm_by_idx.get(i, {}))
        seg = Segment(segment_id=f"seg-{i}", index=i, lat=lat, lon=lon, status=status,
                      status_reason=reason, osm=osm_by_idx.get(i, {}), photos=photos,
                      observations=obs, warnings=warns)
        segments.append(seg)
    pct, cov_note = coverage(segments)
    from collections import Counter
    report = {
        "origin": olabel, "destination": dlabel,
        "distance_m": main_route["distance"], "duration_min": round(main_route["duration"]/60, 1),
        "route_geojson": {"type": "Feature", "geometry": main_route["geometry"], "properties": {}},
        "alternate_geojson": {"type": "Feature", "geometry": routes[1]["geometry"], "properties": {}} if len(routes) > 1 else None,
        "segments": [s.model_dump() for s in segments],
        "coverage_pct": pct, "coverage_note": cov_note,
        "counts": dict(Counter(s.status for s in segments)),
        "stats": stats,
        "warnings": [w for w in [map_warn, osm_warn] if w],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    out = Path(__file__).resolve().parents[2] / "docs" / "evidence-report.json"
    out.write_text(json.dumps(report, indent=1))
    print(f"REPORT {out} coverage={pct} counts={report['counts']} stats={stats}", flush=True)

if __name__ == "__main__":
    main()
