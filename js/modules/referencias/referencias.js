// ====================================================
// MÓDULO DE REFERENCIAS, CLASIFICACIÓN Y UMBRALES (RLS OK)
// ====================================================

let memoriaCatalogoMaestro = [];
let memoriaUmbralesAlmacen = new Map();
let tabActivaReferencias = 'CATALOGO'; // 'CATALOGO' | 'UMBRALES'

const LISTA_ALMACENES_CONFIG = [
  { key: 'OBE_ALM_PRINCIPAL', nombre: 'Oberá - Principal' },
  { key: 'OBE_ALM_CATRIEL', nombre: 'Oberá - Catriel (Compras)' },
  { key: 'SPD_ALM_PRINCIPAL', nombre: 'San Pedro - Principal' },
  { key: 'WND_ALM_PRINCIPAL', nombre: 'Wanda - Principal' },
  { key: 'ITU_ALM_PRINCIPAL', nombre: 'Ituzaingó - Principal' },
  { key: 'ELDO_ALM_PRINCIPAL', nombre: 'Eldorado - Principal' }
];

function obtenerClienteSupabaseRef() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) {
    const URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
    const KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
    return window.supabase.createClient(URL, KEY);
  }
  return null;
}

// --- CARGA INICIAL DEL MÓDULO ---
async function cargarModuloReferencias() {
  const wrapper = document.getElementById('tablaPreciosWrapper');
  const tagInfo = document.getElementById('tagReferencias');
  if (!wrapper) return;

  wrapper.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b; font-weight:600;">⏳ Consultando catalogo_insumos en Supabase...</div>';

  const cliente = obtenerClienteSupabaseRef();
  if (!cliente) {
    wrapper.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">❌ Error: Cliente de Supabase no inicializado.</div>';
    return;
  }

  try {
    const { data, error } = await cliente
      .from('catalogo_insumos')
      .select('*')
      .order('descripcion', { ascending: true });

    if (error) throw error;

    memoriaCatalogoMaestro = data || [];

    if (tagInfo) {
      tagInfo.textContent = `Supabase: ✅ ${memoriaCatalogoMaestro.length} insumos cargados`;
      tagInfo.className = 'file-tag ok';
    }

    renderizarEstructuraReferencias();

  } catch (err) {
    console.error('Error al cargar referencias:', err);
    wrapper.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444; font-weight:bold;">
      ❌ Error al consultar catalogo_insumos: ${err.message || JSON.stringify(err)}
    </div>`;
  }
}

// --- ESTRUCTURA DE PESTAÑAS (CATÁLOGO vs UMBRALES POR ALMACÉN) ---
function renderizarEstructuraReferencias() {
  const wrapper = document.getElementById('tablaPreciosWrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <!-- Navegación de Sub-Pestañas -->
    <div style="display:flex; gap:10px; margin-bottom:14px; border-bottom:1px solid #334155; padding-bottom:8px;">
      <button type="button" id="tab-btn-cat" onclick="cambiarTabReferencias('CATALOGO')" 
        style="padding:8px 16px; border-radius:6px; border:none; font-weight:bold; font-size:0.85rem; cursor:pointer; background:${tabActivaReferencias === 'CATALOGO' ? '#0284c7' : '#1e293b'}; color:white;">
        📋 Catálogo Maestro & Clasificación
      </button>
      <button type="button" id="tab-btn-umb" onclick="cambiarTabReferencias('UMBRALES')" 
        style="padding:8px 16px; border-radius:6px; border:none; font-weight:bold; font-size:0.85rem; cursor:pointer; background:${tabActivaReferencias === 'UMBRALES' ? '#0284c7' : '#1e293b'}; color:white;">
        ⚙️ Umbrales por Almacén (Min / PP / Max)
      </button>
    </div>

    <!-- Contenedor dinámico según la pestaña activa -->
    <div id="ref-contenido-dinamico"></div>
  `;

  if (tabActivaReferencias === 'CATALOGO') {
    renderizarContenidoCatalogo();
  } else {
    renderizarContenidoUmbrales();
  }
}

function cambiarTabReferencias(nuevaTab) {
  tabActivaReferencias = nuevaTab;
  renderizarEstructuraReferencias();
}

// ====================================================
// PESTAÑA 1: CATÁLOGO MAESTRO (CLASIFICACIÓN ABC Y GRÁFICOS)
// ====================================================
function renderizarContenidoCatalogo() {
  const contenedor = document.getElementById('ref-contenido-dinamico');
  if (!contenedor) return;

  const esSuperAdmin = (window.ROL_USUARIO === 'SUPERADMIN') || 
                       !document.querySelector('#btn-tab-admin')?.classList.contains('hidden-by-role');

  const gruposUnicos = Array.from(new Set(
    memoriaCatalogoMaestro
      .map(i => (i.grupo_grafico || '').trim())
      .filter(g => g !== '')
  )).sort();

  contenedor.innerHTML = `
    <div style="background:#0f172a; padding:14px; border-radius:8px; border:1px solid #334155; margin-bottom:16px; display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <span style="font-size:0.9rem; color:#38bdf8; font-weight:800;">⚙️ Catálogo Maestro (${memoriaCatalogoMaestro.length} ítems)</span>
        ${esSuperAdmin ? `
          <button type="button" class="btn" style="background:#166534; color:white; font-weight:bold; font-size:0.85rem;" onclick="guardarCambiosClasificacionABC()">
            💾 Guardar Clasificación y Configuración de Gráficos
          </button>
        ` : ''}
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">🔎 Buscar Nombre / Código:</label>
          <input type="text" id="ref-buscar-txt" placeholder="Ej: Drop, SC-APC..." 
                 style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" 
                 oninput="renderizarSoloTabla()">
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">🏷️ Tipo de Ítem:</label>
          <select id="ref-filtro-tipo" style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" onchange="renderizarSoloTabla()">
            <option value="TODOS" selected>Todos los Tipos</option>
            <option value="EQUIPO">EQUIPO</option>
            <option value="CABLE">CABLE</option>
            <option value="CONECTOR">CONECTOR</option>
            <option value="CONSUMIBLE">CONSUMIBLE</option>
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">📊 Categoría ABC:</label>
          <select id="ref-filtro-cat" style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" onchange="renderizarSoloTabla()">
            <option value="TODOS" selected>Todas las Categorías</option>
            <option value="A">🔵 Categoría A (Equipos)</option>
            <option value="B">🟡 Categoría B (Críticos)</option>
            <option value="C">⚪ Categoría C (Menores)</option>
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">📡 Grupo Gráfico:</label>
          <select id="ref-filtro-grupo" style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" onchange="renderizarSoloTabla()">
            <option value="TODOS" selected>Todos los Grupos</option>
            ${gruposUnicos.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div id="ref-tabla-container"></div>
  `;

  renderizarSoloTabla();
}

function renderizarSoloTabla() {
  const container = document.getElementById('ref-tabla-container');
  if (!container) return;

  const textoBusqueda = (document.getElementById('ref-buscar-txt')?.value || '').toLowerCase().trim();
  const filtroTipo = document.getElementById('ref-filtro-tipo')?.value || 'TODOS';
  const filtroCat = document.getElementById('ref-filtro-cat')?.value || 'TODOS';
  const filtroGrupo = document.getElementById('ref-filtro-grupo')?.value || 'TODOS';

  const filtrados = memoriaCatalogoMaestro.filter(item => {
    const cod = (item.codigo || '').toLowerCase();
    const desc = (item.descripcion || '').toLowerCase();
    const pasaTexto = !textoBusqueda || cod.includes(textoBusqueda) || desc.includes(textoBusqueda);
    const pasaTipo = (filtroTipo === 'TODOS') || (item.tipo_item === filtroTipo);
    const pasaCat = (filtroCat === 'TODOS') || ((item.categoria_abc || 'C') === filtroCat);
    const pasaGrupo = (filtroGrupo === 'TODOS') || ((item.grupo_grafico || '').trim() === filtroGrupo);

    return pasaTexto && pasaTipo && pasaCat && pasaGrupo;
  });

  let html = `
    <table class="tabla-auditoria" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#0f172a; color:#38bdf8;">
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Código</th>
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Descripción del Ítem</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center;">Tipo Ítem</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center;">Categoría ABC</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:100px;">En Gráfico</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:140px;">Grupo Gráfico</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (!filtrados.length) {
    html += `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">No hay ítems registrados.</td></tr>`;
  } else {
    filtrados.slice(0, 300).forEach(item => {
      const cat = item.categoria_abc || 'C';
      let borderCol = cat === 'A' ? '#0284c7' : (cat === 'B' ? '#eab308' : '#64748b');

      html += `
        <tr style="border-bottom:1px solid #cbd5e1;">
          <td style="font-weight:700; color:#0284c7; padding:8px 10px;">${item.codigo || '-'}</td>
          <td style="color:#1e293b; font-weight:600; padding:8px 10px; font-size:0.82rem;">${item.descripcion}</td>
          <td style="text-align:center; padding:8px 10px;">
            <select class="select-tipo-item" data-id="${item.id}" style="background:#0f172a; color:white; border:1px solid #334155; padding:4px; border-radius:4px; font-size:0.78rem;">
              <option value="EQUIPO" ${item.tipo_item === 'EQUIPO' ? 'selected' : ''}>EQUIPO</option>
              <option value="CABLE" ${item.tipo_item === 'CABLE' ? 'selected' : ''}>CABLE</option>
              <option value="CONECTOR" ${item.tipo_item === 'CONECTOR' ? 'selected' : ''}>CONECTOR</option>
              <option value="CONSUMIBLE" ${item.tipo_item === 'CONSUMIBLE' ? 'selected' : ''}>CONSUMIBLE</option>
            </select>
          </td>
          <td style="text-align:center; padding:8px 10px;">
            <select class="select-abc-item" data-id="${item.id}" style="background:#0f172a; color:white; border:2px solid ${borderCol}; padding:4px; border-radius:4px; font-size:0.78rem;">
              <option value="A" ${cat === 'A' ? 'selected' : ''}>🔵 Cat. A</option>
              <option value="B" ${cat === 'B' ? 'selected' : ''}>🟡 Cat. B</option>
              <option value="C" ${cat === 'C' ? 'selected' : ''}>⚪ Cat. C</option>
            </select>
          </td>
          <td style="text-align:center; padding:8px 10px;">
            <input type="checkbox" class="chk-en-grafico" data-id="${item.id}" ${item.en_grafico ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
          </td>
          <td style="text-align:center; padding:8px 10px;">
            <input type="text" class="input-grupo-grafico" data-id="${item.id}" value="${item.grupo_grafico || ''}" placeholder="Ej: Conectores" style="background:#0f172a; color:white; border:1px solid #334155; padding:4px 6px; border-radius:4px; font-size:0.78rem; width:130px; text-align:center;">
          </td>
        </tr>
      `;
    });
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderizarTablaReferencias() { renderizarEstructuraReferencias(); }

async function guardarCambiosClasificacionABC() {
  const selectsABC = document.querySelectorAll('.select-abc-item');
  const selectsTipo = document.querySelectorAll('.select-tipo-item');
  const chksGrafico = document.querySelectorAll('.chk-en-grafico');
  const inputsGrupo = document.querySelectorAll('.input-grupo-grafico');
  if (!selectsABC.length) return;

  const btnGuardar = event.target;
  btnGuardar.textContent = '⏳ Guardando...';
  btnGuardar.disabled = true;

  const cliente = obtenerClienteSupabaseRef();
  if (!cliente) {
    alert('❌ Error: Cliente de Supabase no disponible.');
    btnGuardar.disabled = false;
    return;
  }

  const registrosUpsert = [];

  selectsABC.forEach((selABC, idx) => {
    const idItem = selABC.getAttribute('data-id');
    const itemMemoria = memoriaCatalogoMaestro.find(m => String(m.id) === String(idItem));

    if (itemMemoria) {
      registrosUpsert.push({
        id: itemMemoria.id,
        descripcion: itemMemoria.descripcion,
        codigo: itemMemoria.codigo,
        precio_final: itemMemoria.precio_final,
        moneda: itemMemoria.moneda,
        categoria_abc: selABC.value,
        tipo_item: selectsTipo[idx] ? selectsTipo[idx].value : 'CONSUMIBLE',
        en_grafico: chksGrafico[idx] ? chksGrafico[idx].checked : false,
        grupo_grafico: inputsGrupo[idx] ? inputsGrupo[idx].value.trim() : '',
        activo: true
      });
    }
  });

  try {
    const { error } = await cliente
      .from('catalogo_insumos')
      .upsert(registrosUpsert, { onConflict: 'id' });

    if (error) throw error;

    btnGuardar.textContent = '✅ ¡Guardado Exitosamente!';
    btnGuardar.style.background = '#059669';

    await cargarModuloReferencias();
    if (typeof cargarStockModulo === 'function') cargarStockModulo();

    setTimeout(() => {
      btnGuardar.textContent = '💾 Guardar Clasificación y Configuración de Gráficos';
      btnGuardar.style.background = '#166534';
      btnGuardar.disabled = false;
    }, 2000);

  } catch (err) {
    console.error('Error al guardar:', err);
    alert('❌ Error al guardar en Supabase: ' + (err.message || JSON.stringify(err)));
    btnGuardar.disabled = false;
  }
}

// ====================================================
// PESTAÑA 2: MOTOR DE UMBRALES CON FILTROS DE BÚSQUEDA
// ====================================================
function renderizarContenidoUmbrales() {
  const contenedor = document.getElementById('ref-contenido-dinamico');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div style="background:#0f172a; padding:16px; border-radius:8px; border:1px solid #334155; margin-bottom:16px; display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <span style="font-size:0.9rem; color:#38bdf8; font-weight:800;">⚙️ Configuración de Umbrales de Stock (Min / PP / Max)</span>
        <span style="font-size:0.75rem; color:#94a3b8;">Los cambios se guardan automáticamente al modificar los valores.</span>
      </div>

      <!-- Barra de Filtros para Umbrales -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">📍 Depósito:</label>
          <select id="select-almacen-umbral" onchange="cargarDatosUmbralesAlmacen()" 
                  style="width:100%; background:#1e293b; border:1px solid #38bdf8; color:#f8fafc; padding:8px; border-radius:6px; font-size:0.85rem; font-weight:bold; outline:none;">
            ${LISTA_ALMACENES_CONFIG.map(a => `<option value="${a.key}">${a.nombre}</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">🔎 Buscar Ítem / Código:</label>
          <input type="text" id="umb-buscar-txt" placeholder="Ej: Conector, Drop..." 
                 style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" 
                 oninput="filtrarYRenderizarUmbrales()">
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">🏷️ Tipo de Ítem:</label>
          <select id="umb-filtro-tipo" style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" onchange="filtrarYRenderizarUmbrales()">
            <option value="TODOS" selected>Todos los Tipos</option>
            <option value="EQUIPO">EQUIPO</option>
            <option value="CABLE">CABLE</option>
            <option value="CONECTOR">CONECTOR</option>
            <option value="CONSUMIBLE">CONSUMIBLE</option>
          </select>
        </div>

        <div>
          <label style="display:block; font-size:0.75rem; color:#cbd5e1; margin-bottom:4px;">📊 Categoría ABC:</label>
          <select id="umb-filtro-cat" style="width:100%; background:#1e293b; border:1px solid #334155; color:white; padding:8px; border-radius:6px; font-size:0.85rem;" onchange="filtrarYRenderizarUmbrales()">
            <option value="TODOS">Todas las Categorías</option>
            <option value="A">🔵 Categoría A</option>
            <option value="B" selected>🟡 Categoría B (Recomendado)</option>
            <option value="C">⚪ Categoría C</option>
          </select>
        </div>
      </div>
    </div>

    <div id="tabla-umbrales-wrapper"></div>
  `;

  cargarDatosUmbralesAlmacen();
}

async function cargarDatosUmbralesAlmacen() {
  const wrapper = document.getElementById('tabla-umbrales-wrapper');
  const selectAlm = document.getElementById('select-almacen-umbral');
  if (!wrapper || !selectAlm) return;

  const almacenKey = selectAlm.value;
  wrapper.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-weight:600;">⏳ Cargando parámetros de config_stock_almacen...</div>';

  const cliente = obtenerClienteSupabaseRef();
  if (!cliente) return;

  try {
    const { data: configData, error: errConfig } = await cliente
      .from('config_stock_almacen')
      .select('*')
      .eq('almacen_key', almacenKey);

    if (errConfig) throw errConfig;

    memoriaUmbralesAlmacen.clear();
    if (configData) {
      configData.forEach(conf => {
        if (conf.codigo) memoriaUmbralesAlmacen.set(conf.codigo.trim().toUpperCase(), conf);
      });
    }

    filtrarYRenderizarUmbrales();

  } catch (err) {
    console.error('Error al cargar config_stock_almacen:', err);
    wrapper.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444; font-weight:bold;">
      ❌ ${err.message || 'Error al consultar config_stock_almacen'}
    </div>`;
  }
}

function filtrarYRenderizarUmbrales() {
  const wrapper = document.getElementById('tabla-umbrales-wrapper');
  const selectAlm = document.getElementById('select-almacen-umbral');
  if (!wrapper || !selectAlm) return;

  const almacenKey = selectAlm.value;
  const txtBusqueda = (document.getElementById('umb-buscar-txt')?.value || '').toLowerCase().trim();
  const filtroTipo = document.getElementById('umb-filtro-tipo')?.value || 'TODOS';
  const filtroCat = document.getElementById('umb-filtro-cat')?.value || 'TODOS';

  const filtrados = memoriaCatalogoMaestro.filter(item => {
    const cod = (item.codigo || '').toLowerCase();
    const desc = (item.descripcion || '').toLowerCase();
    const pasaTexto = !txtBusqueda || cod.includes(txtBusqueda) || desc.includes(txtBusqueda);
    const pasaTipo = (filtroTipo === 'TODOS') || (item.tipo_item === filtroTipo);
    const pasaCat = (filtroCat === 'TODOS') || ((item.categoria_abc || 'C') === filtroCat);

    return pasaTexto && pasaTipo && pasaCat;
  });

  let html = `
    <table class="tabla-auditoria" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#0f172a; color:#38bdf8;">
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Código</th>
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Descripción del Ítem</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Stock Mínimo 🔴</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Punto Pedido 🟡</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Stock Máximo 🟢</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:80px;">Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (!filtrados.length) {
    html += `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">No se encontraron ítems con los filtros seleccionados.</td></tr>`;
  } else {
    filtrados.forEach(item => {
      const codUpper = (item.codigo || '').trim().toUpperCase();
      const conf = memoriaUmbralesAlmacen.get(codUpper) || { stock_minimo: 0, punto_pedido: 0, stock_maximo: 0 };

      html += `
        <tr style="border-bottom:1px solid #cbd5e1;">
          <td style="font-weight:700; color:#0284c7; padding:8px 10px;">${item.codigo || '-'}</td>
          <td style="color:#1e293b; font-weight:600; padding:8px 10px; font-size:0.82rem;">${item.descripcion}</td>
          
          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.stock_minimo || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'stock_minimo', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.punto_pedido || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'punto_pedido', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.stock_maximo || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'stock_maximo', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px; font-size:0.9rem;" id="status-umb-${codUpper}">-</td>
        </tr>
      `;
    });
  }

  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

async function cargarDatosUmbralesAlmacen() {
  const wrapper = document.getElementById('tabla-umbrales-wrapper');
  const selectAlm = document.getElementById('select-almacen-umbral');
  if (!wrapper || !selectAlm) return;

  const almacenKey = selectAlm.value;
  wrapper.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-weight:600;">⏳ Cargando parámetros de config_stock_almacen...</div>';

  const cliente = obtenerClienteSupabaseRef();
  if (!cliente) {
    wrapper.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">❌ Error: Cliente Supabase no disponible.</div>';
    return;
  }

  try {
    // Consulta con RLS a config_stock_almacen
    const { data: configData, error: errConfig } = await cliente
      .from('config_stock_almacen')
      .select('*')
      .eq('almacen_key', almacenKey);

    if (errConfig) {
      if (errConfig.code === '42501' || (errConfig.message && errConfig.message.includes('row-level security'))) {
        throw new Error('Permiso denegado por RLS en "config_stock_almacen". Verificá las políticas SELECT en Supabase.');
      }
      throw errConfig;
    }

    memoriaUmbralesAlmacen.clear();
    if (configData) {
      configData.forEach(conf => {
        if (conf.codigo) memoriaUmbralesAlmacen.set(conf.codigo.trim().toUpperCase(), conf);
      });
    }

    renderizarTablaUmbrales(almacenKey);

  } catch (err) {
    console.error('Error al cargar config_stock_almacen:', err);
    wrapper.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444; font-weight:bold;">
      ❌ ${err.message || 'Error al consultar config_stock_almacen'}
    </div>`;
  }
}

function renderizarTablaUmbrales(almacenKey) {
  const wrapper = document.getElementById('tabla-umbrales-wrapper');
  if (!wrapper) return;

  let html = `
    <table class="tabla-auditoria" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#0f172a; color:#38bdf8;">
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Código</th>
          <th style="padding:10px; border:1px solid #334155; text-align:left;">Descripción del Ítem</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Stock Mínimo 🔴</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Punto Pedido 🟡</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:110px;">Stock Máximo 🟢</th>
          <th style="padding:10px; border:1px solid #334155; text-align:center; width:80px;">Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (!memoriaCatalogoMaestro.length) {
    html += `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">No hay ítems registrados en el catálogo.</td></tr>`;
  } else {
    memoriaCatalogoMaestro.forEach(item => {
      const codUpper = (item.codigo || '').trim().toUpperCase();
      const conf = memoriaUmbralesAlmacen.get(codUpper) || { stock_minimo: 0, punto_pedido: 0, stock_maximo: 0 };

      html += `
        <tr style="border-bottom:1px solid #cbd5e1;">
          <td style="font-weight:700; color:#0284c7; padding:8px 10px;">${item.codigo || '-'}</td>
          <td style="color:#1e293b; font-weight:600; padding:8px 10px; font-size:0.82rem;">${item.descripcion}</td>
          
          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.stock_minimo || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'stock_minimo', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.punto_pedido || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'punto_pedido', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px;">
            <input type="number" value="${conf.stock_maximo || 0}" min="0" 
                   onblur="guardarUmbralAlmacen(this, '${item.codigo}', '${item.descripcion.replace(/'/g, "\\'")}', 'stock_maximo', '${almacenKey}')" 
                   style="width:75px; text-align:center; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:4px; font-weight:bold;">
          </td>

          <td style="text-align:center; padding:6px; font-size:0.9rem;" id="status-umb-${codUpper}">-</td>
        </tr>
      `;
    });
  }

  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

// --- GUARDADO AUTOMÁTICO VÍA UPSERT CON MANEJO DE ERRORES RLS ---
async function guardarUmbralAlmacen(inputHTML, codigo, descripcion, campo, almacenKey) {
  const codUpper = (codigo || '').trim().toUpperCase();
  const valor = parseInt(inputHTML.value, 10) || 0;
  const statusTd = document.getElementById(`status-umb-${codUpper}`);

  if (statusTd) statusTd.innerHTML = '⏳';

  const cliente = obtenerClienteSupabaseRef();
  if (!cliente) {
    if (statusTd) statusTd.innerHTML = '❌';
    alert('❌ Cliente Supabase no disponible');
    return;
  }

  try {
    // Lectura actual o valor inicial
    const confActual = memoriaUmbralesAlmacen.get(codUpper) || {
      codigo: codUpper,
      descripcion: descripcion,
      almacen_key: almacenKey,
      stock_minimo: 0,
      punto_pedido: 0,
      stock_maximo: 0
    };

    confActual[campo] = valor;
    confActual.updated_at = new Date().toISOString();

    // Guardado por UPSERT respetando la restricción UNIQUE(codigo, almacen_key)
    const { error } = await cliente
      .from('config_stock_almacen')
      .upsert({
        codigo: confActual.codigo,
        descripcion: confActual.descripcion,
        almacen_key: almacenKey,
        stock_minimo: confActual.stock_minimo,
        punto_pedido: confActual.punto_pedido,
        stock_maximo: confActual.stock_maximo,
        updated_at: confActual.updated_at
      }, { onConflict: 'codigo, almacen_key' });

    if (error) {
      if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
        throw new Error('Permiso de escritura denegado por RLS. Habilitá las políticas INSERT/UPDATE en Supabase para config_stock_almacen.');
      }
      throw error;
    }

    memoriaUmbralesAlmacen.set(codUpper, confActual);

    if (statusTd) {
      statusTd.innerHTML = '✅';
      setTimeout(() => { statusTd.innerHTML = '-'; }, 1800);
    }

  } catch (err) {
    console.error('Error al guardar umbral:', err);
    if (statusTd) statusTd.innerHTML = '❌';
    alert(`❌ No se pudo guardar: ${err.message || JSON.stringify(err)}`);
  }
}