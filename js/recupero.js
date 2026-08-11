// ====================================================
// MÓDULO AUTÓNOMO DE RECUPERO DE EQUIPOS (DASHBOARD)
// ====================================================

// 1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE
const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

// Función auxiliar: Elimina tildes, espacios extra y convierte a mayúsculas
function normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// 2. LISTA Y CLASIFICACIÓN DE EQUIPOS VIP
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

// 3. CONSULTA DE DATOS DESDE SUPABASE (MESA ACTIVA: recupero_operativo)
async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando...';
    tag.className = 'file-tag no';
  }

  try {
    const [resRec, resPrecios] = await Promise.all([
      supabaseRecupero.from('recupero_operativo').select('*'),
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

// Búsqueda de precio unitario en catálogo
function obtenerPrecioEstimado(descNorm, preciosMap) {
  if (preciosMap.has(descNorm)) return preciosMap.get(descNorm);
  
  for (let [key, val] of preciosMap.entries()) {
    if (descNorm.includes(key) || key.includes(descNorm)) return val;
  }
  return 0;
}

// 4. PROCESAMIENTO MATEMÁTICO DE MÉTRICAS Y VALORIZACIÓN
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

// 6. RENDERIZADO: TARJETAS TÁCTICAS AGRUPADAS
function renderRecuperoTactico(totalRecibidos, directoDescarte, enCirc, fueraCirc, pctReap, valPromedio, capitalTotal) {
  const container = document.getElementById('grid-recupero-cards');
  if (!container) return;

  container.style.display = "flex";
  container.style.flexWrap = "wrap";
  container.style.gap = "16px";

  container.innerHTML = `
    <!-- BLOQUE 1: DEL TOTAL RECIBIDO -->
    <div style="flex: 1; min-width: 280px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px;">
      <div style="font-size: 0.8rem; font-weight: 800; color: #4d4f52; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
        📦 Del total recibido
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;">
        <div class="kpi-card-dark" style="background: #1e293b;">
          <div class="title" style="color: #cbd5e1;">📥 EQUIPOS RECIBIDOS</div>
          <div class="value" style="color: #f8fafc;">${totalRecibidos.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
          <div class="subtext" style="color: #94a3b8;">Ingreso Bruto Laboratorio</div>
        </div>
        <div class="kpi-card-dark" style="border-color:#eab308; background: #1e293b;">
          <div class="title" style="color:#fde047;">📼 DIRECTO A DESCARTE</div>
          <div class="value" style="color:#fde047;">${directoDescarte.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
          <div class="subtext">Tecnología Obsoleta (Sin Prueba)</div>
        </div>
      </div>
    </div>

    <!-- BLOQUE 2: DE LOS EQUIPOS VIP -->
    <div style="flex: 2; min-width: 320px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px;">
      <div style="font-size: 0.8rem; font-weight: 800; color: #2b7fa3; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
        ⭐ De los equipos VIP
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
        <div class="kpi-card-dark" style="border-color:#16a34a; background: #1e293b;">
          <div class="title" style="color:#4ade80;">♻️ EN CIRCULACIÓN</div>
          <div class="value" style="color:#4ade80;">${enCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
          <div class="subtext">Equipos VIP Recuperados</div>
        </div>
        <div class="kpi-card-dark" style="border-color:#dc2626; background: #1e293b;">
          <div class="title" style="color:#f87171;">🗑️ FUERA DE CIRCULACIÓN</div>
          <div class="value" style="color:#f87171;">${fueraCirc.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
          <div class="subtext">Descarte VIP Tras Prueba</div>
        </div>
        <div class="kpi-card-dark" style="border-color:#0284c7; background: #1e293b;">
          <div class="title" style="color:#38bdf8;">📈 % REAPROVECHAMIENTO</div>
          <div class="value" style="color:#38bdf8;">${pctReap}%</div>
          <div class="subtext">Efectividad sobre VIP Probadas</div>
        </div>
        <div class="kpi-card-dark" style="border-color:#16a34a; background: #1e293b;">
          <div class="title" style="color:#4ade80;">💵 VALOR PROMEDIO / TOTAL</div>
          <div class="value" style="color:#4ade80;">$ ${valPromedio} <span style="font-size:0.9rem;">USD/un</span></div>
          <div class="subtext">Total: <strong>$ ${Math.round(capitalTotal).toLocaleString('es-AR')} USD</strong></div>
        </div>
      </div>
    </div>
  `;
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

// 9. LÓGICA DE CIERRE SEMANAL Y GENERACIÓN DE INFORME (CON TRAZA DE TIEMPOS)
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
    const { data: todos, error: errLectura } = await supabaseRecupero
      .from('recupero_operativo')
      .select('*');

    if (errLectura) throw errLectura;
    if (!todos || todos.length === 0) {
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

    const resPrecios = await supabaseRecupero.from('precios_catalogos').select('*');
    const preciosMap = new Map();
    (resPrecios.data || []).forEach(p => {
      const val = parseFloat(p.precio_final) || parseFloat(p.precio_usd) || parseFloat(p.precio) || 0;
      if (p.codigo) preciosMap.set(normalizar(p.codigo), val);
      if (p.descripcion) preciosMap.set(normalizar(p.descripcion), val);
    });

    probados.forEach(row => {
      const cant = parseInt(row.cantidad || 1, 10) || 1;
      const desc = row.descripcion || row.modelo || 'DESCONOCIDO';
      const descNorm = normalizar(desc);
      const cond = normalizar(row.condicion || row.estado || '');
      const esEquipoVIP = esVIP(descNorm);
      const precio = obtenerPrecioEstimado(descNorm, preciosMap);

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