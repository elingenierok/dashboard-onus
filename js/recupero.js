// ====================================================
// MÓDULO AUTÓNOMO DE RECUPERO DE EQUIPOS
// ====================================================

const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

// Palabras clave para considerar tecnología VIP (Dual Band / CATV)
const KEYWORDS_VIP_REC = [
  'F6201B', 'F6600P', 'F670L', 'EG8147X6', 'F6600R', 
  'AX3000', 'DUAL BAND', 'CATV', 'WIFI6', 'DUAL_BAND'
];

function esModeloVIPRec(desc) {
  const d = (desc || '').toUpperCase();
  return KEYWORDS_VIP_REC.some(k => d.includes(k));
}

let recuperoChartInstance = null;

async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando recupero...';
    tag.className = 'file-tag no';
  }

  try {
    const [resRec, resPrecios] = await Promise.all([
      supabaseRecupero.from('registro_recupero').select('*'),
      supabaseRecupero.from('precios_catalogos').select('codigo, descripcion, precio_final')
    ]);

    if (resRec.error) throw resRec.error;

    const dataRec = resRec.data || [];
    const preciosMap = new Map();

    (resPrecios.data || []).forEach(p => {
      const val = parseFloat(p.precio_final) || 0;
      if (p.codigo) preciosMap.set(p.codigo.trim().toUpperCase(), val);
      if (p.descripcion) preciosMap.set(p.descripcion.trim().toUpperCase(), val);
    });

    if (tag) {
      tag.textContent = `Supabase: ✅ ${dataRec.length} Registros`;
      tag.className = 'file-tag ok';
    }

    procesarYRenderizarRecupero(dataRec, preciosMap);
  } catch (err) {
    console.error('Error en módulo Recupero:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error de lectura';
      tag.className = 'file-tag no';
    }
  }
}

function procesarYRenderizarRecupero(data, preciosMap) {
  let totalRecibidos = 0;
  let directoDescarteObs = 0; // Tecnología obsoleta (no va a prueba)
  let enCirculacionVIP = 0;   // VIP recuperadas tras prueba
  let fueraCirculacionVIP = 0; // VIP descartadas tras prueba
  let capitalRevalorizado = 0;

  const desgloseOperativo = {};

  data.forEach(row => {
    const cant = parseInt(row.cantidad || row.stock_total || row.stock || 1, 10) || 1;
    const desc = row.descripcion || row.modelo || row.equipo || '';
    const descUpper = desc.trim().toUpperCase();
    const estado = (row.estado || row.condicion || '').trim().toUpperCase();
    const esVIP = esModeloVIPRec(descUpper);

    totalRecibidos += cant;

    const precioUnit = preciosMap.get(row.codigo ? row.codigo.trim().toUpperCase() : '') || 
                       preciosMap.get(descUpper) || 0;

    const esRecuperado = ['RECUPERADO', 'BUENO', 'EN CIRCULACION', 'CIRCULACION', 'OK', 'DISPONIBLE'].some(e => estado.includes(e));
    const esDescarte = ['DESCARTE', 'DESECHADO', 'FUERA DE CIRCULACION', 'FALLADO', 'DEFECTUOSO', 'ROTO', 'MALO', 'OBSOLETO'].some(e => estado.includes(e));

    if (!esVIP && esDescarte) {
      // 1. Tecnología vieja -> Directo a descarte sin probar
      directoDescarteObs += cant;
    } else if (esVIP && esRecuperado) {
      // 2. VIP Recuperado -> Pasa a circulación
      enCirculacionVIP += cant;
      capitalRevalorizado += cant * precioUnit;
    } else if (esVIP && esDescarte) {
      // 3. VIP Descartado -> Fuera de circulación tras prueba
      fueraCirculacionVIP += cant;
    } else if (esRecuperado) {
      enCirculacionVIP += cant;
      capitalRevalorizado += cant * precioUnit;
    } else {
      directoDescarteObs += cant;
    }

    // Acumular desglose por modelo
    if (!desgloseOperativo[descUpper]) {
      desgloseOperativo[descUpper] = { desc: desc, vip: esVIP, circ: 0, descVIP: 0, descObs: 0 };
    }
    if (esVIP && esRecuperado) desgloseOperativo[descUpper].circ += cant;
    else if (esVIP && esDescarte) desgloseOperativo[descUpper].descVIP += cant;
    else if (!esVIP && esDescarte) desgloseOperativo[descUpper].descObs += cant;
  });

  // Equipos VIP sometidos a laboratorio
  const probadosVIP = enCirculacionVIP + fueraCirculacionVIP;
  const pctReaprovechamiento = probadosVIP > 0 ? ((enCirculacionVIP / probadosVIP) * 100).toFixed(1) : 0;
  const valorPromedioRecuperado = enCirculacionVIP > 0 ? Math.round(capitalRevalorizado / enCirculacionVIP) : 0;

  renderRecuperoEstrategico(enCirculacionVIP, fueraCirculacionVIP, probadosVIP, capitalRevalorizado, pctReaprovechamiento);
  renderRecuperoTactico(totalRecibidos, directoDescarteObs, enCirculacionVIP, fueraCirculacionVIP, pctReaprovechamiento, valorPromedioRecuperado, capitalRevalorizado);
  renderRecuperoOperativo(desgloseOperativo);
}

// RENDER: RESUMEN Y GRÁFICO ESTRATÉGICO
function renderRecuperoEstrategico(circ, descVIP, probados, capital, pct) {
  document.getElementById('rec-val-circ').textContent = `${circ.toLocaleString('es-AR')} un.`;
  document.getElementById('rec-pct-circ').textContent = `(${pct}%)`;

  const pctDesc = probados > 0 ? (100 - parseFloat(pct)).toFixed(1) : 0;
  document.getElementById('rec-val-desc').textContent = `${descVIP.toLocaleString('es-AR')} un.`;
  document.getElementById('rec-pct-desc').textContent = `(${pctDesc}%)`;

  document.getElementById('rec-val-total-un').textContent = `${probados.toLocaleString('es-AR')} un. VIP`;
  document.getElementById('rec-val-dinero').textContent = `$ ${Math.round(capital).toLocaleString('es-AR')} USD`;

  const chartData = {
    labels: ['Evaluación Laboratorio VIP'],
    datasets: [
      {
        label: '🟢 En Circulación (Recuperadas)',
        data: [circ],
        backgroundColor: '#4ade80',
        borderRadius: 4
      },
      {
        label: '🔴 Fuera de Circulación (Descarte VIP)',
        data: [descVIP],
        backgroundColor: '#f87171',
        borderRadius: 4
      }
    ]
  };

  const canvas = document.getElementById('recuperoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

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
          legend: { position: 'top', labels: { color: '#f8fafc', font: { weight: 'bold' } } },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#38bdf8',
            bodyColor: '#f8fafc',
            borderColor: '#334155',
            borderWidth: 1
          }
        }
      }
    });
  }
}

// RENDER: TARJETAS TÁCTICAS
function renderRecuperoTactico(totalRecibidos, directoDescarte, enCirc, fueraCirc, pctReap, valPromedio, capitalTotal) {
  const container = document.getElementById('grid-recupero-cards');
  if (!container) return;

  container.innerHTML = `
    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #334155;">
      <div class="title" style="color:#94a3b8;">📥 1. EQUIPOS RECIBIDOS</div>
      <div class="value" style="color:#f8fafc;">${totalRecibidos.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext" style="color:#cbd5e1;">Ingreso Bruto Laboratorio</div>
    </div>

    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #eab308;">
      <div class="title" style="color:#fde047;">📼 DIRECTO A DESCARTE</div>
      <div class="value" style="color:#fde047;">${directoDescarte.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext" style="color:#cbd5e1;">Tecnología Obsoleta (Sin Prueba)</div>
    </div>

    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #16a34a;">
      <div class="title" style="color:#4ade80;">♻️ 2. EN CIRCULACIÓN</div>
      <div class="value" style="color:#4ade80;">${enCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext" style="color:#cbd5e1;">Equipos VIP Recuperados</div>
    </div>

    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #dc2626;">
      <div class="title" style="color:#f87171;">🗑️ 3. FUERA DE CIRCULACIÓN</div>
      <div class="value" style="color:#f87171;">${fueraCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext" style="color:#cbd5e1;">Descarte VIP Tras Prueba</div>
    </div>

    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #0284c7;">
      <div class="title" style="color:#38bdf8;">📈 4. % REAPROVECHAMIENTO</div>
      <div class="value" style="color:#38bdf8;">${pctReap}%</div>
      <div class="subtext" style="color:#cbd5e1;">Efectividad sobre VIP Probadas</div>
    </div>

    <div class="kpi-card-dark" style="background:#1e293b; border:1px solid #16a34a;">
      <div class="title" style="color:#4ade80;">💵 5. VALOR PROMEDIO / TOTAL</div>
      <div class="value" style="color:#4ade80;">$ ${valPromedio} <span style="font-size:0.9rem;">USD/un</span></div>
      <div class="subtext" style="color:#cbd5e1;">Total: <strong>$ ${Math.round(capitalTotal).toLocaleString('es-AR')} USD</strong></div>
    </div>
  `;
}

// RENDER: TABLA OPERATIVA
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
        <td style="font-weight:600; color:#334155;">${item.desc}</td>
        <td style="text-align:center;">${item.vip ? '<span style="color:#0284c7; font-weight:700;">🔵 VIP</span>' : '<span style="color:#64748b;">⚙️ Obsoleto</span>'}</td>
        <td style="text-align:center; font-weight:700; color:#16a34a;">${item.circ} un.</td>
        <td style="text-align:center; font-weight:700; color:#dc2626;">${item.descVIP} un.</td>
        <td style="text-align:center; font-weight:700; color:#ca8a04;">${item.descObs} un.</td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
  cargarModuloRecupero();
});