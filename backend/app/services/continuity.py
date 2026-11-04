"""Accessibility continuity engine.
Rules: missing evidence = uncertain (never accessible). A confirmed barrier needs
photo or OSM evidence at confidence >= 0.6. 'observed_clear_of_barriers' needs a
photo analysis that looked and found no barrier — it is NOT 'fully accessible'."""

BARRIER_SIGNALS = ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"]
HELPFUL_SIGNALS = ["kerb_ramp", "tactile_paving", "visible_ramp", "pedestrian_crossing"]

def classify(photos, osm):
    obs, warns = [], []
    confirmed = []
    looked = False
    for p in photos:
        s = p.signals
        if p.captured_at:
            obs.append(f"Photo {p.image_id} captured {str(p.captured_at)[:10]}")
        if not s:
            warns.append(f"Photo {p.image_id}: not analysed (vision model unavailable) — this stretch cannot be assessed from this photo.")
            continue
        looked = True
        for name in BARRIER_SIGNALS:
            o = getattr(s, name)
            if o.present is True and o.confidence >= 0.6:
                confirmed.append(name)
                obs.append(f"{name.replace('_',' ')} observed in photo {p.image_id} (confidence {o.confidence:.2f}){': ' + o.evidence if o.evidence else ''}")
            elif o.present is True:
                obs.append(f"{name.replace('_',' ')} possibly present in photo {p.image_id} but low confidence ({o.confidence:.2f}) — treated as uncertain")
        for name in HELPFUL_SIGNALS:
            o = getattr(s, name)
            if o.present is True and o.confidence >= 0.6:
                obs.append(f"{name.replace('_',' ')} observed in photo {p.image_id} (confidence {o.confidence:.2f})")
        if s.steep_gradient_suspected.present is True:
            obs.append(f"Steep gradient visually suspected in photo {p.image_id} (confidence {s.steep_gradient_suspected.confidence:.2f}) — not a measured gradient")
    if osm.get("kerb") == "no":
        confirmed.append("kerb_no")
        obs.append("Map data: kerb tagged 'no' near this stretch (no dropped kerb recorded)")
    if osm.get("barrier"):
        confirmed.append("osm_barrier")
        obs.append(f"Map data: barrier={osm['barrier']} recorded near this stretch")
    if osm.get("wheelchair"):
        obs.append(f"Map data: wheelchair={osm['wheelchair']} tagged nearby (mapper-recorded, may be outdated)")
    for k in ("kerb", "tactile_paving", "surface"):
        if k in osm:
            obs.append(f"Map data: {k}={osm[k]}")
    if confirmed:
        return "confirmed_barrier", f"Barrier evidence: {', '.join(sorted(set(confirmed)))}", obs, warns
    if looked:
        return "observed_clear_of_barriers", "No barrier was visible in the analysed photo evidence. This is not a claim of full accessibility.", obs, warns
    if not photos:
        warns.append("No street-level photograph retrieved for this stretch — status is uncertain, not accessible.")
    return "uncertain", "Insufficient evidence to assess this stretch.", obs, warns

def coverage(segments):
    assessed = sum(1 for s in segments if s.status != "uncertain")
    pct = round(100 * assessed / len(segments), 1) if segments else 0.0
    note = (f"Evidence coverage: {assessed} of {len(segments)} stretches have analysable photo or map evidence. "
            f"{len(segments)-assessed} stretch(es) remain uncertain. A route is never described as fully wheelchair accessible on partial coverage.")
    return pct, note
