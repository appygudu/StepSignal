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
    by_idx, seen = {}, set()
    for i, (lat, lon) in enumerate(samples):
        d = 0.00045  # ~50m box
        try:
            items = get_json("https://graph.mapillary.com/images",
                params={"access_token": token, "fields": "id,captured_at,geometry,thumb_1024_url,compass_angle",
                        "bbox": f"{lon-d},{lat-d},{lon+d},{lat+d}", "limit": 10},
                timeout=12).get("data", [])
        except Exception:
            continue
        scored = []
        for im in items:
            coords = (im.get("geometry") or {}).get("coordinates") or [lon, lat]
            ilon, ilat = coords[0], coords[1]
            scored.append((haversine_m((lat, lon), (ilat, ilon)), im, ilat, ilon))
        scored.sort(key=lambda x: x[0])
        picked = []
        for dist, im, ilat, ilon in scored[:limit_per_sample]:
            if im["id"] in seen:
                continue
            seen.add(im["id"])
            picked.append({"image_id": im["id"], "thumb_url": im.get("thumb_1024_url"),
                           "captured_at": normalize_captured_at(im.get("captured_at")), "lat": ilat, "lon": ilon})
        if picked:
            by_idx[i] = picked
    return by_idx, None
