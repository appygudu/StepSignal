import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app, _cache_key

client = TestClient(app)

def test_cache_key_is_versioned():
    # Cache is invalidated by model + prompt + schema version.
    assert _cache_key("123").endswith(":123") and "muse-spark" in _cache_key("123")

def test_stage_route_shape(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "parse_place", lambda t: (19.05, 72.84, t))
    monkeypatch.setattr(m, "get_route", lambda o, d: [{"distance": 1000, "duration": 600, "geometry": {"type": "LineString", "coordinates": [[72.84, 19.05], [72.845, 19.055], [72.85, 19.06]]}}])
    r = client.post("/api/stage/route", json={"origin": "A", "destination": "B"})
    assert r.status_code == 200
    d = r.json(); assert d["distance_m"] == 1000 and len(d["samples"]) >= 2 and "routing_s" in d["timings"]

def test_stage_analyse_uses_cache_without_api(monkeypatch):
    import app.main as m
    from app.schemas import ImageAccessSignals
    m.cache_put(m._cache_key("img-cached"), ImageAccessSignals().model_dump())
    monkeypatch.setattr(m, "analyse_photo", lambda p: (_ for _ in ()).throw(AssertionError("API must not be called for cached photo")))
    r = client.post("/api/stage/analyse", json={"photos": [{"image_id": "img-cached", "thumb_url": "x", "lat": 0, "lon": 0}]})
    assert r.status_code == 200
    d = r.json(); assert d["stats"]["cached"] == 1 and d["results"]["img-cached"] is not None

def test_stage_analyse_failure_is_null_not_fabricated(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "analyse_photo", lambda p: (None, "unavailable"))
    r = client.post("/api/stage/analyse", json={"photos": [{"image_id": "img-fail-xyz", "thumb_url": "x", "lat": 0, "lon": 0}]})
    d = r.json(); assert d["stats"]["failed"] == 1 and d["results"]["img-fail-xyz"] is None
