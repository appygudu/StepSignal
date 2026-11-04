import math
from typing import List, Tuple

R = 6371000.0

def haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def sample_every(coords_lonlat: List[List[float]], every_m: float = 50.0) -> List[Tuple[float, float]]:
    """coords are [lon, lat] from OSRM. Returns (lat, lon) samples ~every_m apart."""
    if not coords_lonlat:
        return []
    pts = [(c[1], c[0]) for c in coords_lonlat]
    samples = [pts[0]]
    acc = 0.0
    for i in range(1, len(pts)):
        seg = haversine_m(pts[i - 1], pts[i])
        acc += seg
        if acc >= every_m:
            samples.append(pts[i])
            acc = 0.0
    if samples[-1] != pts[-1]:
        samples.append(pts[-1])
    return samples

def parse_time_hhmm(t: str) -> int:
    h, m = t.strip().split(":")
    return int(h) * 60 + int(m)
