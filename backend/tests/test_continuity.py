import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geo import sample_every
from app.services.continuity import classify, coverage
from app.schemas import EvidencePhoto, Segment

def photo(**sig):
    from app.schemas import ImageAccessSignals, Obs
    s = ImageAccessSignals(**{k: Obs(present=v, confidence=0.9, evidence="test") for k, v in sig.items()})
    return EvidencePhoto(image_id="m1", lat=19.05, lon=72.84, captured_at="2025-01-01", signals=s, signals_source="muse_spark")

def test_missing_data_is_uncertain_never_accessible():
    status, _, _, warns = classify([], {})
    assert status == "uncertain" and warns

def test_confirmed_barrier_from_photo():
    status, _, _, _ = classify([photo(steps_or_staircase=True)], {})
    assert status == "confirmed_barrier"

def test_low_confidence_is_not_confirmed():
    from app.schemas import EvidencePhoto, ImageAccessSignals, Obs
    s = ImageAccessSignals(steps_or_staircase=Obs(present=True, confidence=0.3))
    p = EvidencePhoto(image_id="m2", lat=19.05, lon=72.84, signals=s, signals_source="muse_spark")
    status, _, _, _ = classify([p], {})
    assert status == "observed_clear_of_barriers"

def test_unanalysed_photo_is_uncertain():
    p = EvidencePhoto(image_id="m3", lat=19.05, lon=72.84, signals=None, signals_source="unavailable")
    status, _, _, _ = classify([p], {})
    assert status == "uncertain"

def test_coverage_counts():
    segs = [Segment(segment_id="a", index=0, lat=0, lon=0, status="uncertain"),
            Segment(segment_id="b", index=1, lat=0, lon=0, status="confirmed_barrier")]
    pct, note = coverage(segs)
    assert pct == 50.0 and "never described as fully" in note

def test_sampling():
    s = sample_every([[72.84, 19.05], [72.845, 19.055], [72.85, 19.06]], 50)
    assert len(s) >= 3
