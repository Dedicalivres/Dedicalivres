import { useEffect, useRef, useState } from "react";

/* =========================================================
   NORTHLIGHT FILMS — cinematic landing page
   Full-screen HLS video · glassmorphic nav · hero bottom-left
   Video: public demo HLS stream (swap VIDEO_HLS for your own).
   If the stream fails, an animated dusk gradient takes over.
========================================================= */

const VIDEO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

const NAV = [
  ["Work", "#work"],
  ["Studio", "#studio"],
  ["Journal", "#journal"],
  ["Contact", "#contact"],
];

export default function NorthlightLanding() {
  const videoRef = useRef(null);
  const [videoOk, setVideoOk] = useState(true);
  const [tc, setTc] = useState("00:00:00:00");

  /* ---------- HLS loading (hls.js via CDN, native Safari fallback) ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls;
    const fail = () => setVideoOk(false);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = VIDEO_HLS;
      video.play().catch(() => {});
    } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
      s.onload = () => {
        if (window.Hls && window.Hls.isSupported()) {
          hls = new window.Hls();
          hls.loadSource(VIDEO_HLS);
          hls.attachMedia(video);
          hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
          video.play().catch(() => {});
        } else fail();
      };
      s.onerror = fail;
      document.head.appendChild(s);
    }
    return () => { if (hls) hls.destroy(); };
  }, []);

  /* ---------- Signature: live timecode tied to the footage ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      const t = v && !isNaN(v.currentTime) ? v.currentTime : performance.now() / 1000;
      const h = String(Math.floor(t / 3600) % 24).padStart(2, "0");
      const m = String(Math.floor(t / 60) % 60).padStart(2, "0");
      const s = String(Math.floor(t) % 60).padStart(2, "0");
      const f = String(Math.floor((t % 1) * 24)).padStart(2, "0");
      setTc(`${h}:${m}:${s}:${f}`);
    }, 1000 / 24);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      fontFamily: "'Archivo', system-ui, sans-serif",
      position: "relative", minHeight: "100vh", overflow: "hidden",
      background: "#0B0E14", color: "#EDE6DA"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Archivo:wght@400;500;600;700&display=swap');
        @keyframes dusk { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(70px,-50px) scale(1.18)} }
        @keyframes rise { from{opacity:0; transform:translateY(28px)} to{opacity:1; transform:none} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes cue { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
        .nl-nav a {
          color:rgba(237,230,218,.85); text-decoration:none; font-weight:500;
          font-size:.86rem; letter-spacing:.02em; padding:9px 14px; border-radius:40px;
          transition:background .25s, color .2s;
        }
        .nl-nav a:hover { background:rgba(237,230,218,.12); color:#fff; }
        .nl-nav a:focus-visible, .nl-cta:focus-visible, .nl-ghost:focus-visible {
          outline:2px solid #F5A83C; outline-offset:3px;
        }
        .nl-cta { transition:transform .25s ease, box-shadow .25s ease; }
        .nl-cta:hover { transform:translateY(-2px); box-shadow:0 16px 38px rgba(245,168,60,.4); }
        .nl-ghost { transition:background .25s ease, transform .25s ease; }
        .nl-ghost:hover { background:rgba(237,230,218,.14); transform:translateY(-2px); }
        @media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important} }
        @media (max-width: 640px){ .nl-meta-right{ display:none } }
      `}</style>

      {/* ================= BACKGROUND ================= */}
      {videoOk ? (
        <video
          ref={videoRef}
          muted loop playsInline autoPlay
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(170deg,#101623,#0B0E14 60%)" }}>
          <div style={{ position: "absolute", width: 680, height: 540, borderRadius: "50%", filter: "blur(100px)", background: "rgba(245,168,60,.16)", top: "-18%", right: "-10%", animation: "dusk 26s ease-in-out infinite alternate" }} />
          <div style={{ position: "absolute", width: 560, height: 480, borderRadius: "50%", filter: "blur(100px)", background: "rgba(96,126,181,.2)", bottom: "-16%", left: "-8%", animation: "dusk 26s ease-in-out infinite alternate", animationDelay: "-11s" }} />
        </div>
      )}

      {/* darkening scrim: readable text, cinematic bottom weight */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(0deg, rgba(11,14,20,.88) 0%, rgba(11,14,20,.25) 46%, rgba(11,14,20,.45) 100%)" }} />
      {/* film grain */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: .5, mixBlendMode: "overlay",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .05 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")`
      }} />

      {/* ================= GLASS NAV ================= */}
      <header style={{
        position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
        width: "min(1120px, calc(100% - 28px))", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        background: "rgba(237,230,218,.07)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(237,230,218,.16)",
        borderRadius: 60, padding: "9px 10px 9px 20px",
        boxShadow: "0 16px 50px rgba(0,0,0,.4)"
      }}>
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#EDE6DA" }}>
          {/* aperture mark */}
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="11.5" fill="none" stroke="#F5A83C" strokeWidth="1.6" />
            <g stroke="#EDE6DA" strokeWidth="1.6" strokeLinecap="round">
              <path d="M13 4.5 L13 11" /><path d="M20.4 8.8 L14.7 12.1" /><path d="M20.4 17.2 L14.7 13.9" />
              <path d="M13 21.5 L13 15" /><path d="M5.6 17.2 L11.3 13.9" /><path d="M5.6 8.8 L11.3 12.1" />
            </g>
          </svg>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "1.08rem", letterSpacing: ".01em" }}>
            Northlight
          </span>
        </a>

        <nav className="nl-nav" style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {NAV.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
          <a href="#contact" className="nl-cta" style={{
            marginLeft: 8, textDecoration: "none", fontWeight: 600, fontSize: ".86rem",
            color: "#0B0E14", background: "#F5A83C",
            padding: "10px 20px", borderRadius: 40,
            boxShadow: "0 10px 28px rgba(245,168,60,.35)"
          }}>Start a project</a>
        </nav>
      </header>

      {/* ================= HERO — BOTTOM LEFT ================= */}
      <main style={{
        position: "relative", zIndex: 5, minHeight: "100vh",
        display: "flex", alignItems: "flex-end", justifyContent: "flex-start",
        padding: "clamp(96px,14vh,150px) clamp(20px,5vw,60px) clamp(56px,9vh,90px)"
      }}>
        <div style={{ maxWidth: 680 }}>
          {/* signature: live timecode chip */}
          <p style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            margin: "0 0 20px", padding: "8px 16px", borderRadius: 40,
            background: "rgba(11,14,20,.5)", border: "1px solid rgba(237,230,218,.18)",
            backdropFilter: "blur(8px)",
            fontSize: ".78rem", fontWeight: 600, letterSpacing: ".14em",
            fontVariantNumeric: "tabular-nums",
            animation: "rise .7s cubic-bezier(.3,1,.4,1) both"
          }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "#E5484D", animation: "blink 1.6s ease-in-out infinite" }} />
            NOW FILMING · {tc}
          </p>

          <h1 style={{
            fontFamily: "'Fraunces', serif", fontWeight: 500,
            fontSize: "clamp(2.5rem,6vw,4.6rem)", lineHeight: 1.02,
            letterSpacing: "-.015em", margin: 0,
            textShadow: "0 4px 40px rgba(0,0,0,.45)",
            animation: "rise .8s cubic-bezier(.3,1,.4,1) .1s both"
          }}>
            Stories that hold<br />
            <em style={{ fontStyle: "italic", color: "#F5A83C" }}>the light</em> a little longer.
          </h1>

          <p style={{
            color: "rgba(237,230,218,.78)", maxWidth: "46ch",
            fontSize: "1.02rem", lineHeight: 1.7, margin: "22px 0 30px",
            animation: "rise .8s cubic-bezier(.3,1,.4,1) .22s both"
          }}>
            Northlight is a documentary studio filming at the edges of daylight —
            fjords, night shifts, last harvests. We make films for people who
            watch the credits.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", animation: "rise .8s cubic-bezier(.3,1,.4,1) .34s both" }}>
            <a href="#work" className="nl-cta" style={{
              textDecoration: "none", fontWeight: 600, fontSize: ".95rem",
              color: "#0B0E14", background: "#F5A83C",
              padding: "15px 30px", borderRadius: 50,
              boxShadow: "0 14px 34px rgba(245,168,60,.35)"
            }}>Watch the reel</a>
            <a href="#studio" className="nl-ghost" style={{
              textDecoration: "none", fontWeight: 600, fontSize: ".95rem",
              color: "#EDE6DA", background: "rgba(237,230,218,.08)",
              border: "1px solid rgba(237,230,218,.32)",
              backdropFilter: "blur(8px)",
              padding: "15px 30px", borderRadius: 50
            }}>Inside the studio</a>
          </div>
        </div>
      </main>

      {/* ================= RIGHT-EDGE META ================= */}
      <aside className="nl-meta-right" aria-hidden="true" style={{
        position: "absolute", right: "clamp(16px,3vw,36px)", bottom: "clamp(56px,9vh,90px)", zIndex: 5,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14,
        fontSize: ".72rem", fontWeight: 600, letterSpacing: ".16em",
        color: "rgba(237,230,218,.6)", textTransform: "uppercase"
      }}>
        <span>Reel 2026 — 4K HDR</span>
        <span>Tromsø · Reykjavík · Ushuaia</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Scroll
          <svg width="12" height="22" viewBox="0 0 12 22" style={{ animation: "cue 1.8s ease-in-out infinite" }}>
            <path d="M6 2 V18 M2 14 L6 19 L10 14" fill="none" stroke="rgba(237,230,218,.7)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </aside>
    </div>
  );
}
