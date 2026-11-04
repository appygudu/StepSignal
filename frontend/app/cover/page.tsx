import Link from "next/link";

export const metadata = { title: "StepSignal — Cover", description: "Street-level accessibility evidence, not accessibility guesses." };

export default function Cover() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "auto 1fr auto", background: "#0d1117" }}>
      <div style={{ height: 8, background: "#f2c14e" }} />
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 32, alignItems: "center", padding: "48px 6vw", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div>
          <p style={{ color: "#f2c14e", fontWeight: 700, margin: "0 0 10px" }}>Meta Global AI Developer Hackathon</p>
          <h1 style={{ fontSize: 64, lineHeight: 1.02, margin: "0 0 16px" }}>StepSignal</h1>
          <p style={{ fontSize: 22, lineHeight: 1.45, margin: "0 0 14px" }}>Street-level accessibility evidence, not accessibility guesses.</p>
          <p style={{ color: "#a7b4c2", lineHeight: 1.65, maxWidth: 560 }}>
            StepSignal samples a walking route every ~50 metres, retrieves real street photographs, and analyses each with Meta Muse Spark.
            Every obstacle claim links to its photograph, confidence score, and capture date. Stretches without evidence stay uncertain — never “accessible”.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "22px 0" }}>
            <span style={{ background: "#e4572e", color: "#0d1117", fontWeight: 700, padding: "9px 13px", borderRadius: 6 }}>11 barrier stretches</span>
            <span style={{ background: "#2a9d8f", color: "#0d1117", fontWeight: 700, padding: "9px 13px", borderRadius: 6 }}>66.7% coverage</span>
            <span style={{ background: "#1c2633", padding: "9px 13px", borderRadius: 6 }}>32 real photos analysed</span>
          </div>
          <Link href="/" style={{ display: "inline-block", background: "#f2c14e", color: "#14100a", fontWeight: 800, padding: "13px 20px", borderRadius: 6, textDecoration: "none" }}>Open the live evidence map</Link>
          <p style={{ fontSize: 13, color: "#8b98a8", marginTop: 14 }}>Demo: Bandra Station → Linking Road Bandra, Mumbai · No route is ever labelled fully wheelchair accessible.</p>
        </div>
        <div style={{ background: "#161d26", border: "1px solid #2c3a4a", borderRadius: 10, padding: 22, boxShadow: "0 24px 48px rgba(0,0,0,.45)", transform: "perspective(900px) rotateY(-7deg) rotateX(3deg)" }}>
          <p style={{ margin: "0 0 14px", color: "#a7b4c2", fontSize: 13 }}>What judges see in 2 minutes</p>
          {[
            ["1", "Run the route", "Bandra Station → Linking Road, sampled into 18 stretches."],
            ["2", "Click an orange pin", "Confirmed barrier: photo, date, confidence, evidence text."],
            ["3", "Click a grey pin", "Uncertain means unassessed. The app refuses to guess."],
            ["4", "Read the coverage", "Only stretches with analysable evidence count toward 66.7%."],
          ].map(([n, t, d]) => <div key={n} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 12, marginBottom: 16 }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#f2c14e", color: "#14100a", fontWeight: 800, display: "grid", placeItems: "center" }}>{n}</span>
            <span><b>{t}.</b> <span style={{ color: "#a7b4c2" }}>{d}</span></span>
          </div>)}
          <div style={{ borderTop: "1px solid #2c3a4a", paddingTop: 14, fontSize: 13, color: "#a7b4c2", lineHeight: 1.6 }}>
            Built with Muse Spark (`muse-spark-1.3`), Mapillary imagery, OpenStreetMap, OSRM, Next.js, MapLibre GL and FastAPI.
          </div>
        </div>
      </section>
      <footer style={{ padding: "18px 6vw", borderTop: "1px solid #2c3a4a", color: "#8b98a8", fontSize: 13, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span>Evidence may be outdated — capture dates are shown everywhere.</span>
        <span>Gradients and widths are never measured from photographs.</span>
        <Link href="/" style={{ color: "#f2c14e" }}>Live map →</Link>
      </footer>
    </main>
  );
}
