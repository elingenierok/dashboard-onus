// ====================================================
// MÓDULO AUTÓNOMO: RECUPERO DE EQUIPOS (CONECTADO A SUPABASE)
// ====================================================

const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

let recuperoChart = null;

async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando...';
    tag.className = 'file-tag no';
  }

  try {
    const { data, error } = await supabaseRecupero
      .from('registro_recupero')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (tag) {
      tag.textContent = `Supabase: ✅ ${data ? data.length : 0} Registros`;
      tag.className = 'file-tag ok';
    }

    procesarYRenderizarRecupero(data || []);
  } catch (err) {
    console.error('Error al cargar datos de Recupero:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error';
      tag.className = 'file-tag no';
    }
    procesarYRenderizarRecupero([]);
  }
}

function procesarYRenderizarRecupero(datos) {
  let totalRecibidos = datos.length;
  let porRetiroDedicado = 0;
  let porTecnicos = 0;
  let enCirculacion = 0;
  let fueraCirculacion = 0;
  let sumaValorRecuperadoUSD = 0;

  const desgloseModelos = {};

  datos.forEach(row => {
    const origenNorm = (row.origen_tipo || '').toLowerCase();
    const estadoNorm = (row.estado_final || '').toLowerCase();
    const modelo = row.modelo || 'Modelo Sin Especificar';
    const val = parseFloat(row.valor_usd) || 0;

    if (!desgloseModelos[modelo]) {
      desgloseModelos[modelo] = { circulacion: 0, descarte: 0, total: 0 };
    }
    desgloseModelos[modelo].total++;

    if (origenNorm.includes('retiro') || origenNorm.includes('personal')) {
      porRetiroDedicado++;
    } else {
      porTecnicos++;
    }

    if (estadoNorm.includes('circulacion') || estadoNorm.includes('ok')) {
      enCirculacion++;
      sumaValorRecuperadoUSD += val;
      desgloseModelos[modelo].circulacion++;
    } else {
      fueraCirculacion++;
      desgloseModelos[modelo].descarte++;
    }
  });

  renderEstrategicoRecupero(totalRecibidos, enCirculacion, fueraCirculacion, sumaValorRecuperadoUSD);
  renderTacticoRecupero(totalRecibidos, porRetiroDedicado, porTecnicos, enCirculacion, fueraCirculacion, sumaValorRecuperadoUSD);
  renderOperativoRecupero(desgloseModelos);
}

// 1. RENDER ESTRATÉGICO
function renderEstrategicoRecupero(total, circulacion, descarte, valorUSD) {
  const pctCirc = total > 0 ? Math.round((circulacion / total) * 100) : 0;
  const pctDesc = total > 0 ? Math.round((descarte / total) * 100) : 0;

  document.getElementById('rec-val-circ').textContent = `${circulacion.toLocaleString('es-AR')} un.`;
  document.getElementById('rec-pct-circ').textContent = `(${pctCirc}%)`;

  document.getElementById('rec-val-desc').textContent = `${descarte.toLocaleString('es-AR')} un.`;
  document.getElementById('rec-pct-desc').textContent = `(${pctDesc}%)`;

  document.getElementById('rec-val-total-un').textContent = `${total.toLocaleString('es-AR')} un.`;
  document.getElementById('rec-val-dinero').textContent = `$ ${Math.round(valorUSD).toLocaleString('es-AR')} USD`;

  const chartData = {
    labels: ['Estado de Equipos Recibidos'],
    datasets: [
      { label: '🟢 Puestos en Circulación', data: [circulacion], backgroundColor: '#16a34a', borderRadius: { topLeft: 4, bottomLeft: 4 } },
      { label: '🔴 Fuera de Circulación (Descarte)', data: [descarte], backgroundColor: '#dc2626', borderRadius: { topRight: 4, bottomRight: 4 } }
    ]
  };

  if (recuperoChart) {
    recuperoChart.data = chartData;
    recuperoChart.update();
  } else {
    const ctx = document.getElementById('recuperoChart').getContext('2d');
    recuperoChart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
          tooltip: {
            backgroundColor: '#0f172a', titleColor: '#38bdf8', bodyColor: '#f8fafc', borderColor: '#334155', borderWidth: 1, padding: 12
          }
        },
        scales: {
          x: { stacked: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
          y: { stacked: true, display: false }
        }
      }
    });
  }
}

// 2. RENDER TÁCTICO
function renderTacticoRecupero(total, retiro, tecnicos, circulacion, descarte, valorUSD) {
  const pctReaprovechamiento = total > 0 ? Math.round((circulacion / total) * 100) : 0;
  const valorPromedio = circulacion > 0 ? Math.round(valorUSD / circulacion) : 0;

  document.getElementById('grid-recupero-cards').innerHTML = `
    <div class="kpi-card-dark" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#0284c7;">📥 1. EQUIPOS RECIBIDOS</div>
      <div class="value">${total.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#475569;">
        • Personal de Retiro: <strong>${retiro.toLocaleString('es-AR')} un.</strong><br>
        • Téc. Reclamos / Terceros: <strong>${tecnicos.toLocaleString('es-AR')} un.</strong>
      </div>
    </div>

    <div class="kpi-card-dark" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#16a34a;">♻️ 2. EN CIRCULACIÓN</div>
      <div class="value">${circulacion.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#15803d;">Limpios, probados y reingresados a stock</div>
    </div>

    <div class="kpi-card-dark" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#dc2626;">🗑️ 3. FUERA DE CIRCULACIÓN</div>
      <div class="value">${descarte.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#b91c1c;">Falla irreparable o tecnología obsoleta</div>
    </div>

    <div class="kpi-card-dark" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#475569;">📈 4. % REAPROVECHAMIENTO</div>
      <div class="value">${pctReaprovechamiento}%</div>
      <div class="subtext" style="color:#64748b;">Índice de efectividad de recupero</div>
    </div>

    <div class="kpi-card-dark" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#0284c7;">💵 5. VALOR PROMEDIO RECOPILADO</div>
      <div class="value">$ ${valorPromedio.toLocaleString('es-AR')} USD</div>
      <div class="subtext" style="color:#475569;">Ahorro total: <strong>$ ${Math.round(valorUSD).toLocaleString('es-AR')} USD</strong></div>
    </div>
  `;
}

// 3. RENDER OPERATIVO
function renderOperativoRecupero(modelos) {
  let html = `<table class="tabla-auditoria">
    <thead>
      <tr>
        <th>Modelo de Equipo</th>
        <th style="text-align:center;">Total Recibidos</th>
        <th style="text-align:center;">🟢 Puestos en Circulación</th>
        <th style="text-align:center;">🔴 Descarte / Falla</th>
        <th style="text-align:center;">Tasa de Recupero (%)</th>
      </tr>
    </thead>
    <tbody>`;

  const entries = Object.entries(modelos);
  if (entries.length === 0) {
    html += `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:16px;">No hay registros de triage en Supabase. Carga equipos desde <strong>triage.html</strong>.</td></tr>`;
  } else {
    entries.forEach(([modName, cant]) => {
      const pct = cant.total > 0 ? Math.round((cant.circulacion / cant.total) * 100) : 0;
      html += `<tr>
        <td style="font-weight:600; color:#334155;">${modName}</td>
        <td style="text-align:center; font-weight:700;">${cant.total} un.</td>
        <td style="text-align:center; color:#16a34a; font-weight:700;">${cant.circulacion} un.</td>
        <td style="text-align:center; color:#dc2626; font-weight:700;">${cant.descarte} un.</td>
        <td style="text-align:center; font-weight:700;">${pct}%</td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  document.getElementById('tablaRecuperoOperativoWrapper').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  cargarModuloRecupero();
});