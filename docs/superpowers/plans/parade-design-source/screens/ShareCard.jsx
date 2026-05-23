// ShareCard.jsx — Screen 5: portrait shareable card (1080×1920)
// Cream paper / Arsenal red / gold trophy. Instagram Story format.
// Designed to feel like a printed match-day program rather than a sports app.

function ShareCard() {
  return (
    <div style={{
      width: 1080, height: 1920,
      background: '#F5EFE4',
      color: '#14120F',
      fontFamily: 'var(--sans)',
      position: 'relative',
      overflow: 'hidden',
      padding: '90px 90px 90px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* paper-grain texture, very subtle */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(rgba(20,18,15,0.04) 1px, transparent 1px),
          radial-gradient(rgba(20,18,15,0.03) 1px, transparent 1px)`,
        backgroundSize: '12px 12px, 23px 23px',
        backgroundPosition: '0 0, 7px 11px',
      }} />

      {/* TOP — red wordmark band */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 26, borderBottom: '3px solid var(--red)',
        }}>
          <span className="mono" style={{ fontSize: 18, color: 'rgba(20,18,15,0.55)', letterSpacing: '0.28em' }}>
            25 · 05 · 2025
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700,
            letterSpacing: '0.62em', color: 'var(--red)',
          }}>ARSENAL</span>
          <span className="mono" style={{ fontSize: 18, color: 'rgba(20,18,15,0.55)', letterSpacing: '0.28em' }}>
            N51.5536
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--red)', marginTop: 4, width: '100%' }} />
      </div>

      {/* HERO — gold trophy on cream */}
      <div style={{ marginTop: 70, display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        <BigShareTrophy />
      </div>

      {/* TITLE BLOCK */}
      <div style={{ marginTop: 30, textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div className="mono" style={{
          fontSize: 22, letterSpacing: '0.38em',
          color: 'var(--red)', fontWeight: 600,
        }}>
          PREMIER LEAGUE CHAMPIONS · 24/25
        </div>

        <h1 className="serif" style={{
          margin: '40px 0 0', fontSize: 220, fontWeight: 500,
          fontStyle: 'italic', color: '#14120F',
          lineHeight: 0.88, letterSpacing: '-0.035em',
          fontVariationSettings: '"opsz" 144',
        }}>
          I was<br/>
          <span style={{ color: 'var(--red)' }}>there.</span>
        </h1>
      </div>

      {/* STATS STRIP */}
      <div style={{
        marginTop: 'auto',
        position: 'relative', zIndex: 2,
      }}>
        {/* big celebration number, asymmetric */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 32, marginBottom: 36,
        }}>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{
              fontSize: 16, letterSpacing: '0.28em', color: 'rgba(20,18,15,0.55)',
              fontWeight: 600,
            }}>MY CELEBRATIONS</div>
            <div className="serif" style={{
              marginTop: 8, fontSize: 220, fontWeight: 600,
              color: 'var(--red)', lineHeight: 0.85, letterSpacing: '-0.035em',
              fontStyle: 'italic',
              fontVariantNumeric: 'tabular-nums',
            }}>847</div>
          </div>
          <div style={{ flex: '0 0 auto', textAlign: 'right', paddingBottom: 16 }}>
            <div className="mono" style={{
              fontSize: 16, letterSpacing: '0.28em', color: 'rgba(20,18,15,0.55)',
              fontWeight: 600,
            }}>ALONG THE ROUTE</div>
            <div className="serif" style={{
              marginTop: 8, fontSize: 88, fontWeight: 500,
              color: '#14120F', lineHeight: 1, letterSpacing: '-0.02em',
              fontStyle: 'italic',
            }}>2.4<span style={{ color: 'var(--red)' }}>M</span></div>
            <div className="mono" style={{
              marginTop: 6, fontSize: 18, color: 'rgba(20,18,15,0.55)',
              letterSpacing: '0.06em',
            }}>taps</div>
          </div>
        </div>

        {/* location pin row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 0',
          borderTop: '2px solid var(--red)',
          borderBottom: '1px solid rgba(20,18,15,0.12)',
        }}>
          <PinIcon />
          <div style={{ flex: 1 }}>
            <div className="serif" style={{
              fontSize: 44, fontStyle: 'italic', color: '#14120F',
              letterSpacing: '-0.01em', lineHeight: 1,
            }}>Holloway Road</div>
            <div className="mono" style={{
              marginTop: 6, fontSize: 16, color: 'rgba(20,18,15,0.55)',
              letterSpacing: '0.04em',
            }}>51.5536°N · −0.1090°W · 14:34</div>
          </div>
        </div>

        {/* footer */}
        <div style={{
          marginTop: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ShippieRocket />
            <div>
              <div className="mono" style={{ fontSize: 22, color: '#14120F', letterSpacing: '0.06em', fontWeight: 600 }}>
                shippie.app/parade
              </div>
              <div className="mono" style={{ fontSize: 14, color: 'rgba(20,18,15,0.5)', letterSpacing: '0.18em', marginTop: 6 }}>
                LOCAL-FIRST · OFFLINE BY DESIGN
              </div>
            </div>
          </div>
          <div className="mono" style={{
            fontSize: 18, color: 'var(--red)', letterSpacing: '0.18em', textAlign: 'right',
            lineHeight: 1.4, fontWeight: 600,
          }}>
            NO SIGNAL.<br/>NO PROBLEM.
          </div>
        </div>
      </div>
    </div>
  );
}

// Big gold trophy with red ribbon — sits well on cream paper
function BigShareTrophy() {
  return (
    <div style={{ position: 'relative', width: 380, height: 460 }}>
      {/* warm halo */}
      <div style={{
        position: 'absolute', inset: -40,
        background: 'radial-gradient(circle, rgba(237,187,74,0.22), rgba(237,187,74,0) 60%)',
      }} />
      <svg width="380" height="460" viewBox="0 0 380 460" fill="none" style={{ position: 'relative' }}>
        {/* red ribbon behind */}
        <path d="M40 60 L 95 110 L 65 175 L 12 130 Z" fill="var(--red)" opacity="0.95"/>
        <path d="M340 60 L 285 110 L 315 175 L 368 130 Z" fill="var(--red)" opacity="0.95"/>
        <path d="M40 60 L 60 50 L 100 100 L 95 110 Z" fill="var(--red-deep, #C40006)"/>
        <path d="M340 60 L 320 50 L 280 100 L 285 110 Z" fill="var(--red-deep, #C40006)"/>

        {/* cup body */}
        <path d="M95 30 H 285 V 130 A 95 95 0 0 1 95 130 V 30 Z"
              fill="var(--gold)" stroke="#14120F" strokeWidth="4" />
        {/* handles */}
        <path d="M95 50 H 40 V 90 Q 40 130 95 130"
              stroke="var(--gold)" strokeWidth="14" fill="none" strokeLinecap="round"/>
        <path d="M95 50 H 40 V 90 Q 40 130 95 130"
              stroke="#14120F" strokeWidth="4" fill="none" />
        <path d="M285 50 H 340 V 90 Q 340 130 285 130"
              stroke="var(--gold)" strokeWidth="14" fill="none" strokeLinecap="round"/>
        <path d="M285 50 H 340 V 90 Q 340 130 285 130"
              stroke="#14120F" strokeWidth="4" fill="none" />
        {/* rim */}
        <path d="M85 30 H 295" stroke="#14120F" strokeWidth="6" strokeLinecap="square"/>
        {/* sheen inside cup */}
        <path d="M125 50 V 80 a 16 16 0 0 0 32 0 V 50"
              stroke="rgba(255,255,255,0.6)" strokeWidth="3" fill="none"/>
        {/* stem */}
        <path d="M190 220 V 280" stroke="#14120F" strokeWidth="4"/>
        <ellipse cx="190" cy="225" rx="14" ry="6" fill="var(--gold)" stroke="#14120F" strokeWidth="3"/>
        {/* base layers */}
        <rect x="110" y="280" width="160" height="14" fill="var(--gold)" stroke="#14120F" strokeWidth="3"/>
        <rect x="120" y="304" width="140" height="14" fill="var(--gold)" stroke="#14120F" strokeWidth="3"/>
        <rect x="95"  y="338" width="190" height="22" fill="var(--gold)" stroke="#14120F" strokeWidth="3"/>
        <rect x="65"  y="380" width="250" height="36" fill="var(--gold)" stroke="#14120F" strokeWidth="4"/>
        {/* engraved plaque on base */}
        <rect x="120" y="392" width="140" height="14" fill="none" stroke="#14120F" strokeWidth="1.5"/>
        <text x="190" y="403" textAnchor="middle"
              fontFamily="JetBrains Mono" fontSize="10" fontWeight="600" fill="#14120F" letterSpacing="2">
          24 / 25
        </text>
      </svg>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="44" height="56" viewBox="0 0 44 56" fill="none">
      <path d="M22 2 C 33 2 42 11 42 22 C 42 36 22 54 22 54 C 22 54 2 36 2 22 C 2 11 11 2 22 2 Z"
            fill="var(--red)" stroke="#14120F" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="22" cy="22" r="7" fill="#F5EFE4" stroke="#14120F" strokeWidth="2.5"/>
    </svg>
  );
}

function ShippieRocket() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M12 52 L24 40 M14 50 L18 54 M16 48 L20 52"
            stroke="var(--red)" strokeWidth="3" strokeLinecap="round"/>
      <path d="M24 40 L46 18 L52 12 L54 10 L52 16 L46 22 L30 38 Z"
            fill="var(--red)" stroke="#14120F" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="40" cy="24" r="4" fill="#F5EFE4" stroke="#14120F" strokeWidth="2"/>
      <path d="M30 38 L 36 44 M 26 34 L 20 40"
            stroke="var(--red)" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

Object.assign(window, { ShareCard });
