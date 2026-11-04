from .http_util import post_json
from .geo import haversine_m

MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.nchc.org.tw/api/interpreter"]

def fetch_osm_access(samples):
    """Returns (per-sample osm dict, warning). Absent tags stay 'unknown' — never treated as accessible."""
    if not samples:
        return {}, None
    lats = [s[0] for s in samples]; lons = [s[1] for s in samples]
    pad = 0.002
    bbox = f"{min(lats)-pad},{min(lons)-pad},{max(lats)+pad},{max(lons)+pad}"
    q = f"""[out:json][timeout:20];
( way["highway"]["wheelchair"]({bbox}); way["highway"]["kerb"]({bbox});
  way["highway"]["tactile_paving"]({bbox}); way["highway"]["surface"]({bbox});
  node["kerb"]({bbox}); node["tactile_paving"]({bbox}); node["barrier"]({bbox}); );
out center tags 300;"""
    elements = None
    for m in MIRRORS:
        try:
            elements = post_json(m, q, timeout=25).get("elements", []); break
        except Exception:
            continue
    if elements is None:
        return {}, "OpenStreetMap feature service was unavailable — kerb, tactile paving and surface tags could not be retrieved. Absence here is not evidence about accessibility."
    tagged = []
    for el in elements:
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is not None:
            tagged.append((lat, lon, el.get("tags", {})))
    per = {}
    for i, s in enumerate(samples):
        best = {}
        for (lat, lon, tags) in tagged:
            if haversine_m((lat, lon), s) <= 80:
                for k in ("wheelchair", "kerb", "tactile_paving", "surface", "smoothness", "incline", "barrier"):
                    if k in tags and k not in best:
                        best[k] = tags[k]
        per[i] = best
    return per, None
