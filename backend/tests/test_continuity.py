import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geo import sample_every
from app.services.continuity import classify, coverage
from app.schemas import EvidencePhoto, Segment, ImageAccessSignals, Obs

def photo(pid="m1", date="2025-06-01", **sig):
    s = ImageAccessSignals(**{k: Obs(present=v[0], confidence=v[1], evidence="test") if isinstance(v, tuple) else Obs(present=v, confidence=0.9, evidence="test") for k, v in sig.items()})
    return EvidencePhoto(image_id=pid, lat=19.05, lon=72.84, captured_at=date, signals=s, signals_source="muse_spark")

def clear_photo(pid="c1", date="2025-06-01"):
    s = ImageAccessSignals(**{k: Obs(present=False, confidence=0.9) for k in
        ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"]})
    return EvidencePhoto(image_id=pid, lat=19.05, lon=72.84, captured_at=date, signals=s, signals_source="muse_spark")

def test_no_photos_is_unassessed():
    status, _, _, warns, q, _ = classify([], {})
    assert status == "unassessed" and q == "none" and warns

def test_unanalysed_photo_is_unassessed():
    p = EvidencePhoto(image_id="m3", lat=19.05, lon=72.84, signals=None, signals_source="unavailable")
    assert classify([p], {})[0] == "unassessed"

def test_high_confidence_barrier_confirmed():
    assert classify([photo(steps_or_staircase=(True, 0.95))], {})[0] == "confirmed_barrier"

def test_medium_confidence_is_possible_not_confirmed_not_clear():
    status = classify([photo(steps_or_staircase=(True, 0.6))], {})[0]
    assert status == "possible_barrier"

def test_low_confidence_positive_is_never_clear():
    # Regression: previously a 0.3-confidence steps observation was classified clear.
    status = classify([photo(steps_or_staircase=(True, 0.3))], {})[0]
    assert status == "uncertain" and status != "observed_clear_of_barriers"

def test_all_null_is_uncertain():
    s = ImageAccessSignals()  # every signal present=None
    p = EvidencePhoto(image_id="n1", lat=19.05, lon=72.84, captured_at="2025-06-01", signals=s, signals_source="muse_spark")
    assert classify([p], {})[0] == "uncertain"

def test_clear_requires_explicit_absences():
    assert classify([clear_photo()], {})[0] == "observed_clear_of_barriers"

def test_confirmed_beats_clear_in_mixed_photos():
    assert classify([clear_photo("a"), photo("b", surface_damage=(True, 0.9))], {})[0] == "confirmed_barrier"

def test_possible_beats_clear():
    assert classify([clear_photo("a"), photo("b", pavement_obstruction=(True, 0.55))], {})[0] == "possible_barrier"

def test_old_photo_cannot_be_clear():
    assert classify([clear_photo(date="2015-01-01")], {})[0] == "uncertain"

def test_old_photo_barrier_still_confirmed_but_flagged():
    status, _, _, warns, q, _ = classify([photo("o1", date="2015-01-01", steps_or_staircase=(True, 0.95))], {})
    assert status == "confirmed_barrier" and q == "low" and warns

def test_insufficient_absences_is_uncertain():
    s = ImageAccessSignals(steps_or_staircase=Obs(present=False, confidence=0.9))
    p = EvidencePhoto(image_id="i1", lat=19.05, lon=72.84, captured_at="2025-06-01", signals=s, signals_source="muse_spark")
    assert classify([p], {})[0] == "uncertain"

def test_coverage_counts_analysed_only():
    segs = [Segment(segment_id="a", index=0, lat=0, lon=0, status="unassessed"),
            Segment(segment_id="b", index=1, lat=0, lon=0, status="confirmed_barrier",
                    photos=[EvidencePhoto(image_id="x", lat=0, lon=0, signals=ImageAccessSignals())])]
    pct, note = coverage(segs)
    assert pct == 50.0 and "not accessibility" in note

def test_sampling():
    assert len(sample_every([[72.84, 19.05], [72.845, 19.055], [72.85, 19.06]], 50)) >= 3
