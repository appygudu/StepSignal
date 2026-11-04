"use client";
import Link from "next/link";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const GH = "https://github.com/appygudu/StepSignal";
const ISSUES = `${GH}/issues`;

const faqs: [string, string][] = [
  ["Does StepSignal tell me a route is wheelchair accessible?", "No — and that is deliberate. A stretch is only ever described as having a confirmed barrier, having no barrier visible in the analysed evidence, or being uncertain. Photographs cannot prove a whole route is accessible."],
  ["What does “uncertain” mean?", "It means we do not have enough analysable evidence for that stretch — no photograph, an unanalysed photograph, or too many unknown signals. Uncertain is never treated as accessible."],
  ["Where do the photographs come from?", "Real street-level images from Mapillary, sampled every ~50 m along the walking route. Each photograph keeps its Mapillary ID and capture date, and both are shown wherever the photo is used."],
  ["How does the AI work?", "Each image is sent (as an image, not a URL) to Meta Muse Spark (muse-spark-1.3), which returns structured JSON: steps, kerb ramps, tactile paving, obstructions, discontinuities, crossings, crossing barriers and surface damage — each with present / absent / unknown and a confidence score. Unknown values are preserved, never converted into “absent”."],
  ["Can the AI measure ramp gradients or pavement widths?", "No. Gradients are reported only as “visually suspected” where relevant, and widths and surface quality are never measured from a photograph."],
  ["How old is the evidence?", "It varies per stretch, and the age is printed on every photograph. The verified Bandra demo uses photos from 2021–2025. Treat older photos as a prompt to check, not as current fact."],
  ["I found a barrier that is not on the map. Can I add it?", "Yes — use the “Add a street photo” form below. Paste a Mapillary link or describe the location. Submissions are queued for review and only become evidence after analysis; they are never displayed as verified on arrival."],
  ["Is my contribution public?", "The form stores your submission locally for review. The public API exposes only a submission count, never names, contacts, or notes."],
];

export default function Home() {
  const [form, setForm] = useState({ location_text: "", mapillary_url: "", barrier_type: "not_sure", note: "" });
  const [sent, setSent] = useState(""); const [sending, setSending] = useState(false);
  async function contribute(e: React.FormEvent) {
    e.preventDefault(); setSending(true); setSent("");
    try {
      const r = await fetch(`${API}/api/contributions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Could not submit");
      setSent(`Received (reference #${j.id}). Queued for review — thank you.`); setForm({ location_text: "", mapillary_url: "", barrier_type: "not_sure", note: "" });
    } catch (err: any) { setSent(`Not submitted: ${err.message}. Is the backend running on ${API}? You can also open a GitHub issue instead.`); }
    finally { setSending(false); }
  }
  const inp = { width: "100%", padding: 10, margin: "4px 0 10px", borderRadius: 6, background: "#1c2633", color: "#edf2f7", border: "1px solid #2c3a4a" } as const;

  return (
    <main style={{ background: "#0d1117", minHeight: "100vh" }}>
      <div style={{ height: 6, background: "#f2c14e" }} />
      <header style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 5vw", borderBottom: "1px solid #2c3a4a", position: "sticky", top: 0, background: "#0d1117", zIndex: 10 }}>
        <strong style={{ fontSize: 20 }}>StepSignal</strong>
        <nav style={{ display: "flex", gap: 18, fontSize: 14, flexWrap: "wrap" }}>
          <a href="#how" style={{ color: "#a7b4c2" }}>How to use</a><a href="#evidence" style={{ color: "#a7b4c2" }}>Evidence model</a><a href="#contribute" style={{ color: "#a7b4c2" }}>Add a photo</a><a href="#faq" style={{ color: "#a7b4c2" }}>FAQ</a><a href="#help" style={{ color: "#a7b4c2" }}>Help desk</a><a href={GH} style={{ color: "#a7b4c2" }}>GitHub</a>
        </nav>
        <Link href="/map" style={{ marginLeft: "auto", background: "#f2c14e", color: "#14100a", fontWeight: 800, padding: "10px 16px", borderRadius: 6, textDecoration: "none" }}>Open live map</Link>
      </header>

      <section style={{ padding: "64px 5vw 40px", maxWidth: 1120, margin: "0 auto" }}>
        <p style={{ color: "#f2c14e", fontWeight: 700, margin: "0 0 10px" }}>For wheelchair users &amp; people with mobility impairments</p>
        <h1 style={{ fontSize: 58, lineHeight: 1.04, margin: "0 0 18px", maxWidth: 760 }}>Know what is actually on the pavement before you go.</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6, color: "#c7d2de", maxWidth: 720 }}>
          StepSignal checks a walking route stretch by stretch (~50 m at a time) against real street-level photographs analysed by Meta Muse Spark.
          It shows the obstacles that were actually detected, the photograph behind each claim, a confidence score, and how old that evidence is — and it marks everything else <b>uncertain</b> instead of guessing.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "26px 0 10px" }}>
          <Link href="/map" style={{ background: "#f2c14e", color: "#14100a", fontWeight: 800, padding: "14px 22px", borderRadius: 6, textDecoration: "none", fontSize: 16 }}>Explore the Bandra evidence map →</Link>
          <a href="#contribute" style={{ border: "1px solid #2c3a4a", color: "#edf2f7", padding: "14px 22px", borderRadius: 6, textDecoration: "none" }}>Add a street photo</a>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }} aria-label="Verified Bandra demo results">
          {[["11", "stretches with confirmed barriers"], ["66.7%", "evidence coverage (12 of 18)"], ["32", "real photos analysed by Muse Spark"], ["6", "stretches honestly uncertain"]].map(([n, t]) => (
            <div key={t} style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 8, padding: "14px 16px", minWidth: 170 }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 13, color: "#a7b4c2" }}>{t}</div>
            </div>))}
        </div>
        <p style={{ fontSize: 12, color: "#8b98a8" }}>Verified demo route: Bandra Station → Linking Road Bandra, Mumbai. Figures are from real cached analysis — open the map to inspect every photograph behind them.</p>
      </section>

      <section id="how" style={{ padding: "34px 5vw", maxWidth: 1120, margin: "0 auto" }}>
        <h2 style={{ fontSize: 30, margin: "0 0 16px" }}>How to use StepSignal</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          {[
            ["1 · Open the map", "The verified Bandra report loads automatically. Coloured pins mark every ~50 m stretch."],
            ["2 · Read the colours honestly", "Orange: a barrier was detected. Teal: no barrier was visible in the analysed photos. Grey: uncertain — we do not know, and we say so."],
            ["3 · Click any pin", "See the actual street photographs, capture dates, detected obstacles, confidence scores, and the model's evidence notes. Click a photo to enlarge it."],
            ["4 · Filter and compare", "Use the filters to isolate confirmed barriers or evidence gaps, and compare the dashed alternate route stretch by stretch."],
            ["5 · Plan with the gaps in mind", "An uncertain stretch is a reason to check, reroute, or ask — not a green light. Evidence age is printed on every photo."],
          ].map(([t, d]) => <div key={t} style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 8, padding: 18 }}><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ margin: 0, color: "#a7b4c2", lineHeight: 1.6, fontSize: 14 }}>{d}</p></div>)}
        </div>
      </section>

      <section id="evidence" style={{ padding: "34px 5vw", maxWidth: 1120, margin: "0 auto" }}>
        <h2 style={{ fontSize: 30, margin: "0 0 12px" }}>The evidence model</h2>
        <p style={{ color: "#c7d2de", lineHeight: 1.7, maxWidth: 820 }}>Conventional accessibility maps assign a score. StepSignal refuses to. Muse Spark looks for steps, kerb ramps, tactile paving, pavement obstructions, sidewalk discontinuities, pedestrian crossings, crossing barriers and surface damage — and returns <i>present</i>, <i>absent</i>, or <i>unknown</i> with a confidence value for each. Unknowns stay unknown all the way to your screen. Gradients, widths and surface quality are never measured from a photograph, people in photos are never identified, and no route is ever labelled fully wheelchair accessible.</p>
      </section>

      <section id="contribute" style={{ padding: "34px 5vw", maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
        <div>
          <h2 style={{ fontSize: 30, margin: "0 0 12px" }}>Help map the gaps</h2>
          <p style={{ color: "#c7d2de", lineHeight: 1.7 }}>Six of the eighteen Bandra stretches have no street photograph at all. That is exactly where local knowledge matters. Walked past a missing dropped kerb, a blocked footway, or a new ramp? Send us the street and, if you have one, a Mapillary photo link. Submissions are reviewed and analysed before they count as evidence — your tip opens an investigation, it does not become a claim.</p>
          <p style={{ color: "#a7b4c2", lineHeight: 1.7, fontSize: 14 }}>Prefer GitHub? <a href={ISSUES} style={{ color: "#f2c14e" }}>Open an issue with the location</a> instead. Photographers: uploading street imagery to Mapillary under your own account also directly improves future coverage.</p>
        </div>
        <form onSubmit={contribute} style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 8, padding: 20 }} aria-label="Add a street photo or location">
          <label style={{ fontSize: 13 }}>Street / location (required)<input required value={form.location_text} onChange={e => setForm({ ...form, location_text: e.target.value })} placeholder="e.g. Linking Road near National College, Bandra" style={inp} /></label>
          <label style={{ fontSize: 13 }}>Mapillary photo link (optional)<input value={form.mapillary_url} onChange={e => setForm({ ...form, mapillary_url: e.target.value })} placeholder="https://www.mapillary.com/app/?pKey=…" style={inp} /></label>
          <label style={{ fontSize: 13 }}>What did you notice?<select value={form.barrier_type} onChange={e => setForm({ ...form, barrier_type: e.target.value })} style={inp}>
            <option value="not_sure">Not sure — please check</option><option value="steps">Steps / staircase</option><option value="kerb">Missing kerb ramp</option><option value="obstruction">Pavement obstruction</option><option value="surface">Surface damage</option><option value="tactile">Tactile paving (present or missing)</option><option value="ramp">Ramp (present or missing)</option><option value="crossing">Crossing barrier</option>
          </select></label>
          <label style={{ fontSize: 13 }}>Note<textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} placeholder="Anything that helps locate it…" style={inp} /></label>
          <button disabled={sending} style={{ width: "100%", padding: 12, borderRadius: 6, background: "#2a9d8f", border: "none", fontWeight: 800, cursor: "pointer" }}>{sending ? "Sending…" : "Submit for review"}</button>
          {sent && <p style={{ fontSize: 13, lineHeight: 1.5 }} role="status">{sent}</p>}
        </form>
      </section>

      <section id="faq" style={{ padding: "34px 5vw", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontSize: 30, margin: "0 0 16px" }}>Frequently asked questions</h2>
        {faqs.map(([q, a]) => <details key={q} style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 8, padding: "14px 18px", marginBottom: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>{q}</summary><p style={{ color: "#a7b4c2", lineHeight: 1.65, marginBottom: 4 }}>{a}</p>
        </details>)}
      </section>

      <section id="help" style={{ padding: "34px 5vw 56px", maxWidth: 1120, margin: "0 auto" }}>
        <h2 style={{ fontSize: 30, margin: "0 0 16px" }}>Help desk</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {[
            ["Report a wrong observation", "Model evidence can be wrong or outdated. Open a GitHub issue with the stretch number and photo ID and we will re-check it.", "Open an issue", ISSUES],
            ["The map or a photo will not load", "The verified demo needs the backend on port 8001. Setup steps are in the README; if it still fails, file an issue with your browser and the error text.", "Setup guide", `${GH}#quick-start-verified-demo-no-api-keys-needed`],
            ["Request a new neighbourhood", "Coverage follows Mapillary imagery. Tell us the area and route you need — good photo coverage is the main requirement.", "Request an area", ISSUES],
            ["Accessibility of this website", "We aim for keyboard-operable controls, labelled pins, and text alternatives for evidence photos. Tell us where we fall short.", "Tell us", ISSUES],
          ].map(([t, d, cta, href]) => <div key={t} style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 8, padding: 18 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t}</h3><p style={{ color: "#a7b4c2", lineHeight: 1.6, fontSize: 14 }}>{d}</p>
            <a href={href} style={{ color: "#f2c14e", fontWeight: 700 }}>{cta} →</a>
          </div>)}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #2c3a4a", padding: "22px 5vw", color: "#8b98a8", fontSize: 13, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span><b style={{ color: "#edf2f7" }}>StepSignal</b> · Meta Global AI Developer Hackathon</span>
        <span>Evidence, not guarantees. Data may be outdated.</span>
        <Link href="/map" style={{ color: "#f2c14e" }}>Live map</Link><a href={GH} style={{ color: "#f2c14e" }}>Source code</a>
      </footer>
    </main>
  );
}
