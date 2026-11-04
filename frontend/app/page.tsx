"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
type Photo = { image_id: string; thumb_url?: string; captured_at?: string; signals_source: string; sam_status: string; sam_mask_url?: string; signals?: Record<string, { present: boolean | null; confidence: number; evidence: string }> };
type Seg = { segment_id: string; index: number; lat: number; lon: number; status: string; status_reason: string; osm: Record<string, string>; photos: Photo[]; observations: string[]; warnings: string[] };
type Brief = { summary: string; distance_m: number; duration_min: number; route_geojson: any; alternate_geojson?: any; alternate_note?: string; segments: Seg[]; coverage_pct: number; coverage_note: string; counts: Record<string, number>; limits: string[]; warnings: string[]; integrations: Record<string, string> };

const colour = (s: string) => s === "confirmed_barrier" ? "#e4572e" : s === "observed_clear_of_barriers" ? "#2a9d8f" : "#8b98a8";
const label = (s: string) => s === "confirmed_barrier" ? "Confirmed barrier" : s === "observed_clear_of_barriers" ? "No barrier visible in evidence" : "Uncertain — insufficient evidence";
const BARRIERS = ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"] as const;
const HELPERS = ["kerb_ramp", "tactile_paving", "visible_ramp", "pedestrian_crossing"] as const;
const pretty = (k: string) => k.replaceAll("_", " ");

function barrierHits(s: Seg) {
  const hits: { kind: string; conf: number; photo: Photo }[] = [];
  for (const p of s.photos) for (const k of BARRIERS) {
    const v = p.signals?.[k];
    if (v?.present === true && v.confidence >= 0.6) hits.push({ kind: k, conf: v.confidence, photo: p });
  }
  return hits;
}
function ageLabel(d?: string) {
  if (!d) return "date unavailable";
  const yrs = (Date.now() - new Date(d).getTime()) / 3.15576e10;
  return yrs < 1 ? `${d.slice(0, 10)} · under 1 yr old` : `${d.slice(0, 10)} · ${yrs.toFixed(1)} yrs old`;
}

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null); const mapObj = useRef<any>(null); const markers = useRef<any[]>([]);
  const [origin, setOrigin] = useState("Bandra Station");
  const [destination, setDestination] = useState("Linking Road Bandra");
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<Seg | null>(null);
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [tilt, setTilt] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = new maplibregl.Map({ container: mapRef.current, style: "https://demotiles.maplibre.org/style.json", center: [72.837, 19.057], zoom: 14.5, pitch: 58, bearing: -18, antialias: true });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.on("load", () => { try { map.setSky?.({ "sky-color": "#0d1117", "horizon-color": "#243447", "fog-color": "#0d1117" }); } catch {} });
    mapObj.current = map;
  }, []);

  useEffect(() => { if (mapObj.current) mapObj.current.easeTo({ pitch: tilt ? 58 : 0, bearing: tilt ? -18 : 0, duration: 600 }); }, [tilt]);

  const filtered = useMemo(() => !data ? [] : data.segments.filter(s => filter === "all" || s.status === filter), [data, filter]);
  const barrierCounts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.segments.forEach(s => barrierHits(s).forEach(h => { c[h.kind] = (c[h.kind] || 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [data]);
  const gaps = useMemo(() => data?.segments.filter(s => s.status === "uncertain") || [], [data]);
  const allPhotos = useMemo(() => data?.segments.flatMap(s => s.photos) || [], [data]);

  useEffect(() => {
    const map = mapObj.current; if (!map || !data) return;
    const draw = () => {
      markers.current.forEach(m => m.remove()); markers.current = [];
      for (const id of ["route-shadow", "route", "alt"]) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
      map.addSource("route", { type: "geojson", data: data.route_geojson });
      map.addLayer({ id: "route-shadow", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#000000", "line-width": 11, "line-opacity": 0.45, "line-blur": 4, "line-translate": [0, 5] } });
      map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#f2c14e", "line-width": 5 } });
      if (data.alternate_geojson) { map.addSource("alt", { type: "geojson", data: data.alternate_geojson }); map.addLayer({ id: "alt", type: "line", source: "alt", paint: { "line-color": "#6cb4ee", "line-width": 3.5, "line-dasharray": [2, 2] } }); }
      data.segments.forEach(s => {
        const el = document.createElement("button");
        el.className = "pin"; el.style.background = colour(s.status); el.setAttribute("aria-label", `Stretch ${s.index + 1}: ${label(s.status)}`);
        el.innerHTML = `<span>${s.index + 1}</span>`;
        el.style.opacity = (filter === "all" || s.status === filter) ? "1" : "0.25";
        el.onclick = () => { setSelected(s); map.flyTo({ center: [s.lon, s.lat], zoom: 16.5, pitch: tilt ? 58 : 0, duration: 700 }); };
        markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(map));
      });
      const coords = data.route_geojson.geometry.coordinates;
      map.fitBounds(coords.reduce((b: any, c: any) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0])), { padding: 55, pitch: tilt ? 58 : 0 });
    };
    if (map.loaded()) draw(); else map.on("load", draw);
  }, [data, filter]);

  async function loadReport() {
    setLoading(true); setError("");
    try { const r = await fetch(`${API}/api/report`); const j = await r.json(); if (!r.ok) throw new Error(j.detail || "No verified report"); setData(j); setSelected(null); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadReport(); }, []);
  async function submit() {
    setLoading(true); setError("");
    try { const r = await fetch(`${API}/api/brief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin, destination }) }); const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Request failed"); setData(j); setSelected(null); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "#111820" }}>
        <div><strong style={{ fontSize: 20, letterSpacing: ".2px" }}>StepSignal</strong><span style={{ color: "var(--muted)", fontSize: 13 }}> &nbsp;Bandra West · street-level accessibility evidence</span></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button className="chip" aria-pressed={tilt} onClick={() => setTilt(!tilt)}>{tilt ? "3D tilt on" : "3D tilt off"}</button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{allPhotos.length} verified photos</span>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", minHeight: 0 }}>
        <section style={{ position: "relative", minHeight: "62vh" }} aria-label="Route map">
          <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", left: 16, bottom: 16, zIndex: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["all", "All stretches"], ["confirmed_barrier", "Confirmed barriers"], ["observed_clear_of_barriers", "No barrier visible"], ["uncertain", "Uncertain"]].map(([k, t]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
          </div>
          {selected && <div style={{ position: "absolute", right: 16, top: 16, zIndex: 2, width: 330, maxWidth: "88vw", maxHeight: "78%", overflowY: "auto" }} className="panel" role="dialog" aria-label={`Stretch ${selected.index + 1} detail`}>
            <button onClick={() => setSelected(null)} style={{ float: "right" }} className="chip">Close</button>
            <h2 style={{ margin: "2px 0 4px", fontSize: 17 }}>Stretch #{selected.index + 1}</h2>
            <p style={{ margin: "0 0 8px", color: colour(selected.status), fontWeight: 700, fontSize: 13 }}>{label(selected.status)}</p>
            <p style={{ fontSize: 13, lineHeight: 1.5 }}>{selected.status_reason}</p>
            {barrierHits(selected).map((h, i) => <p key={i} style={{ fontSize: 13 }}>Barrier: <b>{pretty(h.kind)}</b> · confidence {(h.conf * 100).toFixed(0)}% · photo {h.photo.image_id} · {ageLabel(h.photo.captured_at)}</p>)}
            {selected.photos.length === 0 && <p style={{ fontSize: 13, color: "var(--amber)" }}>No photograph exists for this stretch in Mapillary. It stays uncertain — the nearest evidence is on a neighbouring numbered stretch. Absence of a photo is not evidence of accessibility.</p>}
            {selected.photos.map(p => <figure key={p.image_id} style={{ margin: "12px 0" }}>
              {p.thumb_url && <img className="thumb" src={p.thumb_url} alt={`Street evidence photo ${p.image_id}`} onClick={() => setLightbox(p)} style={{ cursor: "zoom-in" }} />}
              <figcaption style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Mapillary {p.image_id} · {ageLabel(p.captured_at)} · Muse Spark: {p.signals_source === "muse_spark" ? "analysed" : "not analysed"} · SAM mask: {p.sam_mask_url ? "available" : "unavailable (SAM 3.1 not configured — no mask fabricated)"}</figcaption>
              {p.signals && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{Object.entries(p.signals).map(([k, v]) => <span key={k} className="chip" title={v.evidence || "no evidence text"} style={{ cursor: "default" }}>{pretty(k)}: {v.present === null ? "unknown" : v.present ? "yes" : "no"} · {(v.confidence * 100).toFixed(0)}%</span>)}</div>}
              {p.signals && Object.values(p.signals).filter(v => v.evidence).slice(0, 3).map((v, i) => <p key={i} style={{ fontSize: 12, color: "var(--muted)" }}>{v.evidence} ({(v.confidence * 100).toFixed(0)}%)</p>)}
            </figure>)}
            {selected.observations.map((o, i) => <p key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>• {o}</p>)}
            {selected.warnings.map((w, i) => <p key={i} style={{ fontSize: 13, color: "var(--amber)" }}>{w}</p>)}
          </div>}
        </section>
        <aside style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, borderLeft: "1px solid var(--line)" }}>
          <div className="panel">
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Origin<input value={origin} onChange={e => setOrigin(e.target.value)} style={{ width: "100%", padding: 9, margin: "4px 0 8px", borderRadius: 6, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--line)" }} /></label>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Destination<input value={destination} onChange={e => setDestination(e.target.value)} style={{ width: "100%", padding: 9, margin: "4px 0 8px", borderRadius: 6, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--line)" }} /></label>
            <button onClick={loadReport} style={{ width: "100%", padding: 11, marginBottom: 8, borderRadius: 6, background: "var(--teal)", border: "none", fontWeight: 700, cursor: "pointer" }}>Show verified Bandra report (cached)</button>
            <button onClick={submit} disabled={loading} style={{ width: "100%", padding: 11, borderRadius: 6, background: "var(--amber)", border: "none", fontWeight: 700, cursor: "pointer" }}>{loading ? "Loading…" : "Analyse a new route (may use paid vision calls)"}</button>
            {error && <p style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p>}
          </div>
          {data && <>
            <div className="panel">
              <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Route continuity</h2>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div aria-label={`Coverage ${data.coverage_pct}%`} style={{ width: 92, height: 92, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(var(--amber) ${data.coverage_pct}%, #26313f 0)`, display: "grid", placeItems: "center" }}><div style={{ width: 66, height: 66, borderRadius: "50%", background: "var(--panel)", display: "grid", placeItems: "center", fontWeight: 800 }}>{data.coverage_pct}%</div></div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <div><span style={{ color: "var(--red)" }}>●</span> {data.counts.confirmed_barrier || 0} confirmed barrier</div>
                  <div><span style={{ color: "var(--teal)" }}>●</span> {data.counts.observed_clear_of_barriers || 0} no barrier visible</div>
                  <div><span style={{ color: "var(--grey)" }}>●</span> {data.counts.uncertain || 0} uncertain</div>
                  <div style={{ color: "var(--muted)" }}>{(data.distance_m / 1000).toFixed(1)} km · ~{data.duration_min} min</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{data.coverage_note}</p>
              {barrierCounts.length > 0 && <><h3 style={{ fontSize: 14, margin: "10px 0 6px" }}>Barrier types detected</h3>{barrierCounts.map(([k, n]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 13, marginBottom: 5 }}><span>{pretty(k)}</span><b>{n}</b><div className="bar-track" style={{ gridColumn: "1 / -1" }}><div className="bar-fill" style={{ width: `${Math.min(100, n * 12)}%`, background: "var(--red)" }} /></div></div>)}</>}
            </div>
            <div className="panel"><h3 style={{ marginTop: 0, fontSize: 15 }}>Stretches</h3><div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {filtered.map(s => <button key={s.segment_id} onClick={() => setSelected(s)} style={{ textAlign: "left", padding: "10px 11px", borderRadius: 6, background: selected?.segment_id === s.segment_id ? "var(--panel2)" : "#111820", color: "var(--text)", border: "1px solid var(--line)", cursor: "pointer" }}><b>#{s.index + 1}</b> · <span style={{ color: colour(s.status) }}>{label(s.status)}</span><span style={{ color: "var(--muted)" }}> · {s.photos.length} photo(s){barrierHits(s).length ? ` · ${barrierHits(s).length} barrier obs.` : ""}</span></button>)}
              {filtered.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>No stretches match this filter.</p>}
            </div></div>
            <div className="panel"><h3 style={{ marginTop: 0, fontSize: 15 }}>Evidence gaps — not accessible, just unassessed</h3>
              {gaps.length === 0 ? <p style={{ fontSize: 13 }}>Every stretch has analysable evidence.</p> : gaps.map(s => <p key={s.segment_id} style={{ fontSize: 13, lineHeight: 1.5 }}>Stretch #{s.index + 1}: {s.photos.length === 0 ? "no Mapillary photograph retrieved" : "photograph present but not analysed"}. It is excluded from the coverage numerator.</p>)}
              <p style={{ fontSize: 12, color: "var(--muted)" }}>OpenStreetMap kerb/tactile corroboration: currently unavailable from this network (public Overpass mirrors unreachable). The route report says so explicitly rather than treating missing tags as missing features. SAM 3.1 masks: not configured, so vision observations are shown as text and chips instead of a fabricated overlay.</p>
            </div>
            <div className="panel"><h3 style={{ marginTop: 0, fontSize: 15 }}>Limits</h3>{data.limits.map((l, i) => <p key={i} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>• {l}</p>)}</div>
          </>}
        </aside>
      </div>
      {lightbox && <div role="dialog" aria-modal="true" aria-label="Photo enlarged" onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(4,7,11,.9)", zIndex: 50, display: "grid", placeItems: "center", padding: 20 }}>
        <figure style={{ maxWidth: 900, width: "100%" }}>{lightbox.thumb_url && <img src={lightbox.thumb_url} alt={`Enlarged street evidence photo ${lightbox.image_id}`} style={{ width: "100%", borderRadius: 8 }} />}<figcaption style={{ fontSize: 13, marginTop: 10 }}>Mapillary {lightbox.image_id} · {ageLabel(lightbox.captured_at)} — click anywhere to close</figcaption></figure>
      </div>}
    </main>
  );
}
