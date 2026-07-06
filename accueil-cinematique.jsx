import { useEffect, useRef, useState } from "react";

/* =========================================================
   DÉDICALIVRES — Maquette « accueil cinématique »
   Modèle : vidéo HLS plein écran + header glassmorphique
   + contenu hero en bas à gauche, aux couleurs de la marque.

   La vidéo utilise un flux HLS public de démonstration.
   En production : remplacer VIDEO_HLS par votre propre film
   (images de salons, dédicaces, mains qui feuillettent...).
   Si le flux échoue, un fond aquarelle animé prend le relais.
========================================================= */

const VIDEO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

const NAV = [
  ["Agenda", "#agenda"],
  ["Salons & Festivals", "#salons"],
  ["Dédicaces", "#dedicaces"],
  ["Témoignages", "#temoignages"],
];

export default function AccueilCinematique() {
  const videoRef = useRef(null);
  const [videoOk, setVideoOk] = useState(true);

  /* Chargement HLS (hls.js via CDN, repli natif Safari) */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls;

    function fail() { setVideoOk(false); }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = VIDEO_HLS;
      video.play().catch(fail);
    } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
      s.onload = () => {
        if (window.Hls && window.Hls.isSupported()) {
          hls = new window.Hls();
          hls.loadSource(VIDEO_HLS);
          hls.attachMedia(video);
          hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (data.fatal) fail();
          });
          video.play().catch(() => {});
        } else fail();
      };
      s.onerror = fail;
      document.head.appendChild(s);
    }
    return () => { if (hls) hls.destroy(); };
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", position: "relative", minHeight: "100vh", overflow: "hidden", background: "#1c0e35", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Inter:wght@500;600;700;800&display=swap');
        @keyframes nappe { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(60px,-46px) scale(1.15)} }
        @keyframes rise { from{opacity:0; transform:translateY(30px)} to{opacity:1; transform:none} }
        @keyframes draw { to{ stroke-dashoffset:0 } }
        @keyframes ticker { to{ transform:translateX(-50%) } }
        .dl-nav a { color:rgba(255,255,255,.88); text-decoration:none; font-weight:600; font-size:.92rem;
          padding:9px 15px; border-radius:40px; transition:background .25s, color .25s, transform .3s cubic-bezier(.34,1.56,.64,1); }
        .dl-nav a:hover { background:rgba(255,255,255,.14); transform:translateY(-2px); }
        .dl-cta:hover { transform:translateY(-3px) scale(1.04); box-shadow:0 18px 40px rgba(255,107,53,.5); }
        .dl-ghost:hover { background:rgba(255,255,255,.16); transform:translateY(-3px); }
        @media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important} }
      `}</style>

      {/* ---------- FOND : vidéo HLS ou aquarelle de secours ---------- */}
      {videoOk ? (
        <video
          ref={videoRef}
          muted loop playsInline autoPlay
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#2c1257,#3a1c71 55%,#241043)" }}>
          <div style={{ position: "absolute", width: 640, height: 520, borderRadius: "50%", filter: "blur(90px)", background: "rgba(255,140,90,.3)", top: -140, left: -120, animation: "nappe 24s ease-in-out infinite alternate" }} />
          <div style={{ position: "absolute", width: 560, height: 480, borderRadius: "50%", filter: "blur(90px)", background: "rgba(201,158,240,.3)", bottom: -120, right: -100, animation: "nappe 24s ease-in-out infinite alternate", animationDelay: "-9s" }} />
        </div>
      )}

      {/* ---------- VOILE DUOTONE SIGNATURE ---------- */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(160deg, rgba(38,17,72,.72) 0%, rgba(58,28,113,.45) 45%, rgba(233,88,37,.28) 100%)"
      }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(0deg, rgba(20,8,40,.82) 0%, transparent 45%)"
      }} />

      {/* ---------- HEADER GLASSMORPHIQUE ---------- */}
      <header style={{
        position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
        width: "min(1160px, calc(100% - 32px))", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        background: "rgba(255,255,255,.1)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,.22)", borderRadius: 60,
        padding: "10px 12px 10px 20px", boxShadow: "0 14px 44px rgba(10,4,24,.35)"
      }}>
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff", fontWeight: 900, fontSize: "1.05rem" }}>
          <span style={{
            width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#ff6b35,#e95825)", boxShadow: "0 6px 16px rgba(255,107,53,.45)"
          }} aria-hidden="true">
            {/* plume au trait */}
            <svg width="20" height="22" viewBox="0 0 40 44"><path d="M32 4 Q 18 8 12 20 Q 7 30 8 40 Q 10 32 16 26 L 13 25 Q 20 24 24 18 L 20 18 Q 28 14 32 4 Z" fill="#fff"/></svg>
          </span>
          Dédicalivres
        </a>
        <nav className="dl-nav" style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          {NAV.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
          <a href="#soumettre" style={{
            background: "linear-gradient(135deg,#ff6b35,#e95825)", color: "#fff",
            boxShadow: "0 6px 18px rgba(255,107,53,.45)", marginLeft: 6
          }}>Soumettre ✒️</a>
        </nav>
      </header>

      {/* ---------- HERO EN BAS À GAUCHE ---------- */}
      <main style={{
        position: "relative", zIndex: 5, minHeight: "100vh",
        display: "flex", alignItems: "flex-end",
        padding: "clamp(90px,12vh,140px) clamp(20px,5vw,64px) clamp(90px,11vh,120px)"
      }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            fontWeight: 800, fontSize: ".78rem", letterSpacing: ".14em", textTransform: "uppercase",
            color: "#ffb28f", marginBottom: 18, animation: "rise .7s cubic-bezier(.34,1.56,.64,1) both"
          }}>
            <span style={{ width: 34, height: 2, background: "linear-gradient(90deg,transparent,#ff6b35)", borderRadius: 2 }} />
            Association culturelle francophone
          </p>

          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 800,
            fontSize: "clamp(2.2rem,5.2vw,4rem)", lineHeight: 1.08, margin: 0,
            textShadow: "0 4px 34px rgba(10,4,24,.45)",
            animation: "rise .8s cubic-bezier(.34,1.56,.64,1) .12s both"
          }}>
            Le livre crée des{" "}
            <span style={{ color: "#ff8c5a", position: "relative", whiteSpace: "nowrap", display: "inline-block" }}>
              rencontres
              <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"
                style={{ position: "absolute", left: "-3%", bottom: "-.12em", width: "106%", height: ".3em", overflow: "visible" }}>
                <path d="M3 10 Q 25 2 50 8 T 97 7" fill="none" stroke="#ff6b35" strokeWidth="3.4"
                  strokeLinecap="round" style={{ strokeDasharray: 120, strokeDashoffset: 120, animation: "draw 1s ease-out 1s forwards" }} />
              </svg>
            </span>.
            <br />Nous les rendons visibles.
          </h1>

          <p style={{
            color: "rgba(255,255,255,.82)", fontWeight: 600, maxWidth: "48ch",
            margin: "20px 0 30px", lineHeight: 1.65,
            animation: "rise .8s cubic-bezier(.34,1.56,.64,1) .24s both"
          }}>
            Salons, festivals et dédicaces en France, Belgique, Luxembourg,
            Suisse et Monaco — un agenda participatif et vérifié.
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", animation: "rise .8s cubic-bezier(.34,1.56,.64,1) .36s both" }}>
            <a href="#agenda" className="dl-cta" style={{
              textDecoration: "none", color: "#fff", fontWeight: 800, fontSize: ".95rem",
              background: "linear-gradient(135deg,#ff6b35,#e95825)", padding: "15px 30px", borderRadius: 50,
              boxShadow: "0 12px 30px rgba(255,107,53,.42)",
              transition: "transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s"
            }}>Explorer l'agenda</a>
            <a href="#soumettre" className="dl-ghost" style={{
              textDecoration: "none", color: "#fff", fontWeight: 800, fontSize: ".95rem",
              background: "rgba(255,255,255,.1)", backdropFilter: "blur(10px)",
              border: "1.5px solid rgba(255,255,255,.4)", padding: "15px 30px", borderRadius: 50,
              transition: "background .25s, transform .3s cubic-bezier(.34,1.56,.64,1)"
            }}>Soumettre un événement</a>
          </div>
        </div>
      </main>

      {/* ---------- RUBAN PAYS EN PIED (repère de marque) ---------- */}
      <div aria-hidden="true" style={{
        position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 6,
        background: "rgba(20,8,40,.55)", backdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(255,255,255,.14)", overflow: "hidden", padding: "11px 0"
      }}>
        <div style={{
          display: "flex", width: "max-content", whiteSpace: "nowrap",
          fontWeight: 800, letterSpacing: ".05em", fontSize: ".85rem",
          animation: "ticker 30s linear infinite"
        }}>
          {[0, 1].map(i => (
            <span key={i} style={{ display: "inline-block" }}>
              {["France", "Belgique", "Luxembourg", "Suisse", "Monaco", "Salons", "Festivals", "Dédicaces", "Rencontres d'auteurs"].map(w => (
                <span key={w} style={{ margin: "0 14px" }}>
                  {w} <span style={{ color: "#ff6b35", margin: "0 0 0 14px" }}>✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
