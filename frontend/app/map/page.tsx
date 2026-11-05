"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
type Sig = { present: boolean | null; confidence: number; evidence: string };
type Photo = { image_id: string; thumb_url?: string; captured_at?: string; lat?: number; lon?: number; signals_source: string; sam_status: string; sam_mask_url?: string; signals?: Record<string, Sig> };
type Seg = { segment_id: string; index: number; lat: number; lon: number; status: string; status_reason: string; osm: Record<string, string>; photos: Photo[]; observations: string[]; warnings: string[]; evidence_quality?: string; verification_required?: boolean };
type Brief = { summary: string; distance_m: number; duration_min: number; route_geojson: any; alternate_geojson?: any; alternate_note?: string; segments: Seg[]; coverage_pct: number; coverage_note: string; counts: Record<string, number>; limits: string[]; warnings: string[]; integrations: Record<string, string> };

const colour = (s: string) => s === "confirmed_barrier" ? "#e4572e" : s === "possible_barrier" ? "#d97706" : s === "observed_clear_of_barriers" ? "#2fa58f" : "#93a3b5";
const label = (s: string) => s === "confirmed_barrier" ? "Confirmed barrier" : s === "possible_barrier" ? "Possible barrier — verification needed" : s === "observed_clear_of_barriers" ? "No barrier visible in analysed evidence" : s === "unassessed" ? "Unassessed — no analysed evidence" : "Uncertain — insufficient evidence";
const BARRIERS = ["steps_or_staircase", "pavement_obstruction", "sidewalk_discontinuity", "surface_damage", "crossing_barrier"] as const;
const pretty = (k: string) => k.replaceAll("_", " ");
function hits(s: Seg, kind?: string) {
  const out: { kind: string; conf: number; photo: Photo; ev: string }[] = [];
  for (const p of s.photos) for (const k of BARRIERS) {
    if (kind && kind !== "all" && k !== kind) continue;
    const v = p.signals?.[k]; if (v?.present === true && v.confidence >= 0.6) out.push({ kind: k, conf: v.confidence, photo: p, ev: v.evidence || "" });
  }
  return out.sort((a, b) => b.conf - a.conf);
}
async function backendClassify(segs: Seg[]): Promise<Seg[]> {
  try {
    const r = await fetch(`${API}/api/stage/classify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segments: segs.map(s => ({ index: s.index, photos: s.photos, osm: s.osm })) }) });
    const j = await r.json(); if (!r.ok) return segs;
    const byIdx: Record<number, any> = {}; (j.classifications || []).forEach((c: any) => { byIdx[c.index] = c; });
    return segs.map(s => byIdx[s.index] ? { ...s, status: byIdx[s.index].status, status_reason: byIdx[s.index].status_reason, observations: byIdx[s.index].observations || s.observations, warnings: byIdx[s.index].warnings || s.warnings, evidence_quality: byIdx[s.index].evidence_quality, verification_required: byIdx[s.index].verification_required } as Seg : s);
  } catch { return segs; }
}
function qualityOf(v?: Sig): string {
  if (!v || v.present === null) return "Unclear — insufficient visual evidence";
  if (v.present === false) return "No relevant issue visible in this photo";
  return v.confidence >= 0.8 ? "Observed — clearly visible" : "Possible concern — suggested, not fully established";
}
const IMPLICATION: Record<string, string> = {
  steps_or_staircase: "Steps without a visible ramp alternative can block a wheelchair user at this point.",
  kerb_ramp: "A dropped kerb affects whether a wheelchair user can leave/enter the footway at this crossing.",
  tactile_paving: "Tactile paving supports orientation for visually impaired pedestrians at crossings.",
  pavement_obstruction: "An obstruction may reduce the clear passage width available to a wheelchair user.",
  sidewalk_discontinuity: "A footway that ends forces a wheelchair user onto the carriageway or a detour.",
  pedestrian_crossing: "A marked crossing affects where a pedestrian can cross with priority.",
  crossing_barrier: "A barrier at a crossing may narrow or block the crossing path.",
  surface_damage: "Broken or uneven surfaces can impede wheels and create a tipping or vibration hazard.",
  visible_ramp: "A visible ramp may provide step-free access at this point, if its gradient and width are suitable — neither is measured here.",
  steep_gradient_suspected: "A steep slope may be difficult or unsafe for manual wheelchair users. This is a visual suspicion only, not a measurement.",
};
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
  const [stage, setStage] = useState<"idle" | "route" | "discover" | "analyse" | "summary" | "partial" | "failed">("idle");
  const [elapsed, setElapsed] = useState(0); const [prog, setProg] = useState({ found: 0, analysed: 0, awaiting: 0, failed: 0 });
  const [failedPhotos, setFailedPhotos] = useState<any[]>([]); const [mapStyle, setMapStyle] = useState<"voyager" | "dark">("voyager");
  const [showEvidence, setShowEvidence] = useState(true); const [showRoute, setShowRoute] = useState(true);
  const stageTimer = useRef<any>(null);
  function startTimer() { const t0 = Date.now(); setElapsed(0); stageTimer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500); }
  function stopTimer() { if (stageTimer.current) clearInterval(stageTimer.current); }

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = new maplibregl.Map({ container: mapRef.current, style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json", center: [20, 20], zoom: 2, pitch: 45, antialias: true, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({}), "bottom-right");
    map.on("dragstart", () => setFollow(false));
    mapObj.current = map;
  }, []);
  useEffect(() => { mapObj.current?.easeTo({ pitch: tilt ? 55 : 0, duration: 500 }); }, [tilt]);
  useEffect(() => { const m = mapObj.current; if (m) m.setStyle(mapStyle === "voyager" ? "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"); }, [mapStyle]);

  const filtered = useMemo(() => !data ? [] : data.segments.filter(s => (filter === "all" || s.status === filter) && (kindFilter === "all" || hits(s, kindFilter).length > 0)), [data, filter, kindFilter]);
  const allPhotos = useMemo(() => data?.segments.flatMap(s => s.photos) || [], [data]);
  const analysed = useMemo(() => allPhotos.filter(p => p.signals_source === "muse_spark").length, [allPhotos]);
  const dates = useMemo(() => allPhotos.map(p => dateOf(p.captured_at)).filter(d => d !== "date unavailable").sort(), [allPhotos]);
  const osmOk = useMemo(() => data ? !data.warnings.some(w => w.toLowerCase().includes("overpass")) : false, [data]);

  useEffect(() => {
    const map = mapObj.current; if (!map || !data) return;
    const draw = () => {
      markers.current.forEach(m => m.remove()); markers.current = [];
      for (const id of ["route-shadow", "route", "alt", "seghl"]) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
      if (showRoute) {
        map.addSource("route", { type: "geojson", data: data.route_geojson });
        map.addLayer({ id: "route-shadow", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#b45309", "line-width": 13, "line-opacity": .28, "line-blur": 5 } });
        map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#d97706", "line-width": 5.5 } });
        if (data.alternate_geojson) { map.addSource("alt", { type: "geojson", data: data.alternate_geojson }); map.addLayer({ id: "alt", type: "line", source: "alt", paint: { "line-color": "#2563eb", "line-width": 3.5, "line-dasharray": [2, 2] } }); }
        const coords0 = data.route_geojson.geometry.coordinates;
        const mk = (coord: any, txt: string, bg: string) => { const el = document.createElement("div"); el.textContent = txt; el.setAttribute("aria-label", txt === "A" ? "Route start" : "Route destination"); el.style.cssText = `background:${bg};color:#fff;font-weight:800;border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;box-shadow:0 4px 10px rgba(0,0,0,.4)`; markers.current.push(new maplibregl.Marker({ element: el }).setLngLat(coord).addTo(map)); };
        mk(coords0[0], "A", "#15803d"); mk(coords0[coords0.length - 1], "B", "#b91c1c");
      }
      if (selected) {
        const nxt = data.segments[selected.index + 1];
        const a: any = [selected.lon, selected.lat]; const b: any = nxt ? [nxt.lon, nxt.lat] : a;
        map.addSource("seghl", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [a, b] }, properties: {} } });
        map.addLayer({ id: "seghl", type: "line", source: "seghl", layout: { "line-cap": "round" }, paint: { "line-color": "#111827", "line-width": 10, "line-opacity": .55 } });
      }
      if (!showEvidence) return;
      data.segments.forEach(s => {
        const el = document.createElement("button"); el.className = "pin"; el.style.background = colour(s.status);
        el.setAttribute("aria-label", `Stretch ${s.index + 1}: ${label(s.status)}. Activate to view evidence.`);
        el.innerHTML = `<span>${s.index + 1}</span>`; el.style.opacity = filtered.includes(s) ? "1" : "0.22";
        el.onclick = () => selectSeg(s, true);
        markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(map));
      });
      const c = data.route_geojson.geometry.coordinates;
      const key = `${data.distance_m}:${c.length}:${c[0]}`;
      if ((map as any)._routeKey !== key) { (map as any)._routeKey = key; map.fitBounds(c.reduce((b: any, x: any) => b.extend(x), new maplibregl.LngLatBounds(c[0], c[0])), { padding: 60, pitch: tilt ? 55 : 0, duration: 800 }); }
    };
    if (map.loaded()) draw(); else map.on("load", draw);
    map.on("styledata", draw);
    return () => { try { map.off("styledata", draw); } catch {} };
  }, [data, filtered, mapStyle, showEvidence, showRoute, selected]);

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

  function composeBrief(route: any, segments: Seg[], warnings: string[], partial: boolean): Brief {
    const counts: Record<string, number> = {}; segments.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    const assessed = segments.filter(s => s.status !== "uncertain").length;
    const pct = segments.length ? Math.round(1000 * assessed / segments.length) / 10 : 0;
    return { summary: `Route of ${(route.distance_m / 1000).toFixed(1)} km from ${route.origin_label} to ${route.destination_label} sampled into ${segments.length} stretches (~50 m each). ${counts.confirmed_barrier || 0} confirmed, ${counts.possible_barrier || 0} possible, ${counts.observed_clear_of_barriers || 0} with no barrier visible in analysed evidence, ${counts.uncertain || 0} uncertain, ${counts.unassessed || 0} unassessed.${partial ? " Analysis is partial — some photographs failed and can be retried." : ""}`,
      distance_m: route.distance_m, duration_min: route.duration_min, route_geojson: route.route_geojson, alternate_geojson: route.alternate_geojson,
      alternate_note: route.alternate_geojson ? "Alternate OSRM walking route shown for comparison. Compare its per-segment evidence — neither route is labelled accessible overall." : undefined,
      segments, coverage_pct: pct, coverage_note: `Evidence coverage: ${assessed} of ${segments.length} stretches have analysable photo or map evidence. Coverage means evidence availability, not accessibility.`,
      counts, limits: ["Missing data never means a stretch is accessible.", "Gradients, widths and surface quality are not measured from photographs.", "No relevant issue visible in a photo does not certify a street as accessible.", "Photographs may be outdated; capture dates are shown."], warnings, integrations: {} };
  }
  async function analysePhotos(photos: any[], base: Brief, route: any, warnings: string[]) {
    setStage("analyse"); setProg(p => ({ ...p, awaiting: photos.length }));
    const r = await fetch(`${API}/api/stage/analyse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.detail || "AI analysis stage failed");
    const failed = photos.filter(p => !j.results[p.image_id]); setFailedPhotos(failed);
    setProg({ found: photos.length, analysed: Object.values(j.results).filter(Boolean).length, awaiting: 0, failed: failed.length });
    let segs = base.segments.map(s => {
      const ph = s.photos.map(p => (p.image_id in j.results)
        ? { ...p, signals: j.results[p.image_id] || undefined, signals_source: j.results[p.image_id] ? "muse_spark" : "unavailable" }
        : p); // merge: photos not in this batch keep their existing analysis (retry safety)
      return { ...s, photos: ph };
    });
    segs = await backendClassify(segs);
    const brief = composeBrief(route, segs, warnings, failed.length > 0); setData(brief);
    setStage(failed.length ? "partial" : "summary"); return brief;
  }
  async function submit() {
    if (!origin.trim() || !destination.trim()) { setError("Enter both an origin and a destination — a place name, an address, or use your current location as the origin."); return; }
    setLoading(true); setError(""); setSelected(null); setFailedPhotos([]); startTimer();
    try {
      setStage("route");
      let r = await fetch(`${API}/api/stage/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin, destination }) });
      let route = await r.json(); if (!r.ok) throw new Error(route.detail || "Routing failed");
      // Stage 1 result renders immediately — map shows the route before any AI work.
      let segs: Seg[] = route.samples.map((s: any) => ({ segment_id: `seg-${s.index}`, index: s.index, lat: s.lat, lon: s.lon, status: "uncertain", status_reason: "Evidence discovery in progress…", osm: {}, photos: [], observations: [], warnings: [] }));
      setData(composeBrief(route, segs, [], false));
      setStage("discover");
      r = await fetch(`${API}/api/stage/discover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ samples: route.samples }) });
      const disc = await r.json(); if (!r.ok) throw new Error(disc.detail || "Evidence discovery failed");
      const photos: any[] = [];
      segs = segs.map(s => { const ph = (disc.photos_by_index[String(s.index)] || []).map((p: any) => ({ ...p, signals_source: "unavailable", sam_status: "unavailable" })); photos.push(...ph); const osm = disc.osm_by_index[String(s.index)] || {}; return { ...s, photos: ph, osm }; });
      segs = await backendClassify(segs);
      setProg(p => ({ ...p, found: photos.length }));
      setData(composeBrief(route, segs, disc.warnings || [], false));
      if (photos.length === 0) { setStage("summary"); return; }
      await analysePhotos(photos, composeBrief(route, segs, disc.warnings || [], false), route, disc.warnings || []);
    } catch (e: any) { setStage("failed"); setError(`${e.message}. The failed stage is shown above — retry, or load the verified example.`); }
    finally { setLoading(false); stopTimer(); }
  }
  async function retryFailed() {
    if (!data || failedPhotos.length === 0) return;
    setLoading(true);
    try { await analysePhotos(failedPhotos, data, { origin_label: origin, destination_label: destination, distance_m: data.distance_m, duration_min: data.duration_min, route_geojson: data.route_geojson, alternate_geojson: data.alternate_geojson }, data.warnings); }
    catch (e: any) { setError(`Retry failed: ${e.message}`); } finally { setLoading(false); }
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
              {stage !== "idle" && <div aria-label="Analysis progress" role="status" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, margin: "0 0 8px" }}><b>Analysis progress</b> · {elapsed}s elapsed · state: {stage}</p>
                <ol style={{ fontSize: 13, lineHeight: 1.9, margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
                  <li>{stage === "route" ? "●" : "✓"} Generating walking route</li>
                  <li>{stage === "discover" ? "●" : (stage === "route" ? "○" : "✓")} Dividing into ~50 m stretches &amp; searching for street photographs {prog.found ? `(${prog.found} found)` : ""}</li>
                  <li>{stage === "analyse" ? "●" : (stage === "summary" || stage === "partial" ? "✓" : "○")} Analysing photographs with Muse Spark — {prog.analysed} analysed, {prog.awaiting} awaiting{prog.failed ? `, ${prog.failed} failed` : ""}</li>
                  <li>{stage === "summary" ? "✓" : stage === "partial" ? "◐ partial" : "○"} Preparing evidence summary</li>
                </ol>
                {stage === "partial" && failedPhotos.length > 0 && <button className="chip" onClick={retryFailed} disabled={loading}>Retry failed analysis ({failedPhotos.length})</button>}
                {(stage === "discover" && elapsed > 15) && <p style={{ fontSize: 12, color: "var(--brand)" }}>Still running: map-feature lookup can be slow when public Overpass mirrors are busy. The route is already on the map.</p>}
                {(stage === "analyse" && elapsed > 30) && <p style={{ fontSize: 12, color: "var(--brand)" }}>Still running: AI analysis of uncached photographs. Cached photographs return instantly.</p>}
              </div>}
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
                  {[["all", "All"], ["confirmed_barrier", "Confirmed"], ["possible_barrier", "Possible"], ["observed_clear_of_barriers", "No barrier visible"], ["uncertain", "Uncertain"], ["unassessed", "Unassessed"]].map(([k, t]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }} role="group" aria-label="Filter by observation type">
                  <button className="chip" aria-pressed={kindFilter === "all"} onClick={() => setKindFilter("all")}>All observations</button>
                  {BARRIERS.map(k => <button key={k} className="chip" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{pretty(k)}</button>)}
                  <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Kerb ramps, tactile paving and crossings appear as observations inside each stretch — they are helpers, not barrier filters.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {filtered.map(s => <article key={s.segment_id} className="card" style={{ padding: 13, cursor: "pointer", outline: selected?.segment_id === s.segment_id ? "2px solid var(--brand)" : undefined }} onClick={() => selectSeg(s, true)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") selectSeg(s, true); }} aria-label={`Stretch ${s.index + 1}, ${label(s.status)}`}>
                    <p style={{ margin: "0 0 4px" }}><b>#{s.index + 1}</b> <span className="tag"><span className="dot" style={{ background: colour(s.status) }} />{label(s.status)}</span></p>
                    {hits(s).slice(0, 2).map((h, i) => <p key={i} style={{ fontSize: 13, margin: "3px 0", color: "var(--text-2)" }}><b>{pretty(h.kind)}</b> · {(h.conf * 100).toFixed(0)}%{h.ev ? <> — “{h.ev}”</> : ""} <span style={{ color: "var(--muted)" }}>· {dateOf(h.photo.captured_at)}</span></p>)}
                    {s.status === "observed_clear_of_barriers" && <p style={{ fontSize: 13, margin: "3px 0", color: "var(--text-2)" }}>Analysed photo(s) showed no barrier. Kerbs/crossings detail inside.</p>}
                    {s.status === "uncertain" && s.photos.length > 0 && <p style={{ fontSize: 13, margin: "3px 0", color: "var(--brand)" }}>Photo present but not AI-analysed — no claim made.</p>}
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
                    <h3 style={{ fontSize: 14, margin: "10px 0 6px" }}>AI observations — observed vs inferred</h3>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>Confidence is how strongly the photo supports the observation — not real-world accessibility certainty. Model: Muse Spark (muse-spark-1.3).</p>
                    {Object.entries(p.signals).filter(([, v]) => v.present === true || v.evidence).map(([k, v]) => <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "9px 11px", margin: "7px 0" }}>
                      <p style={{ margin: "0 0 3px", fontSize: 13 }}><b>{pretty(k)}</b> · {qualityOf(v)} · {(v.confidence * 100).toFixed(0)}%</p>
                      <p style={{ margin: "0 0 3px", fontSize: 13, color: "var(--text-2)" }}><b>Visually observed:</b> {v.evidence || "No specific visual description returned."}</p>
                      <p style={{ margin: "0 0 3px", fontSize: 13, color: "var(--text-2)" }}><b>Potential implication:</b> {IMPLICATION[k] || "May affect step-free passage at this point."}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}><b>Not established:</b> present-day presence, exact dimensions/gradient, or any alternative route around it. {v.confidence < 0.8 ? "Requires human verification." : ""}</p>
                    </div>)}
                    {Object.entries(p.signals).filter(([, v]) => v.present === null).length > 0 && <p style={{ fontSize: 12, color: "var(--brand)" }}>Unclear in this photo: {Object.entries(p.signals).filter(([, v]) => v.present === null).map(([k]) => pretty(k)).join(", ")} — insufficient visual evidence, not evidence of absence.</p>}
                    <p style={{ fontSize: 13, color: "var(--muted)" }}>Establishes: the features above at capture time ({dateOf(p.captured_at)}). Cannot establish: present-day conditions, exact gradients, widths, or surface quality.</p>
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

          <section id="map-section" style={{ position: "relative", minHeight: "60vh" }} aria-label="Interactive route map">
            <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
            <div style={{ position: "absolute", left: 14, top: 14, zIndex: 3, display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Map controls">
              <button className="chip" aria-pressed={tilt} onClick={() => setTilt(!tilt)}>{tilt ? "3D tilt on" : "Flat view"}</button>
              <button className="chip" onClick={useMyLocation}>Locate me</button>
              <button className="chip" aria-pressed={tracking} onClick={toggleTracking}>{tracking ? "Stop tracking" : "Live tracking"}</button>
              <button className="chip" aria-pressed={showEvidence} onClick={() => setShowEvidence(!showEvidence)}>Evidence pins</button>
              <button className="chip" aria-pressed={showRoute} onClick={() => setShowRoute(!showRoute)}>Route line</button>
              <button className="chip" aria-pressed={mapStyle === "voyager"} onClick={() => setMapStyle(mapStyle === "voyager" ? "dark" : "voyager")}>{mapStyle === "voyager" ? "Light map" : "Dark map"}</button>
              <button className="chip" onClick={() => { const c = data?.route_geojson?.geometry?.coordinates; if (c && mapObj.current) mapObj.current.fitBounds(c.reduce((b: any, x: any) => b.extend(x), new maplibregl.LngLatBounds(c[0], c[0])), { padding: 60 }); else mapObj.current?.flyTo({ center: [20, 20], zoom: 2 }); }}>Reset view</button>
              <button className="chip" onClick={() => { const el = document.getElementById("map-section"); if (el?.requestFullscreen) el.requestFullscreen(); }}>Full screen</button>
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
