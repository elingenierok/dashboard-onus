// ====================================================
// MÓDULO 2: INTERFAZ DE USUARIO Y GRÁFICOS DE RECUPERO
// ====================================================

let recuperoChartInstance = null;
let totalPieChartInstance = null;
let vipPieChartInstance = null;
let gaugeChartInstance = null;

window.toggleDetalleRecupero = function(id) {
  const container = document.getElementById(id);
  const btn = document.getElementById(`btn-${id}`);
  if (container) {
    const visible = container.style.display === 'block';
    container.style.display = visible ? 'none' : 'block';
    if (btn) {
      btn.textContent = visible ? btn.textContent.replace('🔼', '🔽') : btn.textContent.replace('🔽', '🔼');
    }
  }
};

window.renderizarModuloRecuperoUI = function() {
  const est = window.EstadoRecupero;
  if (!est || !est.cargado) return;

  renderRecuperoEstrategico(est.enCirculacionVIP, est.fueraCirculacionVIP, est.probadosVIP, est.capitalTotal, est.pctReaprovechamiento);
  renderRecuperoTactico(est);
  renderRecuperoOperativo(est.desgloseOperativo);
};

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

function renderRecuperoTactico(est) {
  const container = document.getElementById('grid-recupero-cards');
  if (!container) return;

  const vipRecibidos = est.totalRecibidos - est.directoDescarteObs;

  let filasIngresoHoy = est.itemsIngresadosHoy.length === 0
    ? `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:8px;">Sin ingresos registrados el día de hoy.</td></tr>`
    : est.itemsIngresadosHoy.map(item => `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding:6px; color:#cbd5e1;">${item.hora} hs</td>
          <td style="padding:6px;"><code style="background:#0f172a; padding:2px 6px; border-radius:4px; font-weight:800; color:#38bdf8; font-family:monospace;">${item.sn}</code></td>
          <td style="padding:6px; color:#f8fafc; font-weight:600;">${item.modelo}</td>
          <td style="padding:6px; text-align:center;">${item.esVIP ? '<span style="color:#0284c7; font-weight:700;">🔵 VIP</span>' : '<span style="color:#fde047; font-weight:700;">⚙️ Obsoleto</span>'}</td>
        </tr>
      `).join('');

  let filasVipHoy = est.itemsVipTesteadosHoy.length === 0
    ? `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:8px;">Sin pruebas VIP completadas hoy.</td></tr>`
    : est.itemsVipTesteadosHoy.map(item => `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding:6px; color:#cbd5e1;">${item.hora} hs</td>
          <td style="padding:6px;"><code style="background:#0f172a; padding:2px 6px; border-radius:4px; font-weight:800; color:#38bdf8; font-family:monospace;">${item.sn}</code></td>
          <td style="padding:6px; color:#f8fafc; font-weight:600;">${item.modelo}</td>
          <td style="padding:6px; text-align:center;">${item.esAprobado ? '<span style="color:#4ade80; font-weight:800;">🟢 CIRCULACIÓN</span>' : '<span style="color:#f87171; font-weight:800;">🚨 DESCARTE VIP</span>'}</td>
        </tr>
      `).join('');

  container.innerHTML = `
    <!-- BLOQUE 1: DEL TOTAL RECIBIDO -->
    <div style="flex: 1; min-width: 500px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="font-size: 0.82rem; font-weight: 800; color: #f8fafc; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: space-between;">
        <span>📦 Del total recibido</span>
        <button id="btn-detalle-ingresos-hoy" onclick="toggleDetalleRecupero('detalle-ingresos-hoy')" style="background:#1e293b; color:#38bdf8; border:1px solid #334155; padding:4px 8px; border-radius:6px; font-size:0.72rem; cursor:pointer; font-weight:700;">
          🔽 Ver del día (${est.itemsIngresadosHoy.length})
        </button>
      </div>
      
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1;">
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #334155; padding: 10px;">
            <div class="title" style="color: #cbd5e1; font-size: 0.72rem;">📥 RECIBIDOS</div>
            <div class="value" style="color: #f8fafc; font-size: 1.4rem;">${est.totalRecibidos.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext" style="color: #94a3b8;">Bruto Ingreso</div>
          </div>
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #eab308; padding: 10px;">
            <div class="title" style="color: #fde047; font-size: 0.72rem;">📼 DESCARTE OBS.</div>
            <div class="value" style="color: #fde047; font-size: 1.4rem;">${est.directoDescarteObs.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext" style="color: #cbd5e1;">Sin Prueba</div>
          </div>
        </div>
        <div style="width: 80px; height: 80px; position: relative; flex-shrink: 0;">
          <canvas id="chartRecuperoTotalPie"></canvas>
        </div>
      </div>

      <div id="detalle-ingresos-hoy" style="display: none; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #334155;">
        <strong style="font-size:0.75rem; color:#38bdf8; display:block; margin-bottom:6px;">📋 Equipos ingresados en la fecha (${est.itemsIngresadosHoy.length} un.)</strong>
        <div style="max-height: 360px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
            <thead>
              <tr style="background:#1e293b; color:#94a3b8;">
                <th style="padding:4px;">Hora</th><th style="padding:4px;">Nº Serie (SN)</th><th style="padding:4px;">Modelo</th><th style="padding:4px; text-align:center;">Tipo</th>
              </tr>
            </thead>
            <tbody>${filasIngresoHoy}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- BLOQUE 2: DE LOS EQUIPOS VIP -->
    <div style="flex: 2; min-width: 420px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="font-size: 0.82rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: space-between;">
        <span>⭐ De los equipos VIP</span>
        <button id="btn-detalle-vip-hoy" onclick="toggleDetalleRecupero('detalle-vip-hoy')" style="background:#1e293b; color:#4ade80; border:1px solid #334155; padding:4px 8px; border-radius:6px; font-size:0.72rem; cursor:pointer; font-weight:700;">
          🔽 Ver del día (${est.itemsVipTesteadosHoy.length})
        </button>
      </div>
      
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; flex: 1;">
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #16a34a; padding: 10px;">
            <div class="title" style="color: #4ade80; font-size: 0.72rem;">♻️ EN CIRCULACIÓN</div>
            <div class="value" style="color: #4ade80; font-size: 1.4rem;">${est.enCirculacionVIP.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext" style="color: #cbd5e1;">VIP Recuperados</div>
          </div>
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #dc2626; padding: 10px;">
            <div class="title" style="color: #f87171; font-size: 0.72rem;">🗑️ FUERA CIRC.</div>
            <div class="value" style="color: #f87171; font-size: 1.4rem;">${est.fueraCirculacionVIP.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext" style="color: #cbd5e1;">Descarte VIP</div>
          </div>
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #0284c7; padding: 10px;">
            <div class="title" style="color: #38bdf8; font-size: 0.72rem;">📈 % REAPROV.</div>
            <div class="value" style="color: #38bdf8; font-size: 1.4rem;">${est.pctReaprovechamiento}%</div>
            <div class="subtext" style="color: #cbd5e1;">Efectividad VIP</div>
          </div>
          <div class="kpi-card-dark" style="background: #1e293b; border-color: #16a34a; padding: 10px;">
            <div class="title" style="color: #4ade80; font-size: 0.72rem;">💵 VALOR PROM/TOT</div>
            <div class="value" style="color: #4ade80; font-size: 1.2rem;">$ ${est.valorPromedioRecuperado} <span style="font-size:0.75rem;">USD/un</span></div>
            <div class="subtext" style="color: #cbd5e1;">Total: <strong style="color: #f8fafc;">$ ${Math.round(est.capitalTotal).toLocaleString('es-AR')} USD</strong></div>
          </div>
        </div>
        <div style="width: 80px; height: 80px; position: relative; flex-shrink: 0;">
          <canvas id="chartRecuperoVipPie"></canvas>
        </div>
      </div>

      <div id="detalle-vip-hoy" style="display: none; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #334155;">
        <strong style="font-size:0.75rem; color:#4ade80; display:block; margin-bottom:6px;">🔬 Equipos VIP probados en la fecha (${est.itemsVipTesteadosHoy.length} un.)</strong>
        <div style="max-height: 360px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
            <thead>
              <tr style="background:#1e293b; color:#94a3b8;">
                <th style="padding:4px;">Hora Test</th><th style="padding:4px;">Nº Serie (SN)</th><th style="padding:4px;">Modelo</th><th style="padding:4px; text-align:center;">Veredicto Final</th>
              </tr>
            </thead>
            <tbody>${filasVipHoy}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- BLOQUE 3: VELOCÍMETRO META DIARIA -->
    <div style="flex: 1; min-width: 220px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="font-size: 0.82rem; font-weight: 800; color: #4ade80; text-transform: uppercase; letter-spacing: 0.5px; text-align: center;">⚡ Ritmo Diario (Meta 50 un.)</div>
      <div style="width: 150px; height: 80px; position: relative; margin-top: 6px;">
        <canvas id="chartRecuperoGauge"></canvas>
      </div>
      <div style="text-align: center; margin-top: -12px;">
        <span style="font-size: 1.5rem; font-weight: 900; color: #4ade80;">${est.recuperadosHoy}</span>
        <span style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1;"> / 50 un. hoy</span>
      </div>
    </div>
  `;

  renderPieChartsTacticos(est.directoDescarteObs, vipRecibidos, est.enCirculacionVIP, est.fueraCirculacionVIP, est.recuperadosHoy);
}

function renderPieChartsTacticos(directoDescarte, vipRecibidos, enCirc, fueraCirc, recuperadosHoy) {
  const ctxTotal = document.getElementById('chartRecuperoTotalPie');
  if (ctxTotal) {
    if (totalPieChartInstance) totalPieChartInstance.destroy();
    totalPieChartInstance = new Chart(ctxTotal, {
      type: 'doughnut',
      data: {
        labels: ['Descarte Obsoleto', 'Equipos VIP'],
        datasets: [{ data: [directoDescarte, Math.max(0, vipRecibidos)], backgroundColor: ['#eab308', '#38bdf8'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
    });
  }

  const ctxVip = document.getElementById('chartRecuperoVipPie');
  if (ctxVip) {
    if (vipPieChartInstance) vipPieChartInstance.destroy();
    vipPieChartInstance = new Chart(ctxVip, {
      type: 'doughnut',
      data: {
        labels: ['En Circulación', 'Fuera de Circulación'],
        datasets: [{ data: [enCirc, fueraCirc], backgroundColor: ['#4ade80', '#f87171'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
    });
  }

  const ctxGauge = document.getElementById('chartRecuperoGauge');
  if (ctxGauge) {
    const metaDiaria = 50;
    const valorGauge = Math.min(recuperadosHoy, metaDiaria);
    const restanteGauge = Math.max(0, metaDiaria - valorGauge);

    let colorAvance = '#f87171';
    if (recuperadosHoy >= 35) colorAvance = '#4ade80';
    else if (recuperadosHoy >= 15) colorAvance = '#fde047';

    if (gaugeChartInstance) gaugeChartInstance.destroy();
    gaugeChartInstance = new Chart(ctxGauge, {
      type: 'doughnut',
      data: {
        labels: ['Recuperado Hoy', 'Faltante Meta'],
        datasets: [{ data: [valorGauge, restanteGauge], backgroundColor: [colorAvance, '#334155'], borderWidth: 0 }]
      },
      options: {
        rotation: -90, circumference: 180, responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }, cutout: '75%'
      }
    });
  }
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
        <td style="font-weight:600; color:#95b4d9;">${item.desc}</td>
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