// Logo MedCode (o mesmo da landing page contato.medcodedev.com), 100% vetorial:
// ícone </> no quadrado em degradê roxo→azul + "MedCode" em Manrope ExtraBold
// convertido em curvas, para não depender de fonte nem de imagem no PDF.
const MED = 'M7 80V8H19.2L43 55.8L66.8 8H79V80H66.3V37L45.4 80H40.6L19.7 37V80ZM116.1 81.5Q107.8 81.5 101.5 77.9Q95.2 74.3 91.6 68.1Q88 61.8 88 53.7Q88 44.9 91.5 38.3Q95 31.8 101.2 28.1Q107.3 24.5 115.3 24.5Q123.8 24.5 129.8 28.5Q135.7 32.5 138.6 39.8Q141.4 47 140.6 56.8H102.7Q103.3 61.6 105.7 64.7Q109 68.8 115.3 68.8Q119.3 68.8 122.2 67Q125 65.3 126.5 62L140.1 65.9Q137.1 73.3 130.5 77.4Q123.9 81.5 116.1 81.5ZM126.8 46.7Q126.2 42.3 124.5 39.9Q121.8 36.3 115.9 36.3Q109 36.3 105.7 40.5Q103.8 42.9 103 46.7ZM171.7 81.5Q164.2 81.5 158.7 77.8Q153.1 74 149.9 67.5Q146.8 61.1 146.8 53Q146.8 44.8 150 38.3Q153.2 31.9 158.9 28.2Q164.7 24.5 172.4 24.5Q179.6 24.5 184.6 27.8V8H198.3V80H186.3V76.9Q185.8 77.3 185.2 77.8Q179.8 81.5 171.7 81.5ZM173.9 69.4Q178.5 69.4 181.2 67.3Q183.9 65.3 185.1 61.6Q186.3 57.9 186.3 53Q186.3 48.1 185.1 44.4Q183.9 40.7 181.3 38.6Q178.7 36.6 174.4 36.6Q169.9 36.6 166.9 38.8Q164 41 162.6 44.8Q161.2 48.5 161.2 53Q161.2 57.5 162.6 61.3Q163.9 65 166.7 67.2Q169.5 69.4 173.9 69.4Z';
const CODE = 'M241.2 81.5Q230.4 81.5 222.6 76.8Q214.8 72.1 210.5 63.6Q206.3 55.2 206.3 44Q206.3 32.8 210.5 24.3Q214.8 15.9 222.6 11.2Q230.4 6.5 241.2 6.5Q253.6 6.5 262 12.6Q270.5 18.8 273.9 29.3L260.2 33.1Q258.2 26.5 253.5 22.9Q248.7 19.3 241.2 19.3Q234.4 19.3 229.8 22.3Q225.2 25.4 222.9 30.9Q220.6 36.5 220.6 44Q220.6 51.5 222.9 57Q225.2 62.6 229.8 65.7Q234.4 68.7 241.2 68.7Q248.7 68.7 253.5 65Q258.2 61.4 260.2 54.9L273.9 58.7Q270.5 69.2 262 75.3Q253.6 81.5 241.2 81.5ZM307.2 81.5Q299.1 81.5 292.9 77.8Q286.8 74.2 283.3 67.8Q279.9 61.3 279.9 53Q279.9 44.5 283.4 38.1Q286.9 31.7 293.1 28.1Q299.2 24.5 307.2 24.5Q315.4 24.5 321.5 28.1Q327.7 31.8 331.2 38.2Q334.6 44.6 334.6 53Q334.6 61.4 331.1 67.8Q327.7 74.2 321.5 77.9Q315.3 81.5 307.2 81.5ZM307.2 68.8Q313.8 68.8 317 64.4Q320.2 60 320.2 53Q320.2 45.8 316.9 41.5Q313.7 37.2 307.2 37.2Q302.8 37.2 299.9 39.2Q297.1 41.2 295.7 44.8Q294.3 48.3 294.3 53Q294.3 60.2 297.6 64.5Q300.9 68.8 307.2 68.8ZM365.5 81.5Q358.1 81.5 352.5 77.8Q346.9 74 343.7 67.5Q340.6 61.1 340.6 53Q340.6 44.8 343.8 38.3Q347 31.9 352.7 28.2Q358.5 24.5 366.2 24.5Q373.4 24.5 378.4 27.8V8H392.1V80H380.1V76.9Q379.6 77.3 379 77.8Q373.6 81.5 365.5 81.5ZM367.7 69.4Q372.2 69.4 375 67.3Q377.7 65.3 378.9 61.6Q380.1 57.9 380.1 53Q380.1 48.1 378.9 44.4Q377.7 40.7 375.1 38.6Q372.5 36.6 368.2 36.6Q363.7 36.6 360.7 38.8Q357.8 41 356.4 44.8Q355 48.5 355 53Q355 57.5 356.4 61.3Q357.7 65 360.5 67.2Q363.3 69.4 367.7 69.4ZM429.2 81.5Q420.9 81.5 414.6 77.9Q408.2 74.3 404.7 68.1Q401.1 61.8 401.1 53.7Q401.1 44.9 404.6 38.3Q408.1 31.8 414.2 28.1Q420.4 24.5 428.4 24.5Q436.9 24.5 442.9 28.5Q448.8 32.5 451.6 39.8Q454.5 47 453.7 56.8H415.8Q416.4 61.6 418.8 64.7Q422.1 68.8 428.4 68.8Q432.4 68.8 435.2 67Q438.1 65.3 439.6 62L453.2 65.9Q450.2 73.3 443.6 77.4Q437 81.5 429.2 81.5ZM439.9 46.7Q439.3 42.3 437.6 39.9Q435 36.3 429 36.3Q422.1 36.3 418.8 40.5Q416.9 42.9 416.1 46.7Z';
const W = 455.9; // largura do texto no viewBox (altura 100)
const CX = 203.3; // onde começa "Code"

// Os mesmos desenhos servem o logo do sistema (src/components/acesso/LogoMedCode.jsx).
export const LOGO_PATHS = { MED, CODE, W, CX };

let seq = 0;

/**
 * @param {{ escuro?: boolean, altura?: number }} [op]
 *   escuro: true para fundo escuro ("Med" branco), false para fundo claro ("Med" quase preto)
 *   altura: altura do ícone em px (o texto acompanha)
 */
export function logoMedCode({ escuro = true, altura = 46 } = {}) {
  const id = `mc${++seq}`;
  const ico = altura;
  const txtH = Math.round(altura * 0.65);
  const txtW = Math.round((txtH * W) / 100);
  const raio = Math.round(altura * 0.27);
  const med = escuro ? '#ffffff' : '#07040f';
  const c1 = escuro ? '#a78bfa' : '#8b5cf6';
  const sombra = escuro ? 'box-shadow:0 8px 20px -10px rgba(139,92,246,.9);' : '';
  return `<div class="logo" style="display:flex;align-items:center;gap:${Math.round(altura * 0.26)}px">`
    + `<span style="display:grid;place-items:center;width:${ico}px;height:${ico}px;border-radius:${raio}px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);${sombra}flex:none">`
    + `<svg width="${Math.round(ico * 0.59)}" height="${Math.round(ico * 0.59)}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.2 6.5l-2.4 11"/></svg></span>`
    + `<svg width="${txtW}" height="${txtH}" viewBox="0 0 ${W} 100" role="img" aria-label="MedCode">`
    + `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${CX}" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>`
    + `<path fill="${med}" d="${MED}"/><path fill="url(#${id})" d="${CODE}"/></svg></div>`;
}
