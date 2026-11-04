import os
from datetime import datetime, timezone
from .geo import haversine_m
from .http_util import get_json

def normalize_captured_at(value):
    """Mapillary returns captured_at as epoch milliseconds (int) or ISO string."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return str(value)

def fetch_photos(samples, limit_per_sample=3):
    token = os.environ.get("MAPILLARY_ACCESS_TOKEN", "").strip()
    if not token:
        return {}, "MAPILLARY_ACCESS_TOKEN not set — no photographs retrieved. Add a free token from mapillary.com to enable evidence photos."
    # Samples are independent — fetch concurrently (was sequential, ~1s+ per sample).
    from concurrent.futures import ThreadPoolExecutor
    def _fetch(item):
        i, (lat, lon) = item
        d = 0.00045
        try:
            items = get_json("https://graph.mapillary.com/images",
                params={"access_token": token, "fields": "id,captured_at,geometry,thumb_1024_url,compass_angle",
                        "bbox": f"{lon-d},{lat-d},{lon+d},{lat+d}", "limit": 10},
                timeout=12).get("data", [])
        except Exception:
            return i, []
        scored = []
        for im in items:
            coords = (im.get("geometry") or {}).get("coordinates") or [lon, lat]
            scored.append((haversine_m((lat, lon), (coords[1], coords[0])), im, coords[1], coords[0]))
        scored.sort(key=lambda x: x[0])
        return i, [{"image_id": im["id"], "thumb_url": im.get("thumb_1024_url"),
                     "captured_at": normalize_captured_at(im.get("captured_at")), "lat": ilat, "lon": ilon}
                    for _dist, im, ilat, ilon in scored[:limit_per_sample]]
    by_idx, seen = {}, set()
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, picked in sorted(ex.map(_fetch, enumerate(samples))):
            uniq = []
            for p in picked:
                if p["image_id"] not in seen:
                    seen.add(p["image_id"]); uniq.append(p)
            if uniq:
                by_idx[i] = uniq
    return by_idx, None
