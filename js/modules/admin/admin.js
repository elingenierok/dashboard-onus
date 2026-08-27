// ====================================================
// MÓDULO ADMIN: CONTROL DE LEAD TIME Y GESTIÓN
// ====================================================

const SUPABASE_URL_ADM = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_ADM = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseAdmin = window.supabase ? window.supabase.createClient(SUPABASE_URL_ADM, SUPABASE_KEY_ADM) : null;

function obtenerSucursalAdmin() {
  return window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';
}

async function cargarModuloAdmin() {
  await cargarLeadTimeEstanteria();
}

async function cargarLeadTimeEstanteria() {
  const gridKpi = document.getElementById('grid-admin-leadtime');
  const wrapperTabla = document.getElementById('tablaLeadtimeWrapper');
  const tagStatus = document.getElementById('tagAdminLeadtime');

  const sucActiva = obtenerSucursalAdmin();

  if (tagStatus) {
    tagStatus.textContent = `Consultando [${sucActiva}]...`;
    tagStatus.className = 'file-tag no';
  }

  try {
    if (!supabaseAdmin) return;

    let query = supabaseAdmin
      .from('recupero_operativo')
      .select('*')
      .eq('condicion', 'PENDIENTE')
      .order('fecha_ingreso', { ascending: true });

    if (sucActiva !== 'TODAS') {
      query = query.eq('sucursal_id', sucActiva);
    }

    const { data, error } = await query;

    if (error) throw error;

    const pend = data || [];
    const ahora = new Date();

    let cantCriticos = 0;  // > 48 hs
    let cantDemorados = 0; // 24 a 48 hs
    let cantNormales = 0;  // < 24 hs

    const filas = pend.map(item => {
      const fIngreso = item.fecha_ingreso ? new Date(item.fecha_ingreso) : new Date(item.created_at);
      const horasEspera = Math.max(0, parseFloat(((ahora - fIngreso) / (1000 * 60 * 60)).toFixed(1)));

      let badgeEstado = '';
      if (horasEspera > 48) {
        cantCriticos++;
        badgeEstado = `<span style="background:#fee2e2; color:#ef4444; font-weight:700; padding:2px 8px; border-radius:4px;">🔴 Crítico (${horasEspera} hs)</span>`;
      } else if (horasEspera >= 24) {
        cantDemorados++;
        badgeEstado = `<span style="background:#fef3c7; color:#b45309; font-weight:700; padding:2px 8px; border-radius:4px;">🟡 Demorado (${horasEspera} hs)</span>`;
      } else {
        cantNormales++;
        badgeEstado = `<span style="background:#dcfce7; color:#166534; font-weight:700; padding:2px 8px; border-radius:4px;">🟢 En Tiempo (${horasEspera} hs)</span>`;
      }

      return {
        ...item,
        horasEspera,
        badgeEstado,
        fechaIngStr: fIngreso.toLocaleDateString('es-AR') + ' ' + fIngreso.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      };
    });

    // RENDER: TARJETAS KPI
    if (gridKpi) {
      gridKpi.innerHTML = `
        <div class="kpi-card-dark" style="background:#1e293b; border-left:4px solid #38bdf8;">
          <div class="title">📦 Pendientes en Estantería</div>
          <div class="value" style="color:#f8fafc;">${pend.length} un.</div>
          <div class="subtext">Equipos esperando prueba [${sucActiva}]</div>
        </div>
        <div class="kpi-card-dark" style="background:#1e293b; border-left:4px solid #ef4444;">
          <div class="title">🚨 Estancados (> 48 hs)</div>
          <div class="value" style="color:#f87171;">${cantCriticos} un.</div>
          <div class="subtext">Prioridad máxima de laboratorio</div>
        </div>
        <div class="kpi-card-dark" style="background:#1e293b; border-left:4px solid #f59e0b;">
          <div class="title">⏳ Demora Media (24-48 hs)</div>
          <div class="value" style="color:#fbbf24;">${cantDemorados} un.</div>
          <div class="subtext">En advertencia de acumulación</div>
        </div>
      `;
    }

    // RENDER: TABLA DE DETALLE
    if (wrapperTabla) {
      if (filas.length === 0) {
        wrapperTabla.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">🟢 No hay equipos pendientes en estantería para ${sucActiva}.</div>`;
      } else {
        let html = `<table class="tabla-auditoria" style="width:100%;">
          <thead>
            <tr>
              <th style="text-align:left;">SN / MAC</th>
              <th style="text-align:left;">Modelo de ONU</th>
              <th style="text-align:left;">Origen / Retiró</th>
              <th style="text-align:center;">Fecha de Ingreso</th>
              <th style="text-align:center;">Demora Acumulada</th>
            </tr>
          </thead>
          <tbody>`;

        filas.forEach(f => {
          html += `<tr>
            <td style="font-weight:700; color:#0284c7;">${f.sn}</td>
            <td style="font-weight:600; color:#334155;">${f.descripcion || f.modelo || '-'}</td>
            <td style="color:#475569;">${f.almacen_origen || '-'} (${f.tecnico || '-'})</td>
            <td style="text-align:center; font-size:0.8rem;">${f.fechaIngStr}</td>
            <td style="text-align:center;">${f.badgeEstado}</td>
          </tr>`;
        });

        html += `</tbody></table>`;
        wrapperTabla.innerHTML = html;
      }
    }

    if (tagStatus) {
      tagStatus.textContent = `✅ Al día [${sucActiva}]`;
      tagStatus.className = 'file-tag ok';
    }

  } catch (err) {
    console.error('Error al cargar Lead Time en admin:', err);
    if (tagStatus) {
      tagStatus.textContent = `❌ Error [${sucActiva}]`;
      tagStatus.className = 'file-tag no';
    }
  }
}