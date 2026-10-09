// Estilos da proposta MedCode (A4). Edite as cores em :root para ajustar a identidade visual.
export const ESTILOS = `
  @page { size: A4; margin: 0; }
  :root{
    --ink:#07040f; --ink-2:#120c22; --ink-3:#1c1333;
    --violet:#7c3aed; --violet-2:#8b5cf6; --lilac:#c4b5fd; --cyan:#22d3ee;
    --paper:#fbfaff; --text:#17131f; --muted:#6b6478; --line:#e7e3f0; --soft:#f3f0fb;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#2a2438}
  body{font-family:"Poppins",sans-serif;color:var(--text);-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:9.6pt;line-height:1.6}
  .page{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--paper);page-break-after:always;margin:0 auto}
  .page:last-child{page-break-after:auto}
  @media screen{.page{margin:24px auto;box-shadow:0 20px 60px rgba(0,0,0,.4)}}
  .serif{font-family:"Lora",serif;font-style:italic;font-weight:400}
  .grad{background:linear-gradient(90deg,var(--lilac),var(--violet-2) 55%,var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent}

  /* ---------- logo ---------- */
  .logo{display:flex;align-items:center;gap:10px}
  .logo .mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--violet),#4c1d95);display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px;letter-spacing:-.5px;box-shadow:0 0 0 1px rgba(255,255,255,.12) inset}
  .logo .name{font-weight:600;font-size:15px;letter-spacing:-.2px;line-height:1.1}
  .logo .name small{display:block;font-weight:400;font-size:8.5px;letter-spacing:2.4px;text-transform:uppercase;opacity:.6}

  /* ---------- dark pages ---------- */
  .dark{background:var(--ink);color:#ece8f7}
  .dark .glow{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55}
  .dark .grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:14mm 14mm;mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%)}

  /* cover */
  .cover .inner{position:absolute;inset:18mm 18mm 16mm;display:flex;flex-direction:column}
  .cover .top{display:flex;justify-content:space-between;align-items:center}
  .pill{font-size:8px;letter-spacing:2px;text-transform:uppercase;border:1px solid rgba(196,181,253,.35);color:var(--lilac);padding:6px 12px;border-radius:99px}
  .cover .hero{margin-top:auto;margin-bottom:auto;padding-top:20mm}
  .cover .eyebrow{font-size:9px;letter-spacing:3.5px;text-transform:uppercase;color:var(--lilac);margin-bottom:8mm;display:flex;align-items:center;gap:10px}
  .cover .eyebrow:before{content:"";width:28px;height:1px;background:var(--lilac)}
  .cover h1{font-size:46px;line-height:1.05;font-weight:600;letter-spacing:-1.5px}
  .cover h1 .serif{font-weight:400;letter-spacing:-.5px;background:none;color:var(--lilac)}
  .cover .lead{margin-top:8mm;max-width:118mm;font-size:11pt;color:#b7afcc;font-weight:300}
  .cover .meta{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.1);padding-top:7mm;gap:6mm}
  .cover .meta span{display:block;font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:#8a82a3;margin-bottom:3px}
  .cover .meta b{font-weight:500;font-size:10pt;color:#fff}

  /* ---------- light pages ---------- */
  .light .head{position:absolute;top:0;left:0;right:0;height:22mm;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
  .light .head .logo .mark{width:26px;height:26px;font-size:10px;border-radius:7px}
  .light .head .logo .name{font-size:12px}
  .light .head .ref{font-size:8px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}
  .light .foot{position:absolute;bottom:0;left:0;right:0;height:14mm;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5px;color:var(--muted);letter-spacing:.4px}
  .light .foot .n{font-weight:600;color:var(--text)}
  .light .body{position:absolute;top:30mm;left:18mm;right:18mm;bottom:20mm}

  .sec-num{font-size:8.5px;letter-spacing:3px;color:var(--violet);font-weight:600;text-transform:uppercase;margin-bottom:3mm;display:flex;align-items:center;gap:8px}
  .sec-num:after{content:"";flex:0 0 26px;height:1px;background:var(--violet)}
  h2{font-size:25px;line-height:1.15;font-weight:600;letter-spacing:-.6px;margin-bottom:5mm}
  h2 .serif{color:var(--violet)}
  h3{font-size:11.5pt;font-weight:600;letter-spacing:-.2px}
  p.muted{color:var(--muted)}
  .kicker{font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500}

  /* letter */
  .letter{display:grid;grid-template-columns:1fr 58mm;gap:10mm}
  .letter p+p{margin-top:3.2mm}
  .sig{margin-top:6mm;display:flex;align-items:center;gap:10px}
  .sig .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--violet),var(--cyan));display:grid;place-items:center;color:#fff;font-weight:600;font-size:13px}
  .sig b{display:block;font-weight:600;font-size:10pt}
  .sig span{font-size:8.5pt;color:var(--muted)}
  .aside-card{background:var(--ink);color:#e7e2f5;border-radius:14px;padding:7mm 6mm;position:relative;overflow:hidden}
  .aside-card:before{content:"";position:absolute;width:140px;height:140px;border-radius:50%;background:var(--violet);filter:blur(55px);opacity:.55;top:-50px;right:-50px}
  .aside-card .row{position:relative;padding:3.2mm 0;border-bottom:1px solid rgba(255,255,255,.08)}
  .aside-card .row:last-child{border:0;padding-bottom:0}
  .aside-card .row b{display:block;font-size:17px;font-weight:600;color:#fff;line-height:1.2}
  .aside-card .row span{font-size:8pt;color:#a9a0c2}

  .context{margin-top:9mm;display:grid;grid-template-columns:1fr 1fr;gap:6mm}
  .box{border:1px solid var(--line);border-radius:12px;padding:5.5mm 6mm;background:#fff}
  .box h3{margin-bottom:3mm;display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--violet);display:inline-block}
  .dot.c{background:var(--cyan)}
  ul.clean{list-style:none}
  ul.clean li{position:relative;padding-left:15px;margin:1.6mm 0}
  ul.clean li:before{content:"";position:absolute;left:0;top:.62em;width:6px;height:6px;border-radius:2px;background:var(--lilac)}
  ul.check li:before{content:"✓";background:none;color:var(--violet);font-weight:700;top:0;width:auto;height:auto;font-size:9pt}
  ul.x li:before{content:"—";background:none;color:#b3abc4;top:0;width:auto;height:auto}

  /* solution */
  .svc{display:grid;grid-template-columns:44mm 1fr;gap:7mm;padding:6mm 0;border-top:1px solid var(--line)}
  .svc:last-of-type{border-bottom:1px solid var(--line)}
  .svc .tag{font-size:30px;font-weight:600;color:transparent;-webkit-text-stroke:1px var(--violet-2);line-height:1;margin-bottom:3mm}
  .svc .lbl{font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:var(--violet);font-weight:600;margin-top:2mm}
  .svc .desc{color:var(--muted);margin:1.5mm 0 3mm}
  .svc ul{display:grid;grid-template-columns:1fr 1fr;column-gap:6mm}
  .svc ul li{margin:1mm 0;font-size:9pt}

  /* investment */
  table.inv{width:100%;border-collapse:collapse;margin-top:2mm}
  table.inv th{text-align:left;font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500;padding:0 0 3mm;border-bottom:1.5px solid var(--text)}
  table.inv th:last-child,table.inv td:last-child{text-align:right}
  table.inv td{padding:4.2mm 0;border-bottom:1px solid var(--line);vertical-align:top}
  table.inv td b{font-weight:600;display:block}
  table.inv td small{color:var(--muted);font-size:8.3pt}
  table.inv td.v{font-weight:500;white-space:nowrap;font-size:10.5pt}
  table.inv td.q{color:var(--muted);width:22mm}
  .totals{display:flex;justify-content:flex-end;margin-top:4mm}
  .totals .t{width:92mm}
  .totals .l{display:flex;justify-content:space-between;padding:1.6mm 0;color:var(--muted)}
  .totals .l.disc{color:#0e9f6e}
  .total-card{margin-top:3mm;background:var(--ink);color:#fff;border-radius:14px;padding:5.5mm 6mm;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden}
  .total-card:after{content:"";position:absolute;right:-30px;top:-40px;width:130px;height:130px;background:var(--violet);filter:blur(50px);opacity:.6;border-radius:50%}
  .total-card span{font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:var(--lilac);position:relative;z-index:1}
  .total-card b{font-size:25px;font-weight:600;letter-spacing:-.6px;position:relative;z-index:1}
  .pay{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:10mm}
  .pay .opt{border:1px solid var(--line);border-radius:12px;padding:4.5mm 5mm;background:#fff}
  .pay .opt.hl{border-color:var(--violet-2);background:var(--soft)}
  .pay .opt .kicker{color:var(--violet)}
  .pay .opt b{display:block;font-size:13.5px;font-weight:600;margin:1.5mm 0 .5mm}
  .pay .opt p{font-size:8.3pt;color:var(--muted);line-height:1.45}
  .notes{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:8mm}
  .note{font-size:8.5pt;padding:4.5mm 5mm;border-radius:12px;background:var(--soft)}
  .note h3{font-size:9.5pt;margin-bottom:1.5mm}
  .note p{color:var(--muted);line-height:1.5}
  .note .price{font-weight:600;color:var(--text)}
  .obs{margin-top:6mm;font-size:7.8pt;line-height:1.5;color:var(--muted);white-space:pre-line}
  .obs b{font-weight:600;color:var(--text);margin-right:1.5mm}

  /* timeline */
  .tl{position:relative;margin:4mm 0 0}
  .tl-row{display:grid;grid-template-columns:46mm 1fr;align-items:center;margin:2.8mm 0}
  .tl-row .lab b{display:block;font-size:9.5pt;font-weight:600}
  .tl-row .lab span{font-size:8pt;color:var(--muted)}
  .track{position:relative;height:9mm;background:repeating-linear-gradient(90deg,var(--soft) 0 calc(20% - 1px),var(--line) calc(20% - 1px) 20%);border-radius:6px}
  .bar{position:absolute;top:1.8mm;bottom:1.8mm;border-radius:99px;background:linear-gradient(90deg,var(--violet),var(--violet-2));box-shadow:0 3px 10px rgba(124,58,237,.3)}
  .bar.c{background:linear-gradient(90deg,var(--violet-2),var(--cyan))}
  .weeks{display:grid;grid-template-columns:46mm 1fr}
  .weeks div{display:grid;grid-template-columns:repeat(5,1fr);font-size:7.5px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase}
  .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:9mm}
  .step{padding-top:4mm;border-top:2px solid var(--text)}
  .step .k{font-size:8px;letter-spacing:2px;color:var(--violet);font-weight:600}
  .step b{display:block;margin:1.2mm 0;font-size:10pt;font-weight:600}
  .step p{font-size:8.4pt;color:var(--muted);line-height:1.5}
  .incl{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:9mm}

  /* closing */
  .closing .inner{position:absolute;inset:18mm;display:flex;flex-direction:column}
  .closing h2{color:#fff;font-size:34px;letter-spacing:-1px;margin-top:14mm}
  .closing h2 .serif{color:var(--lilac)}
  .next{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:8mm}
  .next > div{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:5mm;background:rgba(255,255,255,.03)}
  .next .n{font-size:22px;font-weight:600;color:transparent;-webkit-text-stroke:1px var(--lilac)}
  .next b{display:block;color:#fff;font-weight:500;margin:1mm 0}
  .next p{font-size:8.4pt;color:#a79fbf;line-height:1.5}
  .accept{margin-top:10mm;background:#fff;color:var(--text);border-radius:16px;padding:7mm 8mm}
  .accept h3{margin-bottom:1mm}
  .accept p{font-size:8.5pt;color:var(--muted)}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:13mm}
  .signs div{border-top:1px solid var(--text);padding-top:2mm;font-size:8.5pt}
  .signs span{display:block;color:var(--muted);font-size:7.8pt}
  .contact{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,.1);padding-top:6mm}
  .contact .c{display:grid;grid-template-columns:auto auto;gap:1.5mm 9mm;font-size:8.6pt}
  .contact .c span{color:#8a82a3;font-size:7.5px;letter-spacing:1.8px;text-transform:uppercase;display:block}
  .contact .c b{font-weight:500;color:#fff}
  .legal{font-size:7.2px;color:#6f6889;letter-spacing:.4px;text-align:right;line-height:1.6}
`;
