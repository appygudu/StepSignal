"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const GH = "https://github.com/appygudu/StepSignal";
const ISSUES = `${GH}/issues`;

const faqs: [string, string][] = [
  ["Does StepSignal tell me a route is wheelchair accessible?", "No — deliberately. A stretch is only ever described as having a confirmed barrier, having no barrier visible in the analysed evidence, or being uncertain. Photographs cannot certify a whole route."],
  ["What does “uncertain” mean?", "We do not have enough analysable evidence for that stretch — no photograph, an unanalysed photograph, or too many unknown signals. Uncertain is never treated as accessible."],
  ["Where do photographs come from?", "Real street-level images from Mapillary, sampled every ~50 m along the walking route. Every photograph keeps its Mapillary ID and capture date, shown wherever it is used. Imagery availability varies by location worldwide, and the app says so per route."],
  ["How does the AI work?", "Each image is sent (as an image, not a URL) to Meta Muse Spark (muse-spark-1.3), which returns structured JSON: steps, kerb ramps, tactile paving, obstructions, discontinuities, crossings, crossing barriers and surface damage — each present, absent, or unknown, with confidence. Unknowns stay unknown."],
  ["Can the AI measure ramp gradients or widths?", "No. Gradients are at most “visually suspected”, and widths and surface quality are never measured from a photograph."],
  ["Does StepSignal track my location?", "Only if you choose it. Location is requested only when you tap “Use my current location” or enable live tracking on the map. Nothing is requested on page load, no location history is stored, and tracking can be stopped at any time."],
  ["How old is the evidence?", "It varies per stretch, and the age is printed on every photograph. The verified Bandra example uses photos from 2021–2025."],
  ["I found a barrier that is not mapped. Can I add it?", "Yes — use the form below. Paste a Mapillary link or describe the location. Submissions are queued for review and only become evidence after analysis."],
];

const inp = { width: "100%", padding: 11, margin: "4px 0 10px", borderRadius: 7, background: "#18212c", color: "#eef3f8", border: "1px solid #26323f", minHeight: 44 } as const;

export default function Home() {
  const [report, setReport] = useState<any>(null);
  useEffect(() => { (async () => { try { const r = await fetch(`${API}/api/report`); if (r.ok) { setReport(await r.json()); return; } } catch {} try { const r2 = await fetch(`${BASE}/report.json`); if (r2.ok) setReport(await r2.json()); } catch {} })(); }, []);
  const demoPhoto = report?.segments?.flatMap((s: any) => s.photos.map((p: any) => ({ ...p, seg: s.index + 1 }))).find((p: any) => p.signals && p.thumb_url);
  const demoSignals = demoPhoto ? Object.entries(demoPhoto.signals).filter(([, v]: any) => v.present !== null).slice(0, 6) : [];
  const stats = report ? [
    [`${report.segments.length}`, "route stretches"], [`${report.coverage_pct}%`, "evidence coverage"],
    [`${report.segments.reduce((n: number, s: any) => n + s.photos.length, 0)}`, "photos retrieved"],
    [`${report.segments.reduce((n: number, s: any) => n + s.photos.filter((p: any) => p.signals_source === "muse_spark").length, 0)}`, "photos AI-analysed"],
    [`${report.counts.confirmed_barrier || 0}`, "barrier stretches"], [`${report.counts.uncertain || 0}`, "uncertain stretches"],
  ] : [];
  const [form, setForm] = useState({ location_text: "", mapillary_url: "", barrier_type: "not_sure", note: "" });
  const [sent, setSent] = useState(""); const [sending, setSending] = useState(false);
  async function contribute(e: React.FormEvent) {
    e.preventDefault(); setSending(true); setSent("");
    try {
      const r = await fetch(`${API}/api/contributions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Could not submit");
      setSent(`Received (reference #${j.id}). Queued for review — thank you.`); setForm({ location_text: "", mapillary_url: "", barrier_type: "not_sure", note: "" });
    } catch (err: any) { setSent(`Not submitted: ${err.message}. If the backend is offline you can also open a GitHub issue instead.`); }
    finally { setSending(false); }
  }
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <main id="main" style={{ background: "var(--bg)", minHeight: "100vh" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 5vw", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "rgba(12,16,21,.96)", zIndex: 20 }}>
          <strong style={{ fontSize: 20, letterSpacing: ".2px" }}>StepSignal</strong>
          <nav aria-label="Primary" style={{ display: "flex", gap: 18, fontSize: 14, flexWrap: "wrap" }}>
            <a href={`${BASE}/`} style={{ color: "var(--text-2)" }}>Home</a><Link href="/map" style={{ color: "var(--text-2)" }}>Explore</Link><a href="#how" style={{ color: "var(--text-2)" }}>How it works</a><a href="#ai" style={{ color: "var(--text-2)" }}>AI analysis</a><a href="#contribute" style={{ color: "var(--text-2)" }}>Contribute</a><a href="#about" style={{ color: "var(--text-2)" }}>About</a>
          </nav>
          <Link className="btn btn-primary" href="/map" style={{ marginLeft: "auto", padding: "10px 16px" }}>Explore a route</Link>
        </header>

        <section style={{ padding: "72px 5vw 48px", maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 44, alignItems: "center" }} aria-labelledby="hero-h">
          <div>
            <h1 id="hero-h" style={{ fontSize: 52, lineHeight: 1.06, margin: "0 0 20px", letterSpacing: "-.5px" }}>Know what lies between you and your destination.</h1>
            <p style={{ fontSize: 19, lineHeight: 1.65, color: "var(--text-2)", margin: "0 0 28px", maxWidth: 580 }}>
              Explore street-level accessibility evidence, identify potential barriers and make more informed mobility decisions using real-world imagery and AI.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/map" style={{ fontSize: 16, padding: "14px 24px" }}>Explore a route</Link>
              <a className="btn btn-ghost" href="#how">How it works</a>
            </div>
            {stats.length > 0 && <><p style={{ fontSize: 12, color: "var(--brand)", fontWeight: 700, margin: "26px 0 6px" }}>EXAMPLE ROUTE — verified, Bandra Station → Linking Road</p>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 0, margin: 0, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }} aria-label="Example route statistics">
              {stats.map(([n, t]) => <div key={t} style={{ padding: "12px 10px", borderRight: "1px solid var(--line)", textAlign: "center" }}><dt style={{ fontSize: 21, fontWeight: 800 }}>{n}</dt><dd style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.35 }}>{t}</dd></div>)}
            </dl></>}
          </div>
          <div className="card" style={{ boxShadow: "var(--shadow)" }} aria-label="Real analysed photograph demonstration">
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>Live demonstration · real Mapillary photo + Muse Spark analysis (cached, no new AI call)</p>
            {demoPhoto ? <>
              <img className="thumb" src={demoPhoto.thumb_url} alt={`Real street photograph, Mapillary ${demoPhoto.image_id}, captured ${String(demoPhoto.captured_at).slice(0,10)}`} style={{ maxHeight: 240, objectFit: "cover" }} />
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>Stretch #{demoPhoto.seg} · Mapillary {demoPhoto.image_id} · captured {String(demoPhoto.captured_at).slice(0,10)} · Analysed by Muse Spark (muse-spark-1.3)</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{demoSignals.map(([k, v]: any) => <span key={k} className="chip" style={{ cursor: "default" }}>{k.replaceAll("_"," ")}: {v.present ? "observed" : "not observed"} · {(v.confidence*100).toFixed(0)}%</span>)}</div>
              {demoSignals.filter(([, v]: any) => v.evidence).slice(0,2).map(([k, v]: any) => <p key={k} style={{ fontSize: 13, color: "var(--text-2)", margin: "8px 0 0" }}><b>{k.replaceAll("_"," ")}:</b> {v.evidence}</p>)}
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Establishes what is visible above at capture time. Cannot establish current conditions, gradients or widths. Unknowns remain unknown.</p>
            </> : <p style={{ fontSize: 14, color: "var(--muted)" }}>Verified photo demonstration loads from the backend report. If it is offline, open the map — no illustrative substitute is shown.</p>}
            <Link className="btn btn-teal" href="/map" style={{ width: "100%", marginTop: 12 }}>Open this route on the map</Link>
          </div>
        </section>

        <section aria-labelledby="film-h" style={{ padding: "8px 5vw 36px", maxWidth: 1180, margin: "0 auto" }}>
          <h2 id="film-h" style={{ fontSize: 30, margin: "0 0 6px" }}>Watch: StepSignal in 63 seconds</h2>
          <p style={{ color: "var(--text-2)", margin: "0 0 14px" }}>What it is, how it works, and why it never guesses — narrated, captioned, and built from a real analysed street photograph.</p>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)", background: "#000" }}>
            <video controls preload="metadata" poster={`${BASE}/explainer-poster.png`} style={{ width: "100%", display: "block" }} aria-label="StepSignal explainer video, 63 seconds, narrated with captions">
              <source src={`${BASE}/stepsignal-explainer.mp4`} type="video/mp4" />
              <track kind="captions" src={`${BASE}/explainer.en.vtt`} srcLang="en" label="English" default />
              Your browser cannot play this video. <a href={`${BASE}/stepsignal-explainer.mp4`}>Download the MP4</a> instead.
            </video>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Featuring a genuine Mapillary photograph (Bandra, captured 2025-09-11) analysed by Muse Spark. Voice: synthetic narration. No mock product footage.</p>
        </section>

        <section aria-labelledby="explore-h" style={{ padding: "8px 5vw 36px", maxWidth: 1180, margin: "0 auto" }}>
          <h2 id="explore-h" style={{ fontSize: 30, margin: "0 0 6px" }}>Explore StepSignal</h2>
          <p style={{ color: "var(--text-2)", margin: "0 0 14px" }}>The actual product, embedded — search anywhere in the world, use your location, click the evidence pins.</p>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
            <iframe src={`${BASE}/map/`} title="StepSignal interactive evidence map" style={{ width: "100%", height: 560, border: 0, display: "block" }} loading="lazy" />
          </div>
        </section>

        <section id="how" style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="how-h">
          <h2 id="how-h" style={{ fontSize: 30, margin: "0 0 8px" }}>How StepSignal works</h2>
          <p style={{ color: "var(--text-2)", maxWidth: 760, lineHeight: 1.7 }}>One journey, end to end: a route becomes a chain of short stretches; each stretch is checked against real photographs and map data; what is found, and what is missing, is shown separately.</p>
          <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, listStyle: "none", padding: 0 }}>
            {[["Select a location and destination", "Search any city, address or landmark worldwide, or use your current location after explicit permission."],
              ["Generate a walking route", "OSRM produces the route and, where available, an alternate for stretch-by-stretch comparison."],
              ["Divide into ~50 m stretches", "Short stretches mean one hidden kerb cannot hide inside a long “accessible” segment."],
              ["Retrieve photographs and map data", "Mapillary street imagery and OpenStreetMap features are gathered per stretch, with capture dates."],
              ["Analyse with Meta Muse Spark", "Each real photograph returns structured observations with confidence. Unknown stays unknown."],
              ["Present evidence and uncertainty", "Barriers, clear-looking stretches, and uncertain stretches are labelled and counted separately."],
            ].map(([t, d], i) => <li key={t} className="card"><p style={{ color: "var(--brand)", fontWeight: 800, margin: "0 0 6px" }}>{i + 1} →</p><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>{d}</p></li>)}
          </ol>
        </section>

        <section style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }} aria-labelledby="why-h">
          <div><h2 id="why-h" style={{ fontSize: 30, margin: "0 0 12px" }}>Why street-level evidence matters</h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.75 }}>A route can look perfect on a map and fail at a single kerb. Accessibility lives at street level: a stall across a footway, a footpath that simply ends, a flight of steps at a doorway. Those details rarely exist in map data, but they are visible in street photographs. StepSignal’s job is to surface them — with the photograph attached, so you can judge for yourself.</p></div>
          <div><h2 style={{ fontSize: 30, margin: "0 0 12px" }}>Why we show uncertainty</h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.75 }}>Most of the world’s pavements have never been photographed for this purpose, and map tags are patchy. An app that fills those gaps with a confident score is inventing reassurance. StepSignal instead treats “we don’t know” as first-class information: it is counted, mapped, and explained. That honesty is what makes the confirmed findings worth trusting.</p></div>
        </section>

        <section id="ai" style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="ai-h">
          <h2 id="ai-h" style={{ fontSize: 30, margin: "0 0 16px" }}>How AI analyses real-world imagery</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
            {[["What the image shows", "Muse Spark describes visible features only: steps, kerb ramps, tactile paving, obstructions, surface damage, crossings."],
              ["What might be an issue", "Features are framed as potential barriers for a wheelchair user — an interpretation, labelled as such, not a certification."],
              ["How confident, what’s unknown", "Every observation carries a confidence value, and anything the model cannot tell stays “unknown” on screen."],
              ["What needs a human", "Old photographs, low-confidence readings, and unphotographed stretches are flagged for human verification — including yours, via the contribution form."],
            ].map(([t, d]) => <div key={t} className="card"><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>{d}</p></div>)}
          </div>
        </section>

        <section id="contribute" style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }} aria-labelledby="contrib-h">
          <div><h2 id="contrib-h" style={{ fontSize: 30, margin: "0 0 12px" }}>Help map the gaps</h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.75 }}>Six of the eighteen stretches in our verified example have no street photograph at all. Local knowledge closes gaps like those. Send a location or a Mapillary photo link and tell us what you noticed. Submissions are stored for review, analysed before they count as evidence, and are never displayed as verified on arrival. Prefer GitHub? <a href={ISSUES}>Open an issue</a> instead. Uploading street imagery to Mapillary under your own account also directly improves future coverage.</p></div>
          <form onSubmit={contribute} className="card" aria-label="Add a street photo or location">
            <div className="field"><label htmlFor="c-loc">Street / location (required)</label><input id="c-loc" className="input" required value={form.location_text} onChange={e => setForm({ ...form, location_text: e.target.value })} placeholder="Street, landmark, city" /></div>
            <div className="field"><label htmlFor="c-url">Mapillary photo link (optional)</label><input id="c-url" className="input" value={form.mapillary_url} onChange={e => setForm({ ...form, mapillary_url: e.target.value })} placeholder="https://www.mapillary.com/app/?pKey=…" /></div>
            <div className="field"><label htmlFor="c-type">What did you notice?</label><select id="c-type" className="input" value={form.barrier_type} onChange={e => setForm({ ...form, barrier_type: e.target.value })}>
              <option value="not_sure">Not sure — please check</option><option value="steps">Steps / staircase</option><option value="kerb">Missing kerb ramp</option><option value="obstruction">Pavement obstruction</option><option value="surface">Surface damage</option><option value="tactile">Tactile paving</option><option value="ramp">Ramp</option><option value="crossing">Crossing barrier</option></select></div>
            <div className="field"><label htmlFor="c-note">Note (optional)</label><textarea id="c-note" className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} placeholder="Anything that helps locate it…" /></div>
            <button className="btn btn-teal" disabled={sending} style={{ width: "100%" }}>{sending ? "Sending…" : "Submit for review"}</button>
            {sent && <p role="status" style={{ fontSize: 14, lineHeight: 1.55 }}>{sent}</p>}
            <ol style={{ fontSize: 12, color: "var(--muted)", paddingLeft: 18, lineHeight: 1.7 }}><li>Identify the location (this form)</li><li>Add a Mapillary photo link if you have one</li><li>Describe what you noticed</li><li>Review, then submit</li><li>Transmitted to the StepSignal backend and stored in its local review database — not a central public database. Only a submission count is exposed publicly.</li></ol>
          </form>
        </section>

        <section id="about" style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="about-h">
          <h2 id="about-h" style={{ fontSize: 30, margin: "0 0 12px" }}>About StepSignal</h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.75, maxWidth: 860 }}>StepSignal was built for the Meta Global AI Developer Hackathon. Data sources: Mapillary street imagery, OpenStreetMap and Overpass, OSRM walking routes, and Meta Muse Spark (`muse-spark-1.3`) for image analysis. Privacy: location is only requested when you ask for it on the map, no location history is stored or transmitted, and API keys never reach the browser. Limitations: photographic coverage and map tags vary worldwide and may be outdated — which is precisely why every claim in StepSignal carries its date and its evidence.</p>
        </section>

        <section id="faq" style={{ padding: "40px 5vw", maxWidth: 900, margin: "0 auto" }} aria-labelledby="faq-h">
          <h2 id="faq-h" style={{ fontSize: 30, margin: "0 0 16px" }}>Frequently asked questions</h2>
          {faqs.map(([q, a]) => <details key={q} className="faq" style={{ marginBottom: 10 }}><summary>{q}</summary><p style={{ color: "var(--muted)", lineHeight: 1.65, marginBottom: 4 }}>{a}</p></details>)}
        </section>

        <section id="help" style={{ padding: "40px 5vw 60px", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="help-h">
          <h2 id="help-h" style={{ fontSize: 30, margin: "0 0 16px" }}>Help desk</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {[["Report a wrong observation", "Evidence can be wrong or outdated. Open an issue with the stretch number and photo ID.", "Open an issue", ISSUES],
              ["Map or photo will not load", "The demo needs the backend running (see README). Still stuck? File an issue with the error text.", "Setup guide", `${GH}#quick-start-verified-demo-no-api-keys-needed`],
              ["Request a new area", "Coverage follows street imagery. Tell us the route you need.", "Request an area", ISSUES],
              ["This website’s accessibility", "Keyboard-operable controls, labelled pins, alt text throughout. Tell us where we fall short.", "Tell us", ISSUES],
            ].map(([t, d, cta, href]) => <div key={t} className="card"><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>{d}</p><a href={href} style={{ fontWeight: 700 }}>{cta} →</a></div>)}
          </div>
        </section>

        <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 5vw", color: "var(--muted)", fontSize: 13, display: "flex", gap: 22, flexWrap: "wrap" }}>
          <span><b style={{ color: "var(--text)" }}>StepSignal</b> · Meta Global AI Developer Hackathon</span>
          <span>Evidence, not guarantees. Data may be outdated; capture dates are shown everywhere.</span>
          <Link href="/map">Live map</Link><a href={GH}>Source code</a>
        </footer>
      </main>
    </>
  );
}
