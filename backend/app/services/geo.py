import math
from typing import List, Tuple

R = 6371000.0

def haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def _lerp(a, b, f):
    return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

def sample_every(coords_lonlat: List[List[float]], every_m: float = 50.0) -> List[Tuple[float, float]]:
    """True interpolated sampling: points every `every_m` metres along the
    polyline, including inside long straight vertex spans. Ordered, de-duplicated,
    stable (segment index = position in this list)."""
    if not coords_lonlat:
        return []
    pts = [(c[1], c[0]) for c in coords_lonlat]
    if len(pts) == 1:
        return pts
    samples = [pts[0]]
    target = every_m
    travelled = 0.0
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        seg = haversine_m(a, b)
        if seg == 0:
            continue
        while travelled + seg >= target:
            f = (target - travelled) / seg
            p = _lerp(a, b, f)
            if haversine_m(samples[-1], p) > 1.0:
                samples.append(p)
            target += every_m
        travelled += seg
    if haversine_m(samples[-1], pts[-1]) > 1.0:
        samples.append(pts[-1])
    return samples

def parse_time_hhmm(t: str) -> int:
    h, m = t.strip().split(":")
    return int(h) * 60 + int(m)

# OSRM's foot profile duration is not a credible walking estimate for our
# users (it produced 1.5 min for 1.17 km). We label our own estimate clearly.
WALKING_SPEED_M_PER_MIN = 75.0  # 4.5 km/h, configurable estimate, not a measurement

def estimated_walking_minutes(distance_m: float) -> float:
    return round(distance_m / WALKING_SPEED_M_PER_MIN, 1)
