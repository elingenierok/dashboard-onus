// ====================================================
// MÓDULO AUTÓNOMO DE RECUPERO DE EQUIPOS (DASHBOARD)
// ====================================================

const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

// Elimina tildes, espacios extra y convierte a mayúsculas
function normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Lista Oficial Estricta de Equipos VIP (Incluye variantes con y sin CATV/Espacios)
const LISTA_VIP_EXACTA = [
  "ONU ZTE F6201B V9.3 WIFI6 AX3000",
  "ONU ZTE F6201B V9.3 WIFI6 AX3000(USADO)",
  "ONU ZTE F6201B V9.3 WIFI6 AX3000 (USADO)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS) (USADA)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)(USADA)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI (USADA)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI(USADA)",
  "ONU HUAWEI ECHOLIFE EG8147X6",
  "ONU HUAWEI ECHOLIFE EG8147X6(USADO)",
  "ONU HUAWEI ECHOLIFE EG8147X6 (USADO)",
  "ONU HUAWEI ECHOLIFE EG8147X6(CATV)",
  "ONU HUAWEI ECHOLIFE EG8147X6 (CATV)",
  "ONU HUAWEI ECHOLIFE EG8147X6(CATV)(USADO)",
  "ONU HUAWEI ECHOLIFE EG8147X6 (CATV) (USADO)",
  "ONU HUAWEI ECHOLIFE EG8147X6(CATV) (USADO)",
  "ONU HUAWEI ECHOLIFE EG8147X6 (CATV)(USADO)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV)(USADA)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV) (USADA)"
].map(normalizar);

function esVIP(modelo) {
  const m = normalizar(modelo);
  return LISTA_VIP_EXACTA.some(vip => m.includes(vip) || vip.includes(m));
}

let recuperoChartInstance = null;

async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando...';
    tag.className = 'file-tag no';
  }

  try {
    const [resRec, resPrecios] = await Promise.all([
      supabaseRecupero.from('registro_recupero').select('*'),
      supabaseRecupero.from('precios_catalogos').select('*')
    ]);

    if (resRec.error) throw resRec.error;

    const dataRec = resRec.data || [];
    const preciosMap = new Map();

    (resPrecios.data || []).forEach(p => {
      const precio = parseFloat(p.precio_final) || parseFloat(p.precio_usd) || parseFloat(p.precio) || 0;
      if (p.codigo) preciosMap.set(normalizar(p.codigo), precio);
      if (p.descripcion) preciosMap.set(normalizar(p.descripcion), precio);
    });

    if (tag) {
      tag.textContent = `Supabase: ✅ ${dataRec.length} Registros`;
      tag.className = 'file-tag ok';
    }

    procesarYRenderizarRecupero(dataRec, preciosMap);
  } catch (err) {
    console.error('Error al cargar módulo Recupero:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error';
      tag.className = 'file-tag no';
    }
  }
}

function obtenerPrecioEstimado(descNorm, preciosMap) {
  if (preciosMap.has(descNorm)) return preciosMap.get(descNorm);
  
  for (let [key, val] of preciosMap.entries()) {
    if (descNorm.includes(key) || key.includes(descNorm)) return val;
  }
  return 0;
}

function procesarYRenderizarRecupero(data, preciosMap) {
  let totalRecibidos = 0;
  let directoDescarteObs = 0;
  let enCirculacionVIP = 0;
  let fueraCirculacionVIP = 0;
  let capitalRevalorizado = 0;

  const desgloseOperativo = {};

  data.forEach(row => {
    const cant = parseInt(row.cantidad || 1, 10) || 1;
    const desc = row.descripcion || row.modelo || row.equipo || 'DESCONOCIDO';
    const descNorm = normalizar(desc);
    
    const condicion = normalizar(row.condicion || row.estado_final || row.estado || row.veredicto || '');
    
    const esEquipoVIP = esVIP(descNorm);
    totalRecibidos += cant;

    const precioUnit = obtenerPrecioEstimado(descNorm, preciosMap);

    if (!desgloseOperativo[descNorm]) {
      desgloseOperativo[descNorm] = { desc: desc, vip: esEquipoVIP, circ: 0, descVIP: 0, descObs: 0 };
    }

    const esAprobado = ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO'].some(e => condicion.includes(e));
    const esRechazado = ['DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => condicion.includes(e));

    if (!esEquipoVIP) {
      directoDescarteObs += cant;
      desgloseOperativo[descNorm].descObs += cant;
    } else if (esAprobado) {
      enCirculacionVIP += cant;
      capitalRevalorizado += (cant * precioUnit);
      desgloseOperativo[descNorm].circ += cant;
    } else if (esRechazado) {
      fueraCirculacionVIP += cant;
      desgloseOperativo[descNorm].descVIP += cant;
    }
  });

  const probadosVIP = enCirculacionVIP + fueraCirculacionVIP;
  const pctReaprovechamiento = probadosVIP > 0 ? ((enCirculacionVIP / probadosVIP) * 100).toFixed(1) : "0.0";
  const valorPromedioRecuperado = enCirculacionVIP > 0 ? Math.round(capitalRevalorizado / enCirculacionVIP) : 0;

  renderRecuperoEstrategico(enCirculacionVIP, fueraCirculacionVIP, probadosVIP, capitalRevalorizado, pctReaprovechamiento);
  renderRecuperoTactico(totalRecibidos, directoDescarteObs, enCirculacionVIP, fueraCirculacionVIP, pctReaprovechamiento, valorPromedioRecuperado, capitalRevalorizado);
  renderRecuperoOperativo(desgloseOperativo);
}

function renderRecuperoEstrategico(circ, descVIP, probados, capital, pct) {
  const elCirc = document.getElementById('rec-val-circ');
  const elPctCirc = document.getElementById('rec-pct-circ');
  const elDesc = document.getElementById('rec-val-desc');
  const elPctDesc = document.getElementById('rec-pct-desc');
  const elTotal = document.getElementById('rec-val-total-un');
  const elDinero = document.getElementById('rec-val-dinero');

  if (elCirc) elCirc.textContent = `${circ.toLocaleString('es-AR')} un.`;
  if (elPctCirc) elPctCirc.textContent = `(${pct}%)`;

  const pctDesc = probados > 0 ? (100 - parseFloat(pct)).toFixed(1) : "0.0";
  if (elDesc) elDesc.textContent = `${descVIP.toLocaleString('es-AR')} un.`;
  if (elPctDesc) elPctDesc.textContent = `(${pctDesc}%)`;

  if (elTotal) elTotal.textContent = `${probados.toLocaleString('es-AR')} un. VIP`;
  if (elDinero) elDinero.textContent = `$ ${Math.round(capital).toLocaleString('es-AR')} USD`;

  const canvas = document.getElementById('recuperoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const chartData = {
    labels: ['Laboratorio VIP'],
    datasets: [
      { label: '🟢 En Circulación (Recuperadas)', data: [circ], backgroundColor: '#4ade80', borderRadius: 4 },
      { label: '🔴 Fuera de Circulación (Descarte VIP)', data: [descVIP], backgroundColor: '#f87171', borderRadius: 4 }
    ]
  };

  if (recuperoChartInstance) {
    recuperoChartInstance.data = chartData;
    recuperoChartInstance.update();
  } else {
    recuperoChartInstance = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } },
          y: { stacked: true, display: false }
        },
        plugins: {
          legend: { position: 'top', labels: { color: '#f8fafc', font: { weight: 'bold' } } }
        }
      }
    });
  }
}

function renderRecuperoTactico(totalRecibidos, directoDescarte, enCirc, fueraCirc, pctReap, valPromedio, capitalTotal) {
  const container = document.getElementById('grid-recupero-cards');
  if (!container) return;

  container.innerHTML = `
    <div class="kpi-card-dark">
      <div class="title">📥 1. EQUIPOS RECIBIDOS</div>
      <div class="value">${totalRecibidos.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Ingreso Bruto Laboratorio</div>
    </div>
    <div class="kpi-card-dark" style="border-color:#eab308;">
      <div class="title" style="color:#fde047;">📼 DIRECTO A DESCARTE</div>
      <div class="value" style="color:#fde047;">${directoDescarte.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Tecnología Obsoleta (Sin Prueba)</div>
    </div>
    <div class="kpi-card-dark" style="border-color:#16a34a;">
      <div class="title" style="color:#4ade80;">♻️ 2. EN CIRCULACIÓN</div>
      <div class="value" style="color:#4ade80;">${enCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Equipos VIP Recuperados</div>
    </div>
    <div class="kpi-card-dark" style="border-color:#dc2626;">
      <div class="title" style="color:#f87171;">🗑️ 3. FUERA DE CIRCULACIÓN</div>
      <div class="value" style="color:#f87171;">${fueraCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Descarte VIP Tras Prueba</div>
    </div>
    <div class="kpi-card-dark" style="border-color:#0284c7;">
      <div class="title" style="color:#38bdf8;">📈 4. % REAPROVECHAMIENTO</div>
      <div class="value" style="color:#38bdf8;">${pctReap}%</div>
      <div class="subtext">Efectividad sobre VIP Probadas</div>
    </div>
    <div class="kpi-card-dark" style="border-color:#16a34a;">
      <div class="title" style="color:#4ade80;">💵 5. VALOR PROMEDIO / TOTAL</div>
      <div class="value" style="color:#4ade80;">$ ${valPromedio} <span style="font-size:0.9rem;">USD/un</span></div>
      <div class="subtext">Total: <strong>$ ${Math.round(capitalTotal).toLocaleString('es-AR')} USD</strong></div>
    </div>
  `;
}

function renderRecuperoOperativo(desglose) {
  const container = document.getElementById('tablaRecuperoOperativoWrapper');
  if (!container) return;

  let html = `<table class="tabla-auditoria">
    <thead>
      <tr>
        <th>Modelo / Descripción</th>
        <th style="text-align:center;">Categoría</th>
        <th style="text-align:center; color:#4ade80;">En Circulación</th>
        <th style="text-align:center; color:#f87171;">Descarte VIP</th>
        <th style="text-align:center; color:#fde047;">Directo Descarte (Obs)</th>
      </tr>
    </thead>
    <tbody>`;

  const entries = Object.values(desglose);
  if (entries.length === 0) {
    html += `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No hay registros de recupero.</td></tr>`;
  } else {
    entries.forEach(item => {
      html += `<tr>
        <td style="font-weight:600; color:#cbd5e1;">${item.desc}</td>
        <td style="text-align:center;">${item.vip ? '<span style="color:#0284c7; font-weight:700;">🔵 VIP</span>' : '<span style="color:#64748b;">⚙️ Obsoleto</span>'}</td>
        <td style="text-align:center; font-weight:700; color:#4ade80;">${item.circ} un.</td>
        <td style="text-align:center; font-weight:700; color:#f87171;">${item.descVIP} un.</td>
        <td style="text-align:center; font-weight:700; color:#fde047;">${item.descObs} un.</td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cargarModuloRecupero);
} else {
  cargarModuloRecupero();
}