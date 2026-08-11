// ====================================================
// MÓDULO AUTÓNOMO DE ADMINISTRACIÓN & AUDITORÍA DE TIEMPOS
// ====================================================

const SUPABASE_URL_ADMIN = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_ADMIN = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseAdmin = supabase.createClient(SUPABASE_URL_ADMIN, SUPABASE_KEY_ADMIN);

async function cargarModuloAdmin() {
  const tag = document.getElementById('tagAdminLeadtime');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando mesa...';
    tag.className = 'file-tag no';
  }

  try {
    // Consulta los equipos en la mesa activa ordenados por fecha_ingreso
    const { data: activos, error } = await supabaseAdmin
      .from('recupero_operativo')
      .select('*')
      .order('fecha_ingreso', { ascending: true });

    if (error) throw error;

    const dataActivos = activos || [];

    if (tag) {
      tag.textContent = `Supabase: ✅ ${dataActivos.length} Equipos Activos`;
      tag.className = 'file-tag ok';
    }

    procesarYRenderizarLeadTime(dataActivos);
  } catch (err) {
    console.error('Error al cargar módulo de administración:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error';
      tag.className = 'file-tag no';
    }
  }
}

function procesarYRenderizarLeadTime(data) {
  const ahora = new Date();
  
  // Filtrar solo los equipos pendientes
  const pendientes = data.filter(r => (r.condicion || '').toUpperCase() === 'PENDIENTE');
  
  let totalHorasEspera = 0;
  let criticos24h = 0;
  let criticos48h = 0;
  
  const listaDetallada = [];

  pendientes.forEach(row => {
    const fechaIngreso = new Date(row.fecha_ingreso || row.created_at || ahora);
    const diffMs = ahora - fechaIngreso;
    const horasEnEstanteria = Math.max(0, parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1)));
    
    totalHorasEspera += horasEnEstanteria;

    if (horasEnEstanteria >= 48) {
      criticos48h++;
    } else if (horasEnEstanteria >= 24) {
      criticos24h++;
    }

    listaDetallada.push({
      sn: row.sn || row.serial_number || 'S/N',
      descripcion: row.descripcion || row.modelo || 'DESCONOCIDO',
      origen: row.almacen_origen || row.origen || 'No especificado',
      cargadoPor: row.tecnico || 'Sistema',
      horas: horasEnEstanteria,
      fechaIngreso: fechaIngreso.toLocaleString('es-AR')
    });
  });

  const promedioHoras = pendientes.length > 0 ? (totalHorasEspera / pendientes.length).toFixed(1) : "0.0";

  // Ordenar de mayor a menor horas de estancamiento
  listaDetallada.sort((a, b) => b.horas - a.horas);

  renderTarjetasLeadTime(pendientes.length, promedioHoras, criticos24h, criticos48h);
  renderTablaLeadTime(listaDetallada);
}

function renderTarjetasLeadTime(totalPend, promedioHs, c24, c48) {
  const container = document.getElementById('grid-admin-leadtime');
  if (!container) return;

  container.innerHTML = `
    <div class="kpi-card-dark" style="border-color:#0284c7;">
      <div class="title" style="color:#38bdf8;">📥 PENDIENTES EN ESTANTERÍA</div>
      <div class="value" style="color:#38bdf8;">${totalPend.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Equipos en cola de laboratorio</div>
    </div>

    <div class="kpi-card-dark" style="border-color:#eab308;">
      <div class="title" style="color:#fde047;">⏳ TIEMPO PROMEDIO DE ESPERA</div>
      <div class="value" style="color:#fde047;">${promedioHs} <span style="font-size:1rem;">hs</span></div>
      <div class="subtext">Lead Time promedio pre-prueba</div>
    </div>

    <div class="kpi-card-dark" style="border-color:#f97316;">
      <div class="title" style="color:#fb923c;">⚠️ RETRASO MEDIO (+24 HS)</div>
      <div class="value" style="color:#fb923c;">${c24.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Mas de 1 día sin respuesta</div>
    </div>

    <div class="kpi-card-dark" style="border-color:#dc2626;">
      <div class="title" style="color:#f87171;">🚨 CUELLO DE BOTELLA (+48 HS)</div>
      <div class="value" style="color:#f87171;">${c48.toLocaleString('es-AR')} <span style="font-size:1rem;">un.</span></div>
      <div class="subtext">Atascados más de 2 días</div>
    </div>
  `;
}

function renderTablaLeadTime(lista) {
  const container = document.getElementById('tablaLeadtimeWrapper');
  if (!container) return;

  let html = `<table class="tabla-auditoria">
    <thead>
      <tr>
        <th>N° Serie (SN)</th>
        <th>Modelo / Descripción</th>
        <th style="text-align:center;">Almacén Origen</th>
        <th style="text-align:center;">Ingresado Por</th>
        <th style="text-align:center;">Fecha Carga</th>
        <th style="text-align:center;">Tiempo Parado (Hs)</th>
        <th style="text-align:center;">Estado Alerta</th>
      </tr>
    </thead>
    <tbody>`;

  if (lista.length === 0) {
    html += `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">🎉 Excelente. No hay equipos pendientes en estantería.</td></tr>`;
  } else {
    lista.forEach(item => {
      let badgeTag = '<span style="color:#16a34a; font-weight:700;">🟢 Normal</span>';
      if (item.horas >= 48) {
        badgeTag = '<span style="color:#ef4444; font-weight:800; background:#fee2e2; padding:2px 8px; border-radius:4px;">🚨 Crítico (+48h)</span>';
      } else if (item.horas >= 24) {
        badgeTag = '<span style="color:#b45309; font-weight:700; background:#fef3c7; padding:2px 8px; border-radius:4px;">⚠️ Advertencia (+24h)</span>';
      }

      html += `<tr>
        <td style="font-weight:700; color:#0284c7;">${item.sn}</td>
        <td style="font-weight:600; color:#cbd5e1;">${item.descripcion}</td>
        <td style="text-align:center; color:#94a3b8;">${item.origen}</td>
        <td style="text-align:center; color:#cbd5e1;">${item.cargadoPor}</td>
        <td style="text-align:center; color:#94a3b8; font-size:0.78rem;">${item.fechaIngreso}</td>
        <td style="text-align:center; font-weight:800; font-size:1rem; color:${item.horas >= 24 ? '#f87171' : '#4ade80'};">${item.horas} hs</td>
        <td style="text-align:center;">${badgeTag}</td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// Disparador automático
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cargarModuloAdmin);
} else {
  cargarModuloAdmin();
}