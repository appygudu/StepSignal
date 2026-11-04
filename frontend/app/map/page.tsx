"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
type Sig = { present: boolean | null; confidence: number; evidence: string };
type Photo = { image_id: string; thumb_url?: string; captured_at?: string; lat?: number; lon?: number; signals_source: string; sam_status: string; sam_mask_url?: string; signals?: Record<string, Sig> };
type Seg = { segment_id: string; index: number; lat: number; lon: number; status: string; status_reason: string; osm: Record<string, string>; photos: Photo[]; observations: string[]; warnings: string[] };
type Brief = { summary: string; distance_m: number; duration_min: number; route_geojson: any; alternate_geojson?: any; alternate_note?: string; segments: Seg[]; coverage_pct: number; coverage_note: string; counts: Record<string, number>; limits: string[]; warnings: string[]; integrations: Record<string, string> };

const colour = (s: string) => s === "confirmed_barrier" ? "#e4572e" : s === "observed_clear_of_barriers" ? "#2fa58f" : "#93a3b5";
const label = (s: string) => s === "confirmed_barrier" ? "Confirmed barrier" : s === "observed_clear_of_barriers" ? "No barrier visible in evidence" : "Uncertain — insufficient evidence";
const BARRIERS = ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"] as const;
const pretty = (k: string) => k.replaceAll("_", " ");
function hits(s: Seg, kind?: string) {
  const out: { kind: string; conf: number; photo: Photo }[] = [];
  for (const p of s.photos) for (const k of BARRIERS) {
    if (kind && kind !== "all" && k !== kind) continue;
    const v = p.signals?.[k]; if (v?.present === true && v.confidence >= 0.6) out.push({ kind: k, conf: v.confidence, photo: p });
  }
  return out;
}
const dateOf = (d?: string) => d ? String(d).slice(0, 10) : "date unavailable";
function ageLabel(d?: string) { if (!d) return "date unavailable"; const y = (Date.now() - new Date(d).getTime()) / 3.15576e10; return y < 1 ? `${dateOf(d)} · under 1 yr old` : `${dateOf(d)} · ${y.toFixed(1)} yrs old`; }

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null); const mapObj = useRef<any>(null); const markers = useRef<any[]>([]); const meMarker = useRef<any>(null); const watchId = useRef<number | null>(null);
  const [origin, setOrigin] = useState(""); const [destination, setDestination] = useState("");
  const [originLabel, setOriginLabel] = useState(""); const [myCoords, setMyCoords] = useState<{ lat: number; lon: number; acc?: number } | null>(null);
  const [locStatus, setLocStatus] = useState("Location not requested yet. Nothing is asked for on page load.");
  const [tracking, setTracking] = useState(false); const [follow, setFollow] = useState(true);
  const [sugg, setSugg] = useState<{ field: string; items: any[] }>({ field: "", items: [] });
  const [data, setData] = useState<Brief | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<Seg | null>(null); const [filter, setFilter] = useState("all"); const [kindFilter, setKindFilter] = useState("all");
  const [lightbox, setLightbox] = useState<Photo | null>(null); const [tilt, setTilt] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = new maplibregl.Map({ container: mapRef.current, style: "https://demotiles.maplibre.org/style.json", center: [20, 20], zoom: 2, pitch: 45, antialias: true, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({}), "bottom-right");
    map.on("dragstart", () => setFollow(false));
    mapObj.current = map;
  }, []);
  useEffect(() => { mapObj.current?.easeTo({ pitch: tilt ? 55 : 0, duration: 500 }); }, [tilt]);

  const filtered = useMemo(() => !data ? [] : data.segments.filter(s => (filter === "all" || s.status === filter) && (kindFilter === "all" || hits(s, kindFilter).length > 0)), [data, filter, kindFilter]);
  const allPhotos = useMemo(() => data?.segments.flatMap(s => s.photos) || [], [data]);
  const analysed = useMemo(() => allPhotos.filter(p => p.signals_source === "muse_spark").length, [allPhotos]);
  const dates = useMemo(() => allPhotos.map(p => dateOf(p.captured_at)).filter(d => d !== "date unavailable").sort(), [allPhotos]);
  const osmOk = useMemo(() => data ? !data.warnings.some(w => w.toLowerCase().includes("overpass")) : false, [data]);

  useEffect(() => {
    const map = mapObj.current; if (!map || !data) return;
    const draw = () => {
      markers.current.forEach(m => m.remove()); markers.current = [];
      for (const id of ["route-shadow", "route", "alt"]) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
      map.addSource("route", { type: "geojson", data: data.route_geojson });
      map.addLayer({ id: "route-shadow", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#000", "line-width": 11, "line-opacity": .4, "line-blur": 4, "line-translate": [0, 5] } });
      map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#f0b93e", "line-width": 5 } });
      if (data.alternate_geojson) { map.addSource("alt", { type: "geojson", data: data.alternate_geojson }); map.addLayer({ id: "alt", type: "line", source: "alt", paint: { "line-color": "#6cb4ee", "line-width": 3.5, "line-dasharray": [2, 2] } }); }
      data.segments.forEach(s => {
        const el = document.createElement("button"); el.className = "pin"; el.style.background = colour(s.status);
        el.setAttribute("aria-label", `Stretch ${s.index + 1}: ${label(s.status)}. Activate to view evidence.`);
        el.innerHTML = `<span>${s.index + 1}</span>`; el.style.opacity = filtered.includes(s) ? "1" : "0.22";
        el.onclick = () => selectSeg(s, true);
        markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(map));
      });
      const c = data.route_geojson.geometry.coordinates;
      map.fitBounds(c.reduce((b: any, x: any) => b.extend(x), new maplibregl.LngLatBounds(c[0], c[0])), { padding: 60, pitch: tilt ? 55 : 0, duration: 800 });
    };
    if (map.loaded()) draw(); else map.on("load", draw);
  }, [data, filtered]);

  function selectSeg(s: Seg, fly = false) { setSelected(s); if (fly) mapObj.current?.flyTo({ center: [s.lon, s.lat], zoom: 16.5, duration: 700 }); }
  async function loadReport() {
    setLoading(true); setError("");
    try { const r = await fetch(`${API}/api/report`); const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Verified example unavailable"); setData(j); setSelected(null); setOrigin("Bandra Station"); setDestination("Linking Road Bandra"); setOriginLabel("Example route — Bandra West, Mumbai"); }
    catch (e: any) { setError(`${e.message}. Check the backend is running, then retry.`); } finally { setLoading(false); }
  }
  useEffect(() => { loadReport(); }, []);

  async function search(field: "origin" | "destination", q: string) {
    if (field === "origin") setOrigin(q); else setDestination(q);
    if (q.trim().length < 3) { setSugg({ field: "", items: [] }); return; }
    try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`); setSugg({ field, items: await r.json() }); } catch { setSugg({ field: "", items: [] }); }
  }
  function pick(field: string, item: any) { const v = `${item.lat},${item.lon}`; if (field === "origin") { setOrigin(v); setOriginLabel(item.display_name); } else setDestination(v); setSugg({ field: "", items: [] }); }

  async function reverseGeocode(lat: number, lon: number) {
    try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`); const j = await r.json(); return j.display_name as string; } catch { return "Current location"; }
  }
  function placeMe(lat: number, lon: number, acc?: number) {
    setMyCoords({ lat, lon, acc }); const map = mapObj.current; if (!map) return;
    if (!meMarker.current) { const el = document.createElement("div"); el.className = "me-dot"; el.setAttribute("aria-label", "Your current location"); meMarker.current = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map); }
    else meMarker.current.setLngLat([lon, lat]);
    if (follow || !tracking) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setLocStatus("Geolocation is not available in this browser. Manual search still works."); return; }
    setLocStatus("Requesting permission…");
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords; placeMe(lat, lon, accuracy);
      const name = await reverseGeocode(lat, lon); setOrigin(`${lat},${lon}`); setOriginLabel(name);
      setLocStatus(`Located: ${name} (±${Math.round(accuracy)} m). Set as origin. Coordinates are used only in this browser session and are not stored.`);
    }, err => setLocStatus(err.code === err.PERMISSION_DENIED ? "Permission denied. You can still search any place manually — StepSignal works without location access." : "Could not get a location fix. Check GPS/network and try again, or search manually."), { enableHighAccuracy: true, timeout: 12000 });
  }
  function toggleTracking() {
    if (tracking) { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; setTracking(false); setLocStatus("Live tracking stopped. No location history was stored."); return; }
    if (!navigator.geolocation) { setLocStatus("Live tracking is not available in this browser."); return; }
    watchId.current = navigator.geolocation.watchPosition(async pos => { const { latitude: lat, longitude: lon, accuracy } = pos.coords; placeMe(lat, lon, accuracy); setLocStatus(`Tracking active · ±${Math.round(accuracy)} m. Stop any time — nothing is recorded.`); }, err => { setLocStatus(err.code === err.PERMISSION_DENIED ? "Tracking permission was revoked. Manual search still works." : "Tracking signal lost. Retrying automatically while enabled."); setTracking(err.code !== err.PERMISSION_DENIED); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    setTracking(true); setFollow(true);
  }
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);

  async function submit() {
    if (!origin.trim() || !destination.trim()) { setError("Enter both an origin and a destination — a place name, an address, or use your current location as the origin."); return; }
    setLoading(true); setError(""); setSelected(null);
    try { const r = await fetch(`${API}/api/brief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin, destination }) }); const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Route analysis failed"); setData(j); }
    catch (e: any) { setError(`${e.message}. Check the places are reachable on foot, then retry.`); } finally { setLoading(false); }
  }

  return (
    <>
      <a className="skip" href="#panel">Skip to route panel</a>
      <main style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: "100vh" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "#10161d", flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "var(--text)", textDecoration: "none" }}><strong style={{ fontSize: 20 }}>StepSignal</strong></Link>
          <nav aria-label="Primary" style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "var(--text-2)" }}>Home</Link><a href="/#how" style={{ color: "var(--text-2)" }}>How it works</a><a href="/#faq" style={{ color: "var(--text-2)" }}>FAQ</a><a href="/#contribute" style={{ color: "var(--text-2)" }}>Add a photo</a><a href="/#help" style={{ color: "var(--text-2)" }}>Help desk</a>
          </nav>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }} role="status">{tracking ? "● Live tracking active" : "Tracking off"} · {allPhotos.length} photos in view</span>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "440px 1fr", minHeight: 0 }} className="map-layout">
          <aside id="panel" style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, borderRight: "1px solid var(--line)", background: "var(--surface)" }} aria-label="Route search and evidence panel">
            <section className="card" style={{ padding: 16 }} aria-labelledby="loc-h">
              <h2 id="loc-h" style={{ margin: "0 0 8px", fontSize: 16 }}>Your location</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={useMyLocation} style={{ padding: "10px 14px" }}>Use my current location</button>
                <button className="btn btn-ghost" onClick={toggleTracking} aria-pressed={tracking} style={{ padding: "10px 14px" }}>{tracking ? "Stop live tracking" : "Enable live location tracking"}</button>
                {tracking && <button className="chip" aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? "Following you" : "Follow paused"}</button>}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55, margin: "10px 0 0" }} role="status">{locStatus}</p>
              {originLabel && <p style={{ fontSize: 13, margin: "6px 0 0" }}>Origin context: <b>{originLabel}</b></p>}
            </section>

            <section className="card" style={{ padding: 16 }} aria-labelledby="search-h">
              <h2 id="search-h" style={{ margin: "0 0 10px", fontSize: 16 }}>Plan a route — anywhere</h2>
              <div className="field" style={{ position: "relative" }}><label htmlFor="origin">Origin</label>
                <input id="origin" className="input" value={origin} onChange={e => search("origin", e.target.value)} placeholder="Place, address, or lat,lon" autoComplete="off" />
                {sugg.field === "origin" && sugg.items.length > 0 && <ul style={{ listStyle: "none", margin: "4px 0", padding: 6, background: "var(--surface-3)", borderRadius: 7, position: "absolute", zIndex: 5, width: "100%" }}>{sugg.items.map((it: any) => <li key={it.place_id}><button className="chip" style={{ width: "100%", textAlign: "left", borderRadius: 5 }} onClick={() => pick("origin", it)}>{it.display_name}</button></li>)}</ul>}
              </div>
              <div className="field" style={{ position: "relative" }}><label htmlFor="destination">Destination</label>
                <input id="destination" className="input" value={destination} onChange={e => search("destination", e.target.value)} placeholder="Place, address, or lat,lon" autoComplete="off" />
                {sugg.field === "destination" && sugg.items.length > 0 && <ul style={{ listStyle: "none", margin: "4px 0", padding: 6, background: "var(--surface-3)", borderRadius: 7, position: "absolute", zIndex: 5, width: "100%" }}>{sugg.items.map((it: any) => <li key={it.place_id}><button className="chip" style={{ width: "100%", textAlign: "left", borderRadius: 5 }} onClick={() => pick("destination", it)}>{it.display_name}</button></li>)}</ul>}
              </div>
              {myCoords && <button className="chip" onClick={() => { setOrigin(`${myCoords.lat},${myCoords.lon}`); setLocStatus("Origin set to your latest known location."); }}>Start from my current location</button>}
              <button className="btn btn-primary" onClick={submit} disabled={loading} style={{ width: "100%", marginTop: 10 }}>{loading ? "Analysing route…" : "Explore a route"}</button>
              <button className="btn btn-ghost" onClick={loadReport} disabled={loading} style={{ width: "100%", marginTop: 8 }}>Load verified example (Bandra, cached — no AI cost)</button>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Exploring a new route can use Muse Spark calls for uncached photos. Cached and example routes are free. Imagery coverage varies worldwide and is reported honestly per route.</p>
              {error && <div role="alert" style={{ background: "#2a1712", border: "1px solid var(--barrier)", borderRadius: 7, padding: "10px 12px", fontSize: 14 }}>{error} <button className="chip" onClick={loadReport}>Load example instead</button></div>}
              {loading && <div aria-label="Loading route evidence"><div className="skeleton" style={{ height: 18, marginBottom: 8 }} /><div className="skeleton" style={{ height: 18, width: "70%" }} /></div>}
            </section>

            {data && <>
              <section className="card" style={{ padding: 16 }} aria-labelledby="sum-h">
                <h2 id="sum-h" style={{ margin: "0 0 8px", fontSize: 16 }}>Route summary</h2>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 10px" }}>{data.summary}</p>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div role="img" aria-label={`Evidence coverage ${data.coverage_pct} percent`} style={{ width: 84, height: 84, borderRadius: "50%", flex: "none", background: `conic-gradient(var(--brand) ${data.coverage_pct}%, #26313f 0)`, display: "grid", placeItems: "center" }}><div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontWeight: 800 }}>{data.coverage_pct}%</div></div>
                  <ul style={{ fontSize: 14, lineHeight: 1.8, margin: 0, paddingLeft: 0, listStyle: "none" }}>
                    <li><span className="dot" style={{ background: "var(--barrier)" }} /> {data.counts.confirmed_barrier || 0} confirmed barrier</li>
                    <li><span className="dot" style={{ background: "var(--clear)" }} /> {data.counts.observed_clear_of_barriers || 0} no barrier visible</li>
                    <li><span className="dot" style={{ background: "var(--unknown)" }} /> {data.counts.uncertain || 0} uncertain</li>
                    <li style={{ color: "var(--muted)" }}>{(data.distance_m / 1000).toFixed(1)} km · ~{data.duration_min} min walk</li>
                  </ul>
                </div>
              </section>

              <section className="card" style={{ padding: 16 }} aria-labelledby="cov-h">
                <h2 id="cov-h" style={{ margin: "0 0 8px", fontSize: 16 }}>Location coverage — what exists here</h2>
                <ul style={{ fontSize: 14, lineHeight: 1.75, margin: 0, paddingLeft: 18 }}>
                  <li>Map &amp; route data: available (OSRM returned this route)</li>
                  <li>Street-level imagery: {allPhotos.length} photograph(s) across {data.segments.filter(s => s.photos.length).length} of {data.segments.length} stretches{dates.length ? `, captured ${dates[0]} to ${dates[dates.length - 1]}` : ""}</li>
                  <li>AI analysis: {analysed} of {allPhotos.length} photos analysed by Muse Spark</li>
                  <li>Accessibility map tags: {osmOk ? "returned for this area (see stretch details)" : "unavailable from the map service for this area — missing tags are not evidence about a street"}</li>
                  <li>Segmentation masks: {allPhotos.some(p => p.sam_mask_url) ? "available on some photos" : "SAM 3.1 not configured — observations are text and confidence, no fabricated overlays"}</li>
                </ul>
                {allPhotos.length === 0 && <p role="status" style={{ fontSize: 14, color: "var(--brand)" }}>No street-level imagery was retrieved for this route, so no accessibility assessment is presented. Every stretch stays uncertain. Try a nearby area, or contribute a photo from the home page.</p>}
              </section>

              <section aria-labelledby="ev-h">
                <h2 id="ev-h" style={{ fontSize: 16, margin: "0 0 10px" }}>Evidence by stretch</h2>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 }} role="group" aria-label="Filter by status">
                  {[["all", "All"], ["confirmed_barrier", "Barriers"], ["observed_clear_of_barriers", "No barrier visible"], ["uncertain", "Uncertain"]].map(([k, t]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }} role="group" aria-label="Filter by observation type">
                  <button className="chip" aria-pressed={kindFilter === "all"} onClick={() => setKindFilter("all")}>All observations</button>
                  {BARRIERS.map(k => <button key={k} className="chip" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{pretty(k)}</button>)}
                  <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Kerb ramps, tactile paving and crossings appear as observations inside each stretch — they are helpers, not barrier filters.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {filtered.map(s => <article key={s.segment_id} className="card" style={{ padding: 13, cursor: "pointer", outline: selected?.segment_id === s.segment_id ? "2px solid var(--brand)" : undefined }} onClick={() => selectSeg(s, true)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") selectSeg(s, true); }} aria-label={`Stretch ${s.index + 1}, ${label(s.status)}`}>
                    <p style={{ margin: "0 0 4px" }}><b>#{s.index + 1}</b> <span className="tag"><span className="dot" style={{ background: colour(s.status) }} />{label(s.status)}</span></p>
                    {hits(s).slice(0, 2).map((h, i) => <p key={i} style={{ fontSize: 13, margin: "3px 0", color: "var(--text-2)" }}>{pretty(h.kind)} · {(h.conf * 100).toFixed(0)}% · photo {dateOf(h.photo.captured_at)}</p>)}
                    {s.photos[0]?.thumb_url && <img className="thumb" loading="lazy" src={s.photos[0].thumb_url} alt={`Street photograph for stretch ${s.index + 1}, captured ${dateOf(s.photos[0].captured_at)}`} style={{ marginTop: 8, maxHeight: 110, objectFit: "cover" }} />}
                    {s.photos.length === 0 && <p style={{ fontSize: 13, color: "var(--brand)", margin: "4px 0 0" }}>No photograph retrieved — unassessed, not accessible.</p>}
                  </article>)}
                  {filtered.length === 0 && <div className="card" role="status"><p style={{ margin: 0, fontSize: 14 }}>No stretches match these filters. <button className="chip" onClick={() => { setFilter("all"); setKindFilter("all"); }}>Clear filters</button></p></div>}
                </div>
              </section>

              {selected && <section className="card" aria-labelledby="sel-h" style={{ padding: 16 }}>
                <button className="chip" onClick={() => setSelected(null)} style={{ float: "right" }}>Close</button>
                <h2 id="sel-h" style={{ margin: "0 0 4px", fontSize: 17 }}>Stretch #{selected.index + 1}</h2>
                <p><span className="tag"><span className="dot" style={{ background: colour(selected.status) }} />{label(selected.status)}</span></p>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>{selected.status_reason}</p>
                {selected.photos.length === 0 && <p style={{ fontSize: 14, color: "var(--brand)" }}>What this establishes: nothing — there is no photograph for this stretch. What to do: treat it as unknown, check neighbouring stretches, or contribute a photo from the home page.</p>}
                {selected.photos.map(p => <figure key={p.image_id} style={{ margin: "14px 0" }}>
                  {p.thumb_url && <img className="thumb" src={p.thumb_url} alt={`Street evidence, Mapillary photo ${p.image_id}, captured ${dateOf(p.captured_at)}`} onClick={() => setLightbox(p)} style={{ cursor: "zoom-in" }} />}
                  <figcaption style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Source: Mapillary {p.image_id} · {ageLabel(p.captured_at)} · AI: {p.signals_source === "muse_spark" ? "Muse Spark analysed" : "not analysed"} · Mask: {p.sam_mask_url ? "SAM available" : "unavailable (not configured)"}</figcaption>
                  {p.signals && <>
                    <h3 style={{ fontSize: 14, margin: "10px 0 6px" }}>What the AI observed</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{Object.entries(p.signals).map(([k, v]) => <span key={k} className="chip" style={{ cursor: "default" }} title={v.evidence || undefined}>{pretty(k)}: {v.present === null ? "unknown" : v.present ? "observed" : "not observed"} · {(v.confidence * 100).toFixed(0)}%</span>)}</div>
                    {Object.entries(p.signals).filter(([, v]) => v.evidence).slice(0, 4).map(([k, v]) => <p key={k} style={{ fontSize: 13, color: "var(--text-2)", margin: "6px 0" }}><b>{pretty(k)}:</b> {v.evidence} ({(v.confidence * 100).toFixed(0)}%)</p>)}
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>Establishes: the features above at capture time. Cannot establish: present-day conditions, exact gradients, widths, or surface quality. Anything marked “unknown” needs human verification.</p>
                  </>}
                </figure>)}
                {selected.observations.map((o, i) => <p key={i} style={{ fontSize: 13, lineHeight: 1.55 }}>• {o}</p>)}
                {selected.warnings.map((w, i) => <p key={i} style={{ fontSize: 13, color: "var(--brand)" }}>{w}</p>)}
              </section>}

              <section className="card" style={{ padding: 16 }} aria-labelledby="lim-h"><h2 id="lim-h" style={{ margin: "0 0 8px", fontSize: 15 }}>Limits &amp; data sources</h2>
                {data.warnings.map((w, i) => <p key={i} style={{ fontSize: 13, color: "var(--brand)" }}>{w}</p>)}
                {data.limits.map((l, i) => <p key={i} style={{ fontSize: 12, lineHeight: 1.55, color: "var(--muted)" }}>• {l}</p>)}
                <p style={{ fontSize: 12, color: "var(--muted)" }}>Sources: OSRM routing · Mapillary imagery · OpenStreetMap/Overpass · Meta Muse Spark vision. Location, when you grant it, stays in your browser and is never stored.</p>
              </section>
            </>}
          </aside>

          <section style={{ position: "relative", minHeight: "60vh" }} aria-label="Interactive route map">
            <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
            <div style={{ position: "absolute", left: 14, top: 14, zIndex: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="chip" aria-pressed={tilt} onClick={() => setTilt(!tilt)}>{tilt ? "3D tilt on" : "Flat view"}</button>
              <button className="chip" onClick={useMyLocation}>Use my current location</button>
              <button className="chip" aria-pressed={tracking} onClick={toggleTracking}>{tracking ? "Stop tracking" : "Enable live tracking"}</button>
            </div>
            <div style={{ position: "absolute", left: 14, bottom: 14, zIndex: 3, background: "rgba(12,16,21,.92)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px", fontSize: 12 }} aria-label="Legend">
              <span><span className="dot" style={{ background: "var(--barrier)" }} /> Confirmed barrier</span> &nbsp;<span><span className="dot" style={{ background: "var(--clear)" }} /> No barrier visible</span> &nbsp;<span><span className="dot" style={{ background: "var(--unknown)" }} /> Uncertain</span> &nbsp;<span><span className="dot" style={{ background: "#3b82f6" }} /> You</span>
              <div style={{ color: "var(--muted)", marginTop: 4 }}>Colour is always paired with a text label. Click a pin for photographic evidence.</div>
            </div>
          </section>
        </div>
        <style>{`@media (max-width: 900px){ .map-layout{ grid-template-columns: 1fr !important; } .map-layout > section{ order:-1; min-height:52vh !important; } .map-layout > aside{ border-right:none !important; overflow:visible !important; } }`}</style>
      </main>
      {lightbox && <div role="dialog" aria-modal="true" aria-label="Enlarged street photograph" onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(4,7,11,.92)", zIndex: 60, display: "grid", placeItems: "center", padding: 20 }}>
        <figure style={{ maxWidth: 920, width: "100%" }}>{lightbox.thumb_url && <img src={lightbox.thumb_url} alt={`Enlarged street evidence, Mapillary photo ${lightbox.image_id}`} style={{ width: "100%", borderRadius: 8 }} />}<figcaption style={{ fontSize: 13, marginTop: 10 }}>Mapillary {lightbox.image_id} · {ageLabel(lightbox.captured_at)} — activate anywhere to close</figcaption></figure>
      </div>}
    </>
  );
}
