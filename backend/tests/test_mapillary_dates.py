import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.mapillary import normalize_captured_at
from app.schemas import EvidencePhoto

def test_epoch_ms_converts_to_iso_date():
    out = normalize_captured_at(1750841510168)
    assert isinstance(out, str) and out.startswith("2025-06-25")

def test_iso_string_passthrough():
    assert normalize_captured_at("2024-03-01T10:00:00Z").startswith("2024-03-01")

def test_none_stays_none():
    assert normalize_captured_at(None) is None

def test_evidence_photo_accepts_normalized():
    p = EvidencePhoto(image_id="x", lat=19.05, lon=72.84, captured_at=normalize_captured_at(1750841510168))
    assert p.captured_at.startswith("2025-06-25")
