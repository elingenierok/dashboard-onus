// ====================================================
// 🔍 VISOR GERENCIAL DE AUDITORÍAS (PARA INDEX.HTML)
// ====================================================

function getSupabaseVisorClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(
      'https://ovluxdezwvuonlwnymna.supabase.co',
      'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S'
    );
    return window.supabaseClient;
  }
  return null;
}

let auditoriaDetalleMemoria = [];

// Función principal ejecutada al pulsar el botón "⚡ Actualizar Datos" o cambiar de pestaña
async function cargarModuloControlAuditoria() {
  const wrapperResumen = document.getElementById('tablaResumenAuditoriaWrapper');
  const wrapperDetalle = document.getElementById('tablaControlDetalleWrapper');
  const client = getSupabaseVisorClient();

  if (!client) return;

  if (wrapperResumen) wrapperResumen.innerHTML = '<p style="padding:15px; color:#38bdf8; text-align:center;">⏳ Calculando exactitud general...</p>';
  if (wrapperDetalle) wrapperDetalle.innerHTML = '<p style="padding:15px; color:#38bdf8; text-align:center;">⏳ Descargando detalles desde Supabase...</p>';

  try {
    // 1. CARGAR RESUMEN (CABECERAS)
    const { data: dataCabeceras, error: errCab } = await client
      .from('auditoria_control_activo')
      .select('*')
      .order('id', { ascending: false });

    if (errCab) throw errCab;

    const mapUltimas = new Map();
    (dataCabeceras || []).forEach(row => {
      if (!mapUltimas.has(row.almacen_key)) {
        mapUltimas.set(row.almacen_key, row);
      }
    });

    renderResumenAuditoria(mapUltimas, wrapperResumen);

    // 2. CARGAR DETALLES (RENGLONES)
    const { data: dataDetalle, error: errDet } = await client
      .from('auditoria_control_detalle')
      .select('*')
      .order('fecha_inspeccion', { ascending: false });

    if (errDet) throw errDet;

    auditoriaDetalleMemoria = dataDetalle || [];
    filtrarTablaControlAuditoria();

  } catch (err) {
    console.error('Error al cargar visor de auditoría:', err);
    if (wrapperResumen) wrapperResumen.innerHTML = `<p style="color:#ef4444; text-align:center;">❌ Error: ${err.message}</p>`;
    if (wrapperDetalle) wrapperDetalle.innerHTML = `<p style="color:#ef4444; text-align:center;">❌ Error: ${err.message}</p>`;
  }
}

// Renderizar la tabla superior (Resumen General)
function renderResumenAuditoria(mapCabeceras, wrapper) {
  if (!wrapper) return;
  if (mapCabeceras.size === 0) {
    wrapper.innerHTML = '<p style="padding:15px; text-align:center; color:#94a3b8;">No hay auditorías registradas en el sistema.</p>';
    return;
  }

  let html = `<table class="tabla-auditoria" style="width:100%; border-collapse:collapse; background:#0f172a; border-radius:8px; overflow:hidden;">
    <thead>
      <tr style="background:#1e293b; color:#38bdf8; border-bottom:1px solid #334155;">
        <th style="padding:12px; text-align:left;">Almacén / Depósito</th>
        <th style="padding:12px; text-align:center;">Stock Sistema</th>
        <th style="padding:12px; text-align:center;">Stock Físico Real</th>
        <th style="padding:12px; text-align:center;">Desviación Total</th>
        <th style="padding:12px; text-align:center;">Exactitud (%)</th>
        <th style="padding:12px; text-align:center;">Última Inspección</th>
      </tr>
    </thead>
    <tbody>`;

  mapCabeceras.forEach((row, almacenKey) => {
    const dif = row.diferencia || 0;
    let tagDif = '<span style="color:#4ade80; font-weight:800;">🟢 Exacto (0)</span>';
    if (dif < 0) tagDif = `<span style="background:#7f1d1d; color:#fca5a5; padding:4px 8px; border-radius:4px; font-weight:700;">🔴 Faltan ${Math.abs(dif)}</span>`;
    else if (dif > 0) tagDif = `<span style="background:#0c4a6e; color:#7dd3fc; padding:4px 8px; border-radius:4px; font-weight:700;">🔵 Sobran ${dif}</span>`;

    if (row.estado !== 'COMPLETADO') {
      tagDif = '<span style="background:#78350f; color:#fde68a; padding:4px 8px; border-radius:4px; font-weight:700;">⏳ Pendiente</span>';
    }

    const exactitud = 100 - (parseFloat(row.desviacion_pct) || 0);
    const fecha = row.fecha_inspeccion ? new Date(row.fecha_inspeccion).toLocaleDateString('es-AR') : 'Sin fecha';

    html += `<tr style="border-bottom:1px solid #1e293b; transition:background 0.2s;" onmouseover="this.style.background='#131f37'" onmouseout="this.style.background='transparent'">
      <td style="padding:10px; font-weight:700; color:#f8fafc;">${row.almacen_nombre || almacenKey}</td>
      <td style="padding:10px; text-align:center; color:#94a3b8; font-weight:600;">${(row.stock_sistema || 0).toLocaleString('es-AR')} un.</td>
      <td style="padding:10px; text-align:center; color:#38bdf8; font-weight:800;">${(row.stock_fisico || 0).toLocaleString('es-AR')} un.</td>
      <td style="padding:10px; text-align:center;">${tagDif}</td>
      <td style="padding:10px; text-align:center; font-weight:800; color:${exactitud === 100 ? '#4ade80' : '#f87171'}">${exactitud.toFixed(1)}%</td>
      <td style="padding:10px; text-align:center; font-size:0.8rem; color:#94a3b8;">📅 ${fecha}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}

// Filtrar la tabla inferior (Detalle por Modelo)
function filtrarTablaControlAuditoria() {
  const filtroAlmacen = document.getElementById('filtro-control-almacen')?.value || 'TODOS';
  const soloDiferencias = document.getElementById('check-solo-diferencias')?.checked || false;
  const wrapper = document.getElementById('tablaControlDetalleWrapper');
  
  if (!wrapper) return;

  let datosFiltrados = auditoriaDetalleMemoria;

  if (filtroAlmacen !== 'TODOS') {
    datosFiltrados = datosFiltrados.filter(item => item.almacen_key === filtroAlmacen);
  }
  if (soloDiferencias) {
    datosFiltrados = datosFiltrados.filter(item => item.diferencia !== 0);
  }

  if (datosFiltrados.length === 0) {
    wrapper.innerHTML = '<p style="padding:20px; text-align:center; color:#64748b; font-style:italic; border:1px dashed #334155; border-radius:8px;">📭 No hay registros para mostrar con los filtros actuales.</p>';
    return;
  }

  let html = `<table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem; background:#0f172a; border-radius:8px; overflow:hidden;">
    <thead>
      <tr style="background:#1e293b; color:#38bdf8; border-bottom:1px solid #334155;">
        <th style="padding:12px;">Almacén / Depósito</th>
        <th style="padding:12px;">Modelo Auditado</th>
        <th style="padding:12px; text-align:center;">Sistema</th>
        <th style="padding:12px; text-align:center;">Físico Real</th>
        <th style="padding:12px; text-align:center;">Diferencia</th>
        <th style="padding:12px; text-align:center;">Auditor</th>
        <th style="padding:12px; text-align:center;">Fecha Inspección</th>
      </tr>
    </thead>
    <tbody>`;

  datosFiltrados.forEach(row => {
    let tagDif = '<span style="color:#4ade80; font-weight:800;">🟢 Exacto (0)</span>';
    if (row.diferencia < 0) tagDif = `<span style="background:#7f1d1d; color:#fca5a5; font-weight:800; padding:4px 8px; border-radius:6px;">🔴 Faltan ${Math.abs(row.diferencia)}</span>`;
    else if (row.diferencia > 0) tagDif = `<span style="background:#0c4a6e; color:#7dd3fc; font-weight:800; padding:4px 8px; border-radius:6px;">🔵 Sobran ${row.diferencia}</span>`;

    const fechaObj = new Date(row.fecha_inspeccion || row.fecha_snapshot);
    const fechaStr = isNaN(fechaObj) ? 'Sin Fecha' : `${fechaObj.toLocaleDateString('es-AR')} ${fechaObj.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})} hs`;
    const nombreAud = row.auditor_nombre || row.auditor || 'Desconocido';

    html += `<tr style="border-bottom:1px solid #1e293b; transition: background 0.2s;" onmouseover="this.style.background='#131f37'" onmouseout="this.style.background='transparent'">
      <td style="padding:10px; font-weight:700; color:#94a3b8;">${row.almacen_key}</td>
      <td style="padding:10px; font-weight:800; color:#f8fafc;">${row.modelo}</td>
      <td style="padding:10px; text-align:center; font-weight:600; color:#cbd5e1;">${row.stock_sistema} un.</td>
      <td style="padding:10px; text-align:center; color:#38bdf8; font-weight:800; font-size:0.95rem;">${row.stock_fisico} un.</td>
      <td style="padding:10px; text-align:center;">${tagDif}</td>
      <td style="padding:10px; text-align:center; font-size:0.78rem; font-weight:600; color:#94a3b8;">👤 ${nombreAud}</td>
      <td style="padding:10px; text-align:center; font-size:0.78rem; font-weight:600; color:#94a3b8;">📅 ${fechaStr}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}