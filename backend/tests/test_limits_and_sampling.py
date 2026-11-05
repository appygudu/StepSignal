import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app.services.geo import sample_every, haversine_m, estimated_walking_minutes

client = TestClient(app)

def test_analyse_rejects_oversized_batch():
    photos = [{"image_id": f"i{n}", "thumb_url": "x", "lat": 0, "lon": 0} for n in range(31)]
    assert client.post("/api/stage/analyse", json={"photos": photos}).status_code == 413

def test_analyse_rejects_missing_fields():
    assert client.post("/api/stage/analyse", json={"photos": [{"image_id": "x"}]}).status_code == 400

def test_interpolated_sampling_long_straight():
    # Two vertices ~1.1 km apart must still yield ~50 m samples (interpolation).
    s = sample_every([[72.84, 19.05], [72.85, 19.05]], 50)
    assert len(s) >= 18
    gaps = [haversine_m(s[i - 1], s[i]) for i in range(1, len(s))]
    assert max(gaps) <= 55

def test_sampling_sharp_turn_ordered_no_dupes():
    coords = [[72.84, 19.05], [72.845, 19.05], [72.845, 19.055]]
    s = sample_every(coords, 50)
    assert len(s) == len(set(s)) and s[0] == (19.05, 72.84)

def test_walking_duration_estimate():
    assert estimated_walking_minutes(1166) == 15.5  # 4.5 km/h estimate, not OSRM duration
