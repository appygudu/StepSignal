"""Authoritative evidence classification engine (backend is the single source).

Taxonomy per observation: CONFIRMED / POSSIBLE / UNKNOWN / NOT OBSERVED.
Stretch statuses: confirmed_barrier | possible_barrier |
observed_clear_of_barriers | uncertain | unassessed.

Threshold rationale (configurable, not magic):
- CONFIRMED_THRESHOLD 0.75: above this, a positive visual observation is
  treated as established *in that photograph's field of view at capture time*.
- POSSIBLE_THRESHOLD 0.45: a positive below confirmed strength may be real;
  it must never be dismissed as clear, so it yields possible_barrier.
- A positive below POSSIBLE is too weak to act on but also cannot be used
  as evidence of absence -> the stretch stays uncertain.
- observed_clear_of_barriers requires at least MIN_CLEAR_FEATURES barrier
  features explicitly observed absent (present=False, conf>=0.5) in an
  analysed photo, no positive >= POSSIBLE, and evidence that is not stale.
  It is always scoped to the listed photographs and their field of view.
- Evidence older than STALE_YEARS cannot support a clear classification.
"""
from datetime import datetime, timezone

CONFIRMED_THRESHOLD = 0.75
POSSIBLE_THRESHOLD = 0.45
CLEAR_ABSENT_CONFIDENCE = 0.5
MIN_CLEAR_FEATURES = 3
STALE_YEARS = 5

BARRIER_SIGNALS = ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"]
HELPFUL_SIGNALS = ["kerb_ramp", "tactile_paving", "visible_ramp", "pedestrian_crossing"]

def _photo_age_years(captured_at):
    if not captured_at:
        return None
    try:
        dt = datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days / 365.25
    except Exception:
        return None

def classify(photos, osm):
    obs, warns = [], []
    if not photos:
        warns.append("No street-level photograph retrieved for this stretch — status is unassessed, not accessible.")
        return "unassessed", "No photograph available for this stretch.", obs, warns, "none", True
    analysed = [p for p in photos if p.signals]
    for p in photos:
        if p.captured_at:
            obs.append(f"Photo {p.image_id} captured {str(p.captured_at)[:10]}")
        if not p.signals:
            warns.append(f"Photo {p.image_id}: not analysed — this stretch cannot be assessed from this photo.")
    if not analysed:
        return "unassessed", "Photograph(s) present but not analysed. No claim is made.", obs, warns, "none", True

    confirmed, possible, weak_positive = [], [], False
    absent_features = set()
    null_count = total = 0
    for p in analysed:
        s = p.signals
        for name in BARRIER_SIGNALS:
            o = getattr(s, name); total += 1
            if o.present is None:
                null_count += 1
            elif o.present is True and o.confidence >= CONFIRMED_THRESHOLD:
                confirmed.append(name)
                obs.append(f"{name.replace('_',' ')} observed in photo {p.image_id} (confidence {o.confidence:.2f}, confirmed in this photo's field of view){': ' + o.evidence if o.evidence else ''}")
            elif o.present is True and o.confidence >= POSSIBLE_THRESHOLD:
                possible.append(name)
                obs.append(f"{name.replace('_',' ')} possibly present in photo {p.image_id} (confidence {o.confidence:.2f}) — possible, not confirmed{': ' + o.evidence if o.evidence else ''}")
            elif o.present is True:
                weak_positive = True
                obs.append(f"{name.replace('_',' ')} weakly suggested in photo {p.image_id} (confidence {o.confidence:.2f}) — insufficient to confirm, and not evidence of absence")
            elif o.present is False and o.confidence >= CLEAR_ABSENT_CONFIDENCE:
                absent_features.add(name)
        for name in HELPFUL_SIGNALS:
            o = getattr(s, name)
            if o.present is True and o.confidence >= POSSIBLE_THRESHOLD:
                obs.append(f"{name.replace('_',' ')} observed in photo {p.image_id} (confidence {o.confidence:.2f})")
        if s.steep_gradient_suspected.present is True:
            obs.append(f"Steep gradient visually suspected in photo {p.image_id} (confidence {s.steep_gradient_suspected.confidence:.2f}) — not a measured gradient; human verification required")

    if osm.get("barrier"):
        confirmed.append("osm_barrier")
        obs.append(f"Map data: barrier={osm['barrier']} recorded near this stretch (source element, may be outdated)")
    for k in ("kerb", "tactile_paving", "surface", "wheelchair"):
        if k in osm:
            obs.append(f"Map data: {k}={osm[k]} (mapper-recorded; a tag describes the mapped element, not the whole stretch)")

    ages = [a for a in (_photo_age_years(p.captured_at) for p in analysed) if a is not None]
    stale = bool(ages) and min(ages) > STALE_YEARS
    if stale:
        warns.append(f"Newest analysed photograph is over {STALE_YEARS} years old — evidence quality reduced; conditions may have changed.")
    quality = "low" if stale else ("medium" if null_count and total and null_count / total > 0.4 else "high")

    if confirmed:
        return "confirmed_barrier", f"Confirmed barrier evidence in the analysed photograph(s): {', '.join(sorted(set(confirmed)))}. Scoped to those photos' field of view and capture dates.", obs, warns, quality, False
    if possible:
        return "possible_barrier", f"Possible barrier evidence (below confirmed strength): {', '.join(sorted(set(possible)))}. Requires human verification — not confirmed, and not clear.", obs, warns, quality, True
    if weak_positive:
        return "uncertain", "A barrier was weakly suggested but below the possible threshold. This is not evidence of absence.", obs, warns, quality, True
    if stale:
        return "uncertain", "No barrier confirmed, but the analysed evidence is historical. A current clear classification is not supported.", obs, warns, quality, True
    if len(absent_features) >= MIN_CLEAR_FEATURES:
        return "observed_clear_of_barriers", f"No barrier was visible in {len(analysed)} analysed photograph(s), within their field of view at capture time ({', '.join(sorted(absent_features))} explicitly not observed). This does not certify the stretch or route as accessible.", obs, warns, quality, False
    return "uncertain", "Analysed evidence is insufficient to support a clear classification (too many unknown features).", obs, warns, quality, True

def coverage(segments):
    assessed = sum(1 for s in segments if s.status not in ("unassessed",))
    analysed = sum(1 for s in segments if any(p.signals for p in s.photos))
    pct = round(100 * analysed / len(segments), 1) if segments else 0.0
    note = (f"Evidence coverage: {analysed} of {len(segments)} stretches have AI-analysed photograph evidence "
            f"({assessed} have some classification basis). Coverage means evidence availability, not accessibility. "
            f"A route is never described as fully wheelchair accessible on partial coverage.")
    return pct, note
