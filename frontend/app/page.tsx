"use client";
import Link from "next/link";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
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
            <a href="#how" style={{ color: "var(--text-2)" }}>How it works</a><a href="#ai" style={{ color: "var(--text-2)" }}>AI analysis</a><a href="#contribute" style={{ color: "var(--text-2)" }}>Contribute</a><a href="#faq" style={{ color: "var(--text-2)" }}>FAQ</a><a href="#help" style={{ color: "var(--text-2)" }}>Help desk</a><a href={GH} style={{ color: "var(--text-2)" }}>GitHub</a>
          </nav>
          <Link className="btn btn-primary" href="/map" style={{ marginLeft: "auto", padding: "10px 16px" }}>Explore a route</Link>
        </header>

        <section style={{ padding: "72px 5vw 48px", maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 44, alignItems: "center" }} aria-labelledby="hero-h">
          <div>
            <h1 id="hero-h" style={{ fontSize: 52, lineHeight: 1.06, margin: "0 0 20px", letterSpacing: "-.5px" }}>Know what lies between you and your destination.</h1>
            <p style={{ fontSize: 19, lineHeight: 1.65, color: "var(--text-2)", margin: "0 0 28px", maxWidth: 580 }}>
              StepSignal uses AI and real-world street imagery to surface accessibility evidence, identify potential barriers and help people make more informed mobility decisions.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/map" style={{ fontSize: 16, padding: "14px 24px" }}>Explore a route</Link>
              <a className="btn btn-ghost" href="#how">See how it works</a>
            </div>
            <dl style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "30px 0 0" }} aria-label="Verified example route results, Bandra West Mumbai">
              {[["11", "barrier stretches detected"], ["66.7%", "evidence coverage"], ["32", "real photos analysed"], ["6", "stretches left uncertain"]].map(([n, t]) => (
                <div key={t} className="card" style={{ padding: "13px 16px", minWidth: 150, boxShadow: "none" }}><dt style={{ fontSize: 24, fontWeight: 800 }}>{n}</dt><dd style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t}</dd></div>))}
            </dl>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Verified example: Bandra Station → Linking Road, Mumbai. Every figure opens to its photograph on the map. StepSignal works anywhere routing and street imagery exist — coverage is reported per route, never assumed.</p>
          </div>
          <div className="card" style={{ boxShadow: "var(--shadow)", transform: "perspective(1100px) rotateY(-6deg) rotateX(2deg)" }} aria-label="Product preview">
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>Route evidence preview · example route</p>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 16, position: "relative", minHeight: 190 }} role="img" aria-label="Stylised route line with barrier, uncertain and clear evidence pins">
              <svg viewBox="0 0 320 150" width="100%" aria-hidden="true"><path d="M15 130 C 80 90, 120 110, 165 70 S 260 25, 305 18" fill="none" stroke="#f0b93e" strokeWidth="5" strokeLinecap="round"/><circle cx="60" cy="105" r="10" fill="#e4572e"/><circle cx="140" cy="88" r="10" fill="#93a3b5"/><circle cx="215" cy="48" r="10" fill="#e4572e"/><circle cx="290" cy="22" r="10" fill="#2fa58f"/></svg>
              <span className="tag" style={{ position: "absolute", left: 14, bottom: 12 }}><span className="dot" style={{ background: "var(--barrier)" }} />Confirmed barrier</span>
              <span className="tag" style={{ position: "absolute", right: 14, bottom: 12 }}><span className="dot" style={{ background: "var(--unknown)" }} />Uncertain</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: "0 0 4px" }}><span className="tag"><span className="dot" style={{ background: "var(--barrier)" }} />Potential obstruction · 90% confidence</span></p>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "8px 0 4px" }}>“Merchandise and stalls covering the left sidewalk.” — observed in Mapillary photo, captured 2025-09-11.</p>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Establishes: an obstruction at capture time. Cannot establish: current conditions, pavement width, gradient.</p>
            </div>
            <Link className="btn btn-teal" href="/map" style={{ width: "100%", marginTop: 16 }}>Open this route on the map</Link>
          </div>
        </section>

        <section id="how" style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="how-h">
          <h2 id="how-h" style={{ fontSize: 30, margin: "0 0 8px" }}>How StepSignal works</h2>
          <p style={{ color: "var(--text-2)", maxWidth: 760, lineHeight: 1.7 }}>One journey, end to end: a route becomes a chain of short stretches; each stretch is checked against real photographs and map data; what is found, and what is missing, is shown separately.</p>
          <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 14, listStyle: "none", padding: 0 }}>
            {[["Plan a route", "Choose an origin and destination anywhere — type a place, or use your current location with permission. Walking routes come from OSRM."],
              ["Sample every ~50 m", "The route is divided into short stretches so one hidden kerb cannot hide inside a long “accessible” segment."],
              ["Gather real evidence", "Street-level photographs (Mapillary) and OpenStreetMap features are retrieved per stretch, with capture dates."],
              ["Analyse with AI", "Muse Spark reads each photograph and returns structured observations with confidence — never a score."],
              ["Decide with the gaps visible", "Barriers, clear-looking stretches, and uncertain stretches are labelled differently. Uncertain is a finding, not a failure."],
            ].map(([t, d], i) => <li key={t} className="card"><p style={{ color: "var(--brand)", fontWeight: 800, margin: "0 0 6px" }}>Step {i + 1}</p><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>{d}</p></li>)}
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
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Stored locally for review. Only a submission count is ever exposed publicly — never your notes.</p>
          </form>
        </section>

        <section style={{ padding: "40px 5vw", maxWidth: 1180, margin: "0 auto" }} aria-labelledby="about-h">
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
