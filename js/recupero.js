// ====================================================
// MÓDULO AUTÓNOMO DE RECUPERO DE EQUIPOS (DASHBOARD)
// ====================================================

// 1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE
const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

let recuperoChartInstance = null;
let totalPieChartInstance = null;
let vipPieChartInstance = null;

// Función auxiliar: Elimina tildes, espacios extra y convierte a mayúsculas
function normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// 2. CONSULTA AL CATÁLOGO MAESTRO DE EQUIPOS (REEMPLAZA LA LISTA ESTÁTICA)
function obtenerInfoCatalogo(descNorm, catalogo) {
  const encontrado = catalogo.find(item => {
    const itemNorm = item.modelo_norm || normalizar(item.modelo);
    return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
  });

  if (encontrado) {
    return {
      esVIP: Boolean(encontrado.es_vip),
      precioUsd: parseFloat(encontrado.precio_usd) || 0.0
    };
  }

  // Si el equipo no figura en el catálogo, se trata como no VIP / Obsoleto por defecto
  return { esVIP: false, precioUsd: 0.0 };
}

// 3. CONSULTA DE DATOS DESDE SUPABASE (MESA ACTIVA Y CATÁLOGO MAESTRO)
async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando...';
    tag.className = 'file-tag no';
  }

  try {
    const [resRec, resCatalogo] = await Promise.all([
      supabaseRecupero.from('recupero_operativo').select('*'),
      supabaseRecupero.from('catalogo_equipos').select('*')
    ]);

    if (resRec.error) throw resRec.error;
    if (resCatalogo.error) throw resCatalogo.error;

    const dataRec = resRec.data || [];
    const catalogo = resCatalogo.data || [];

    if (tag) {
      tag.textContent = `Supabase: ✅ ${dataRec.length} Registros`;
      tag.className = 'file-tag ok';
    }

    procesarYRenderizarRecupero(dataRec, catalogo);
  } catch (err) {
    console.error('Error al cargar módulo Recupero:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error';
      tag.className = 'file-tag no';
    }
  }
}

// 4. PROCESAMIENTO MATEMÁTICO DE MÉTRICAS Y VALORIZACIÓN
function procesarYRenderizarRecupero(data, catalogo) {
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
    
    // Lectura de bandera VIP y precio directamente del Catálogo Maestro
    const infoCat = obtenerInfoCatalogo(descNorm, catalogo);
    const esEquipoVIP = infoCat.esVIP;
    const precioUnit = infoCat.precioUsd;

    totalRecibidos += cant;

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

// 5. RENDERIZADO: INDICADORES ESTRATÉGICOS Y GRÁFICO
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

// 6. RENDERIZADO: TARJETAS TÁCTICAS AGRUPADAS CON GRÁFICOS TIPO DONA
function renderRecuperoTactico(totalRecibidos, directoDescarte, enCirc, fueraCirc, pctReap, valPromedio, capitalTotal) {
  const container = document.getElementById('grid-recupero-cards');
  if (!container) return;

  const vipRecibidos = totalRecibidos - directoDescarte;

  container.style.display = "flex";
  container.style.flexWrap = "wrap";
  container.style.gap = "16px";

  container.innerHTML = `
    <!-- BLOQUE 1: DEL TOTAL RECIBIDO -->
    <div style="flex: 1; min-width: 320px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px; display: flex; flex-direction: column;">
      <div style="font-size: 0.8rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
        📦 Del total recibido
      </div>
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex: 1;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1;">
          <div class="kpi-card-dark" style="background: #1e293b; padding: 10px;">
            <div class="title" style="color: #cbd5e1; font-size: 0.72rem;">📥 RECIBIDOS</div>
            <div class="value" style="color: #f8fafc; font-size: 1.4rem;">${totalRecibidos.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext" style="color: #94a3b8;">Bruto Ingreso</div>
          </div>
          <div class="kpi-card-dark" style="border-color:#eab308; background: #1e293b; padding: 10px;">
            <div class="title" style="color:#fde047; font-size: 0.72rem;">📼 DESCARTE OBS.</div>
            <div class="value" style="color:#fde047; font-size: 1.4rem;">${directoDescarte.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext">Sin Prueba</div>
          </div>
        </div>
        <div style="width: 85px; height: 85px; position: relative; flex-shrink: 0;" title="Proporción: Obsoleto vs VIP">
          <canvas id="chartRecuperoTotalPie"></canvas>
        </div>
      </div>
    </div>

    <!-- BLOQUE 2: DE LOS EQUIPOS VIP -->
    <div style="flex: 2; min-width: 460px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px; display: flex; flex-direction: column;">
      <div style="font-size: 0.8rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
        ⭐ De los equipos VIP
      </div>
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex: 1;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; flex: 1;">
          <div class="kpi-card-dark" style="border-color:#16a34a; background: #1e293b; padding: 10px;">
            <div class="title" style="color:#4ade80; font-size: 0.72rem;">♻️ EN CIRCULACIÓN</div>
            <div class="value" style="color:#4ade80; font-size: 1.4rem;">${enCirc.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext">VIP Recuperados</div>
          </div>
          <div class="kpi-card-dark" style="border-color:#dc2626; background: #1e293b; padding: 10px;">
            <div class="title" style="color:#f87171; font-size: 0.72rem;">🗑️ FUERA CIRC.</div>
            <div class="value" style="color:#f87171; font-size: 1.4rem;">${fueraCirc.toLocaleString('es-AR')} <span style="font-size:0.8rem;">un.</span></div>
            <div class="subtext">Descarte VIP</div>
          </div>
          <div class="kpi-card-dark" style="border-color:#0284c7; background: #1e293b; padding: 10px;">
            <div class="title" style="color:#38bdf8; font-size: 0.72rem;">📈 % REAPROV.</div>
            <div class="value" style="color:#38bdf8; font-size: 1.4rem;">${pctReap}%</div>
            <div class="subtext">Efectividad VIP</div>
          </div>
          <div class="kpi-card-dark" style="border-color:#16a34a; background: #1e293b; padding: 10px;">
            <div class="title" style="color:#4ade80; font-size: 0.72rem;">💵 VALOR PROM/TOT</div>
            <div class="value" style="color:#4ade80; font-size: 1.2rem;">$ ${valPromedio} <span style="font-size:0.75rem;">USD/un</span></div>
            <div class="subtext">Total: <strong>$ ${Math.round(capitalTotal).toLocaleString('es-AR')} USD</strong></div>
          </div>
        </div>
        <div style="width: 85px; height: 85px; position: relative; flex-shrink: 0;" title="Proporción VIP: En Circulación vs Descarte VIP">
          <canvas id="chartRecuperoVipPie"></canvas>
        </div>
      </div>
    </div>
  `;

  renderPieChartsTacticos(directoDescarte, vipRecibidos, enCirc, fueraCirc);
}

// RENDERIZADO DE LOS DOS GRÁFICOS COMPACTOS TIPO DONA
function renderPieChartsTacticos(directoDescarte, vipRecibidos, enCirc, fueraCirc) {
  const ctxTotal = document.getElementById('chartRecuperoTotalPie');
  if (ctxTotal) {
    if (totalPieChartInstance) totalPieChartInstance.destroy();
    totalPieChartInstance = new Chart(ctxTotal, {
      type: 'doughnut',
      data: {
        labels: ['Descarte Obsoleto', 'Equipos VIP'],
        datasets: [{
          data: [directoDescarte, Math.max(0, vipRecibidos)],
          backgroundColor: ['#eab308', '#38bdf8'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} un.`
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  const ctxVip = document.getElementById('chartRecuperoVipPie');
  if (ctxVip) {
    if (vipPieChartInstance) vipPieChartInstance.destroy();
    vipPieChartInstance = new Chart(ctxVip, {
      type: 'doughnut',
      data: {
        labels: ['En Circulación', 'Fuera de Circulación'],
        datasets: [{
          data: [enCirc, fueraCirc],
          backgroundColor: ['#4ade80', '#f87171'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} un.`
            }
          }
        },
        cutout: '65%'
      }
    });
  }
}

// 7. RENDERIZADO: TABLA OPERATIVA POR MODELO
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

// 8. DISPARADOR AUTOMÁTICO DE CARGA
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cargarModuloRecupero);
} else {
  cargarModuloRecupero();
}

// 9. LÓGICA DE CIERRE SEMANAL Y GENERACIÓN DE INFORME
async function ejecutarCierreSemanal() {
  const confirmacion = confirm(
    "⚠️ ¿Estás seguro de cerrar la semana actual?\n\n" +
    "- Los equipos con veredicto final (OK/Descarte) se archivarán en el historial.\n" +
    "- Se conservarán las métricas exactas de tiempo de prueba y espera.\n" +
    "- Se generará un resumen numérico consolidado.\n" +
    "- Los equipos 'PENDIENTES' se mantendrán en la mesa activa.\n\n" +
    "Esta acción no se puede deshacer."
  );

  if (!confirmacion) return;

  try {
    const [resTodos, resCatalogo] = await Promise.all([
      supabaseRecupero.from('recupero_operativo').select('*'),
      supabaseRecupero.from('catalogo_equipos').select('*')
    ]);

    if (resTodos.error) throw resTodos.error;
    if (resCatalogo.error) throw resCatalogo.error;

    const todos = resTodos.data || [];
    const catalogo = resCatalogo.data || [];

    if (todos.length === 0) {
      alert("⚠️ No hay equipos registrados en la mesa activa.");
      return;
    }

    const probados = todos.filter(row => {
      const cond = normalizar(row.condicion || row.estado || '');
      return ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO', 'DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => cond.includes(e));
    });

    if (probados.length === 0) {
      alert("⚠️ No hay equipos con veredicto final para cerrar esta semana. Los equipos 'PENDIENTES' permanecerán en la mesa.");
      return;
    }

    let enCirc = 0, descVip = 0, descObs = 0, valorUsd = 0;
    const desglose = {};

    probados.forEach(row => {
      const cant = parseInt(row.cantidad || 1, 10) || 1;
      const desc = row.descripcion || row.modelo || 'DESCONOCIDO';
      const descNorm = normalizar(desc);
      const cond = normalizar(row.condicion || row.estado || '');

      const infoCat = obtenerInfoCatalogo(descNorm, catalogo);
      const esEquipoVIP = infoCat.esVIP;
      const precio = infoCat.precioUsd;

      if (!desglose[descNorm]) {
        desglose[descNorm] = { desc: desc, vip: esEquipoVIP, circ: 0, descVIP: 0, descObs: 0 };
      }

      const esAprobado = ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO'].some(e => cond.includes(e));

      if (!esEquipoVIP) {
        descObs += cant;
        desglose[descNorm].descObs += cant;
      } else if (esAprobado) {
        enCirc += cant;
        valorUsd += (cant * precio);
        desglose[descNorm].circ += cant;
      } else {
        descVip += cant;
        desglose[descNorm].descVIP += cant;
      }
    });

    const fechaHoy = new Date().toISOString().split('T')[0];
    const semanaLabel = `Semana Cierre ${fechaHoy}`;

    const copiaHistorico = probados.map(row => ({
      fecha_ingreso: row.fecha_ingreso,
      codigo: row.codigo,
      descripcion: row.descripcion,
      sn: row.sn,
      condicion: row.condicion,
      tecnico: row.tecnico,
      almacen_origen: row.almacen_origen,
      observaciones: row.observaciones,
      inicio_prueba: row.inicio_prueba,
      fin_prueba: row.fin_prueba,
      tiempo_prueba_seg: row.tiempo_prueba_seg,
      tiempo_espera_hs: row.tiempo_espera_hs
    }));

    const { error: errHist } = await supabaseRecupero
      .from('recupero_historico_equipos')
      .insert(copiaHistorico);

    if (errHist) throw errHist;

    const { error: errInforme } = await supabaseRecupero
      .from('recupero_informes_semanales')
      .insert([{
        semana_label: semanaLabel,
        total_recibidos: probados.length,
        en_circulacion: enCirc,
        descarte_vip: descVip,
        descarte_obsoleto: descObs,
        valor_recuperado_usd: valorUsd,
        desglose_operativo: desglose
      }]);

    if (errInforme) throw errInforme;

    const idsProcesados = probados.map(r => r.id);
    const { error: errBorrado } = await supabaseRecupero
      .from('recupero_operativo')
      .delete()
      .in('id', idsProcesados);

    if (errBorrado) throw errBorrado;

    alert(`🎉 Cierre semanal completado con éxito.\n\n` +
          `- Procesados y Archivados: ${probados.length} equipos.\n` +
          `- Pendientes conservados: ${todos.length - probados.length} equipos.`);

    cargarModuloRecupero();

  } catch (err) {
    console.error("❌ Error en el cierre semanal:", err);
    alert("Ocurrió un error al intentar realizar el cierre semanal. Revisar la consola.");
  }
}