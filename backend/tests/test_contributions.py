import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_contribution_requires_location():
    assert client.post("/api/contributions", json={"location_text": "  "}).status_code == 400

def test_contribution_rejects_non_mapillary_url():
    r = client.post("/api/contributions", json={"location_text": "Bandra", "mapillary_url": "https://example.com/x"})
    assert r.status_code == 400

def test_contribution_accepted_and_counted():
    before = client.get("/api/contributions/count").json()["count"]
    r = client.post("/api/contributions", json={"location_text": "Linking Road, Bandra", "barrier_type": "kerb", "note": "No dropped kerb at crossing"})
    assert r.status_code == 200 and r.json()["status"] == "received"
    assert client.get("/api/contributions/count").json()["count"] == before + 1
