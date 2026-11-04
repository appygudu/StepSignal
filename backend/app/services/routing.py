from .http_util import get_json

NOMINATIM = "https://nominatim.openstreetmap.org/search"
OSRM = "https://router.project-osrm.org/route/v1/foot"

# Demo presets — Bandra West, Mumbai (one neighbourhood, end to end)
PRESETS = {
    "bandra station": (19.0544, 72.8402),
    "bandra railway station": (19.0544, 72.8402),
    "linking road bandra": (19.0596, 72.8346),
    "linking road": (19.0596, 72.8346),
    "bandra fort": (19.0417, 72.8185),
    "mount mary church": (19.0466, 72.8222),
    "bandstand bandra": (19.0430, 72.8210),
    "bandstand": (19.0430, 72.8210),
    "carters road bandra": (19.0660, 72.8235),
}

def parse_place(text: str):
    t = text.strip()
    if "," in t:
        parts = [p.strip() for p in t.split(",")]
        try:
            return float(parts[0]), float(parts[1]), t
        except ValueError:
            pass
    key = t.lower()
    if key in PRESETS:
        lat, lon = PRESETS[key]
        return lat, lon, text
    data = get_json(NOMINATIM, params={"q": text, "format": "json", "limit": 1}, timeout=12)
    if not data:
        raise ValueError(f"Could not find place: {text}")
    return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", text)

def get_route(origin, dest):
    (olat, olon), (dlat, dlon) = origin, dest
    url = f"{OSRM}/{olon},{olat};{dlon},{dlat}"
    data = get_json(url, params={"overview": "full", "geometries": "geojson", "alternatives": "1"}, timeout=15)
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError("No walking route found")
    return data["routes"]
