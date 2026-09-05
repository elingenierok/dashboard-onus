// ====================================================
// MÓDULO DE STOCK: EQUIPOS Y ONUS (CATEGORÍA A)
// ====================================================

const SUPABASE_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const COSTO_POR_DEFECTO = 0;

window.EstadoStock = {
  cargado: false,
  totalDualBand: 0,
  totalCatv: 0,
  totalNuevos: 0,
  totalUsados: 0,
  totalOperativo: 0,
  costoTotalUsd: 0,
  devolucionesCant: 0,
  devolucionesValorUsd: 0,
  descarteCant: 0,
  descarteValorUsd: 0,
  descarteVipCant: 0,
  descarteVipValorUsd: 0,
  catrielCant: 0,
  fechaSincronizacion: '--/--/----'
};

const SUCURSALES = [
  'OBE_ALM_PRINCIPAL', 
  'OBE_ALM_CATRIEL', 
  'SPD_ALM_PRINCIPAL', 
  'WND_ALM_PRINCIPAL', 
  'ITU_ALM_PRINCIPAL', 
  'ELDO_ALM_PRINCIPAL'
];
const SUCURSALES_CORTAS = ['OBE PRINC', 'OBE CATR', 'SPD PRINC', 'WND PRINC', 'ITU PRINC', 'ELD PRINC'];

const LISTA_AUDITORIA = [
  { key: 'OBE_ALM_PRINCIPAL', nombre: 'OBE Principal' },
  { key: 'OBE_ALM_CATRIEL', nombre: 'OBE Catriel (Compras)' },
  { key: 'OBE_ALM_DEVOLUCIONES', nombre: 'OBE Devoluciones (Triage)' },
  { key: 'OBE_ALM_DESCARTE', nombre: 'OBE Descarte (Inmovilizado)' },
  { key: 'SPD_ALM_PRINCIPAL', nombre: 'San Pedro Principal' },
  { key: 'WND_ALM_PRINCIPAL', nombre: 'Wanda Principal' },
  { key: 'ITU_ALM_PRINCIPAL', nombre: 'Ituzaingó Principal' },
  { key: 'ELDO_ALM_PRINCIPAL', nombre: 'Eldorado Principal' }
];

let stockData = [];
let mapaPrecios = new Map();
let catalogoEquiposMemoria = [];
let catalogoInsumosMemoria = []; 
let kpiChart = null; 

// --- FUNCIONES AUXILIARES GLOBALES ---
window.normalizar = function(str) {
  return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();
};

window.perteneceASucursal = function(almacenKey, sucActiva) {
  if (!sucActiva || sucActiva === 'TODAS' || sucActiva === 'ALL') return true;
  const raw = (almacenKey || '').trim().toUpperCase();
  if (sucActiva === 'OBE') return raw.startsWith('OBE_') || raw.includes('OBERA');
  if (sucActiva === 'SPD') return raw.startsWith('SPD_') || raw.includes('SAN_PEDRO') || raw.includes('SAN PEDRO');
  if (sucActiva === 'WND') return raw.startsWith('WND_') || raw.startsWith('WND-') || raw.includes('WANDA');
  if (sucActiva === 'ITU') return raw.startsWith('ITU_') || raw.includes('ITUZAINGO');
  if (sucActiva === 'ELDO') return raw.startsWith('ELDO_') || raw.includes('ELDORADO');
  return raw.includes(sucActiva);
};

function toggleGrupoStock(claseGrupo) {
  const filas = document.querySelectorAll(`.${claseGrupo}`);
  const flecha = document.getElementById(`arrow-${claseGrupo}`);
  let mostrando = false;

  filas.forEach(f => {
    if (f.style.display === 'none' || f.style.display === '') {
      f.style.display = 'table-row';
      mostrando = true;
    } else {
      f.style.display = 'none';
    }
  });
  if (flecha) flecha.textContent = mostrando ? '▼' : '▶';
}

window.obtenerClasificacionABC = function(descNorm, codUpper = '') {
  const cat = window.catalogoInsumosMemoria || catalogoInsumosMemoria;
  if (!cat || !cat.length) return null;

  if (codUpper && codUpper !== '' && codUpper !== '-') {
    const matchCodigo = cat.find(item => 
      item.codigo && item.codigo.trim().toUpperCase() === codUpper
    );
    if (matchCodigo) return matchCodigo;
  }

  return cat.find(item => {
    const patronNorm = window.normalizar(item.descripcion);
    return descNorm === patronNorm;
  }) || null;
};

function resolverInfoEquipo(descNorm, sucActiva) {
  const coincidencias = catalogoEquiposMemoria.filter(item => {
    const itemNorm = item.modelo_norm || window.normalizar(item.modelo);
    return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
  });
  if (!coincidencias.length) return null;

  let match = coincidencias.find(c => c.sucursal_id === sucActiva);
  if (!match) match = coincidencias.find(c => c.sucursal_id === 'GLOBAL');
  if (!match) match = coincidencias.find(c => c.sucursal_id === 'OBE');
  if (!match) match = coincidencias[0];
  return match;
}

// --- CONSULTA A SUPABASE CON PAGINACIÓN COMPLETA Y UMBRALES ---
async function cargarStockModulo() {
  const tagCSV = document.getElementById('tagCSV');
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  if (tagCSV) {
    tagCSV.textContent = `Supabase: ⏳ Consultando... [${sucActiva}]`;
    tagCSV.className = 'file-tag no';
  }

  try {
    // 1. Obtener la última fecha de registro
    const { data: ult, error: errUlt } = await supabaseClient
      .from('registro_stock')
      .select('fecha_registro, created_at')
      .order('fecha_registro', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (errUlt) throw errUlt;
    if (!ult || !ult.length) throw new Error('Sin datos de stock');

    const ultimaFecha = ult[0].fecha_registro;
    const marcaTiempo = ult[0].created_at;

    // 2. Consultar catálogos Y la nueva tabla config_stock_almacen en paralelo
    const [resInsumos, resCat, resConfig] = await Promise.all([
      supabaseClient.from('catalogo_insumos').select('*').eq('activo', true),
      supabaseClient.from('catalogo_equipos').select('*'),
      supabaseClient.from('config_stock_almacen').select('*') // 👈 NUEVA CONSULTA DE UMBRALES
    ]);

    catalogoEquiposMemoria = resCat.data || [];
    catalogoInsumosMemoria = resInsumos.data || [];
    
    // Exportar a memoria global para el resto de los módulos
    window.catalogoInsumosMemoria = catalogoInsumosMemoria;
    window.configUmbralesMemoria = resConfig.data || []; // 👈 DISPONIBLE EN MEMORIA GLOBAL

    // 3. PAGINACIÓN: Traer TODAS las filas de registro_stock para la última fecha
    let todosLosRegistrosStock = [];
    let desde = 0;
    const tamanoPagina = 1000;
    let tieneMasPaginas = true;

    while (tieneMasPaginas) {
      const { data: pagina, error: errPag } = await supabaseClient
        .from('registro_stock')
        .select('codigo, descripcion, stock_total, almacen')
        .eq('fecha_registro', ultimaFecha)
        .range(desde, desde + tamanoPagina - 1);

      if (errPag) throw errPag;

      if (pagina && pagina.length > 0) {
        todosLosRegistrosStock = todosLosRegistrosStock.concat(pagina);
        if (pagina.length < tamanoPagina) {
          tieneMasPaginas = false;
        } else {
          desde += tamanoPagina;
        }
      } else {
        tieneMasPaginas = false;
      }
    }

    console.log(`📦 [STOCK SUCCESS] Total filas descargadas de Supabase: ${todosLosRegistrosStock.length}`);

    // 4. Mapear datos a la memoria de la aplicación
    stockData = todosLosRegistrosStock.map(d => {
      let rawAlm = (d.almacen || '').trim().toUpperCase();
      if (rawAlm === 'SPD_PRINCIPAL' || rawAlm === 'SPD_ALM_PRINCIPAL') rawAlm = 'SPD_ALM_PRINCIPAL';
      if (rawAlm === 'WND-PRINCIPAL' || rawAlm === 'WND_PRINCIPAL' || rawAlm === 'WND_ALM_PRINCIPAL') rawAlm = 'WND_ALM_PRINCIPAL';

      return {
        codigo: (d.codigo || '').trim().toUpperCase(),
        descripcion: (d.descripcion || '').trim(),
        stock: parseInt(d.stock_total, 10) || 0,
        almacen: rawAlm
      };
    });

    mapaPrecios.clear();
    catalogoInsumosMemoria.forEach(p => {
      const val = parseFloat(p.precio_final) || 0;
      if (p.codigo) mapaPrecios.set(p.codigo.trim().toUpperCase(), val);
      if (p.descripcion) mapaPrecios.set(window.normalizar(p.descripcion), val);
    });

    const fechaObj = new Date(marcaTiempo);
    const diaFormat = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaFormat = fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    if (tagCSV) {
      tagCSV.textContent = `Supabase: ✅ ${diaFormat} ${horaFormat} hs [${sucActiva}] (${stockData.length} ítems)`;
      tagCSV.className = 'file-tag ok';
    }

    // 5. Procesar ONUs (Cat A) e Insumos (Cat B)
    procesarYRenderizarStock(`${diaFormat} ${horaFormat} hs`);

    if (typeof cargarModuloReferencias === 'function') {
      cargarModuloReferencias();
    }

  } catch (err) {
    console.error('Error al consultar Supabase:', err);
    if (tagCSV) {
      tagCSV.textContent = `Supabase: ❌ ${err.message || 'Error'}`;
      tagCSV.className = 'file-tag no';
    }
  }
}

// --- PROCESAMIENTO EXCLUSIVO DE EQUIPOS ONUs (CAT. A) ---
function procesarYRenderizarStock(fechaSincroStr = '--/--/----') {
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  let stratDB = 0, stratCATV = 0, stratTotal = 0, stratValorUSD = 0;
  let stratNuevos = 0, stratUsados = 0;

  const arbolEstrategico = {};
  SUCURSALES.forEach(s => arbolEstrategico[s] = { DB: 0, CATV: 0 });

  let devCant = 0, devCatvCant = 0, valorDevoluciones = 0;
  let descCant = 0, valorDescarte = 0;
  let descVipCant = 0, valorDescVip = 0; 
  let catrielCant = 0;

  const itemsDev = {};
  const itemsDesc = {};
  const itemsDescVip = {}; 
  const itemsCatriel = {};

  const arbolOperativo = {};
  SUCURSALES.forEach(s => arbolOperativo[s] = { DB: 0, CATV: 0, Otras: 0, itemsDB: {}, itemsCATV: {}, itemsOtras: {} });

  stockData.forEach(row => {
    if (!window.perteneceASucursal(row.almacen, sucActiva)) return;

    const descNorm = window.normalizar(row.descripcion);
    const codUpper = (row.codigo || '').trim().toUpperCase();
    
    const itemABC = window.obtenerClasificacionABC(descNorm, codUpper);
    
    if (!itemABC || itemABC.categoria_abc !== 'A') return; 

    const infoCat = resolverInfoEquipo(descNorm, sucActiva);
    const esAlmacenPrincipal = SUCURSALES.includes(row.almacen);
    const precioUnitario = (infoCat && parseFloat(infoCat.precio_usd) > 0)
      ? parseFloat(infoCat.precio_usd)
      : (mapaPrecios.get(row.codigo) || mapaPrecios.get(descNorm) || COSTO_POR_DEFECTO);
    const valorFila = row.stock * precioUnitario;

    const esVIP = infoCat ? infoCat.es_vip : false;
    const catNombre = infoCat ? (infoCat.categoria || '').toUpperCase() : '';

    const esVIP_DB = esVIP && catNombre === 'DUAL_BAND';
    const esVIP_CATV = esVIP && catNombre === 'CATV';

    if (esAlmacenPrincipal && (esVIP_DB || esVIP_CATV)) {
      stratTotal += row.stock;
      stratValorUSD += valorFila;

      if (esVIP_DB) {
        stratDB += row.stock;
        if (arbolEstrategico[row.almacen]) arbolEstrategico[row.almacen].DB += row.stock;
      } else if (esVIP_CATV) {
        stratCATV += row.stock;
        if (arbolEstrategico[row.almacen]) arbolEstrategico[row.almacen].CATV += row.stock;
      }

      if (descNorm.includes('USAD')) {
        stratUsados += row.stock;
      } else {
        stratNuevos += row.stock;
      }
    }

    if (esAlmacenPrincipal && arbolOperativo[row.almacen]) {
      if (esVIP_DB) {
        arbolOperativo[row.almacen].DB += row.stock;
        arbolOperativo[row.almacen].itemsDB[row.descripcion] = (arbolOperativo[row.almacen].itemsDB[row.descripcion] || 0) + row.stock;
      } else if (esVIP_CATV) {
        arbolOperativo[row.almacen].CATV += row.stock;
        arbolOperativo[row.almacen].itemsCATV[row.descripcion] = (arbolOperativo[row.almacen].itemsCATV[row.descripcion] || 0) + row.stock;
      } else {
        arbolOperativo[row.almacen].Otras += row.stock;
        arbolOperativo[row.almacen].itemsOtras[row.descripcion] = (arbolOperativo[row.almacen].itemsOtras[row.descripcion] || 0) + row.stock;
      }

      if (row.almacen.includes('CATRIEL') && (esVIP_DB || esVIP_CATV)) {
        catrielCant += row.stock;
        itemsCatriel[row.descripcion] = (itemsCatriel[row.descripcion] || 0) + row.stock;
      }
    } 
    else if (row.almacen.includes('DEVOLUCION') || row.almacen.includes('TRIAGE')) {
      devCant += row.stock;
      valorDevoluciones += valorFila;
      itemsDev[row.descripcion] = (itemsDev[row.descripcion] || 0) + row.stock;
      if (esVIP_CATV) devCatvCant += row.stock;
    } 
    else if (row.almacen.includes('DESCARTE_VIP')) {
      if (esVIP_DB || esVIP_CATV) {
        descVipCant += row.stock;
        valorDescVip += valorFila;
        itemsDescVip[row.descripcion] = (itemsDescVip[row.descripcion] || 0) + row.stock;
      }
    }
    else if (row.almacen.includes('DESCARTE')) {
      descCant += row.stock;
      valorDescarte += valorFila;
      itemsDesc[row.descripcion] = (itemsDesc[row.descripcion] || 0) + row.stock;
    }
  });
  
  window.EstadoStock.cargado = true;
  window.EstadoStock.totalDualBand = stratDB;
  window.EstadoStock.totalCatv = stratCATV;
  window.EstadoStock.totalNuevos = stratNuevos;
  window.EstadoStock.totalUsados = stratUsados;
  window.EstadoStock.totalOperativo = stratTotal;
  window.EstadoStock.costoTotalUsd = stratValorUSD;
  window.EstadoStock.fechaSincronizacion = fechaSincroStr;

  renderStockEstrategicoOnus(stratDB, stratCATV, stratNuevos, stratUsados, stratTotal, stratValorUSD, arbolEstrategico);
  renderStockOperativo(arbolOperativo);
  renderStockTactico(devCant, devCatvCant, valorDevoluciones, descCant, valorDescarte, descVipCant, valorDescVip, catrielCant, itemsDev, itemsDesc, itemsDescVip, itemsCatriel);
  renderAuditoriaTabla();
  
  // Ejecuta la Categoría B reutilizando el catálogo expuesto en memoria
  if (typeof window.procesarInsumosB === 'function') {
    window.procesarInsumosB(
      stockData, 
      sucActiva, 
      mapaPrecios, 
      window.catalogoInsumosMemoria,
      window.configUmbralesMemoria // 👈 5to parámetro: los umbrales cargados de Supabase
    );
  }
}

// --- RENDER GRÁFICO 1: EQUIPOS ---
function renderStockEstrategicoOnus(db, catv, nuevos, usados, total, valorGlobal, arbol) {
  const pctDB = total > 0 ? Math.round((db / total) * 100) : 0;
  const pctCATV = total > 0 ? Math.round((catv / total) * 100) : 0;

  if (document.getElementById('val-db')) document.getElementById('val-db').textContent = db.toLocaleString('es-AR');
  if (document.getElementById('pct-db')) document.getElementById('pct-db').textContent = `(${pctDB}%)`;
  if (document.getElementById('val-catv')) document.getElementById('val-catv').textContent = catv.toLocaleString('es-AR');
  if (document.getElementById('pct-catv')) document.getElementById('pct-catv').textContent = `(${pctCATV}%)`;
  if (document.getElementById('val-total')) document.getElementById('val-total').textContent = `${total.toLocaleString('es-AR')} un.`;
  if (document.getElementById('val-costo')) document.getElementById('val-costo').textContent = `$ ${Math.round(valorGlobal).toLocaleString('es-AR')} USD`;

  const canvasA = document.getElementById('kpiStackedChart');
  if (canvasA) {
    const ctxA = canvasA.getContext('2d');
    const chartDataA = {
      labels: ['Tecnología VIP', 'Condición VIP'],
      datasets: [
        { label: 'Dual Band VIP', data: [db, 0], backgroundColor: '#0284c7', borderRadius: 4 },
        { label: 'CATV VIP', data: [catv, 0], backgroundColor: '#ea580c', borderRadius: 4 },
        { label: 'Nuevos', data: [0, nuevos], backgroundColor: '#22c55e', borderRadius: 4 },
        { label: 'Usados / Reacond.', data: [0, usados], backgroundColor: '#eab308', borderRadius: 4 }
      ]
    };

    if (kpiChart) {
      kpiChart.arbolRef = arbol;
      kpiChart.data = chartDataA;
      kpiChart.update();
    } else {
      kpiChart = new Chart(ctxA, {
        type: 'bar',
        data: chartDataA,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 10, weight: 'bold' }, boxWidth: 10 } },
            tooltip: { backgroundColor: '#0f172a', titleColor: '#38bdf8', bodyColor: '#f8fafc', borderColor: '#334155', borderWidth: 1 }
          },
          scales: {
            x: { stacked: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
            y: { stacked: true, grid: { display: false }, ticks: { color: '#f8fafc', font: { size: 10, weight: 'bold' } } }
          }
        }
      });
      kpiChart.arbolRef = arbol;
    }
  }
}

// --- RENDER TABLAS DE OPERATIVO Y AUDITORÍA ---
async function renderAuditoriaTabla() {
  const wrapper = document.getElementById('tablaAuditoriaWrapper');
  if (!wrapper) return;
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  try {
    const { data: audData } = await supabaseClient.from('auditoria_control_activo').select('*');
    const mapAuditoria = new Map();
    if (audData) audData.forEach(item => mapAuditoria.set(item.almacen_key, item));

    const listaFiltrada = LISTA_AUDITORIA.filter(item => window.perteneceASucursal(item.key, sucActiva));

    let html = `<table class="tabla-auditoria">
      <thead>
        <tr>
          <th>Almacén / Depósito</th>
          <th style="text-align:center;">Stock Sistema (ONUs)</th>
          <th style="text-align:center;">Stock Físico Real</th>
          <th style="text-align:center;">Detalle de Desviación</th>
          <th style="text-align:center;">Desv. Absoluta (%)</th>
          <th style="text-align:center;">Última Inspección</th>
        </tr>
      </thead>
      <tbody>`;

    listaFiltrada.forEach(item => {
      const stockSistemaCalculado = stockData.reduce((acc, d) => {
        const dNorm = window.normalizar(d.descripcion);
        const itemABC = window.obtenerClasificacionABC(dNorm, d.codigo);
        const esCatA = itemABC ? (itemABC.categoria_abc === 'A') : dNorm.includes('ONU');
        return (d.almacen === item.key && esCatA) ? acc + d.stock : acc;
      }, 0);

      const audInfo = mapAuditoria.get(item.key);
      let stockSistema = stockSistemaCalculado;
      let stockFisico = stockSistemaCalculado;
      let tagDesviacion = '<span class="tag-sin-desviacion">🟢 Exacto (0)</span>';
      let pctDesv = '0.0%';
      let fechaInspStr = '<span style="color:#94a3b8; font-style:italic;">Al día</span>';

      if (audInfo && audInfo.fecha_inspeccion) {
        stockSistema = audInfo.stock_sistema;
        stockFisico = audInfo.stock_fisico;
        const dif = audInfo.diferencia;
        pctDesv = `${parseFloat(audInfo.desviacion_pct || 0).toFixed(1)}%`;
        if (dif === 0) tagDesviacion = '<span class="tag-sin-desviacion">🟢 Exacto (0)</span>';
        else if (dif < 0) tagDesviacion = `<span style="color:#ef4444; font-weight:700; background:#fee2e2; padding:2px 8px; border-radius:4px;">🔴 Faltan ${Math.abs(dif)} un.</span>`;
        else tagDesviacion = `<span style="color:#0284c7; font-weight:700; background:#e0f2fe; padding:2px 8px; border-radius:4px;">🔵 Sobran ${dif} un.</span>`;

        const f = new Date(audInfo.fecha_inspeccion);
        fechaInspStr = `<span class="tag-fecha-ok">${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</span>`;
      } else if (audInfo && audInfo.fecha_snapshot) {
        stockSistema = audInfo.stock_sistema;
        stockFisico = 0;
        tagDesviacion = '<span style="color:#b45309; font-weight:700; background:#fef3c7; padding:2px 8px; border-radius:4px;">⏳ Pendiente</span>';
        pctDesv = '100.0%';
        fechaInspStr = '<span class="tag-fecha-warn">Sin Inspeccionar</span>';
      }

      html += `<tr>
        <td style="font-weight:600; color:#334155;">${item.nombre}</td>
        <td style="text-align:center; font-weight:700;">${stockSistema.toLocaleString('es-AR')} un.</td>
        <td style="text-align:center; color:#0284c7; font-weight:700;">${stockFisico.toLocaleString('es-AR')} un.</td>
        <td style="text-align:center;">${tagDesviacion}</td>
        <td style="text-align:center; font-weight:700;">${pctDesv}</td>
        <td style="text-align:center;">${fechaInspStr}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    wrapper.innerHTML = html;
  } catch (err) {
    console.error('Error al renderizar auditoría:', err);
  }
}

function renderStockOperativo(arbol) {
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';
  const indicesVisibles = [];
  SUCURSALES.forEach((s, idx) => { if (window.perteneceASucursal(s, sucActiva)) indicesVisibles.push(idx); });

  const sucursalesFiltradas = indicesVisibles.map(i => SUCURSALES[i]);
  const sucursalesCortasFiltradas = indicesVisibles.map(i => SUCURSALES_CORTAS[i]);

  let totDB = 0, totCATV = 0, totOtras = 0;
  sucursalesFiltradas.forEach(s => {
    totDB += arbol[s]?.DB || 0;
    totCATV += arbol[s]?.CATV || 0;
    totOtras += arbol[s]?.Otras || 0;
  });

  const catvModels = new Set();
  const dbModels = new Set();
  const otrasModels = new Set();

  sucursalesFiltradas.forEach(s => {
    Object.keys(arbol[s]?.itemsCATV || {}).forEach(m => catvModels.add(m));
    Object.keys(arbol[s]?.itemsDB || {}).forEach(m => dbModels.add(m));
    Object.keys(arbol[s]?.itemsOtras || {}).forEach(m => otrasModels.add(m));
  });

  let html = '<table class="arbol" style="width:100%; border-collapse:collapse; text-align:left;">';
  html += `<thead>
    <tr>
      <td class="celda-total" colspan="${sucursalesFiltradas.length + 1}" style="background:#0f172a; color:#f8fafc; font-weight:800; padding:10px; text-align:center;">
        📦 TOTAL ONUs [${sucActiva}]: ${(totDB + totCATV + totOtras).toLocaleString('es-AR')} (VIP: ${(totDB + totCATV).toLocaleString('es-AR')} | Otras ONUs: ${totOtras.toLocaleString('es-AR')})
      </td>
    </tr>
    <tr style="background:#1e293b; color:#38bdf8;">
      <th style="padding:10px; border:1px solid #334155;">Modelo / Descripción de ONU</th>`;
  
  sucursalesCortasFiltradas.forEach(suc => {
    html += `<th style="padding:10px; border:1px solid #334155; text-align:center; min-width:85px;">${suc}</th>`;
  });
  html += `</tr></thead><tbody>`;

  if (catvModels.size > 0) {
    html += `<tr onclick="toggleGrupoStock('catv-rows')" style="cursor:pointer;">
      <td style="background:#ffedd5; color:#c2410c; font-weight:800; padding:8px 10px; border:1px solid #fed7aa;">
        <span id="arrow-catv-rows" style="display:inline-block; width:15px;">▶</span> 🟠 CATV VIP (${totCATV.toLocaleString('es-AR')} un.)
      </td>`;
    sucursalesFiltradas.forEach(s => {
      const totalCatvSucursal = arbol[s]?.CATV || 0;
      html += `<td style="background:#ffedd5; color:#c2410c; font-weight:800; padding:8px 10px; border:1px solid #fed7aa; text-align:center;">
        ${totalCatvSucursal > 0 ? totalCatvSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(catvModels).sort().forEach(modelo => {
      html += `<tr class="catv-rows" style="display:none; border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#1e293b; padding-left:25px;">${modelo}</td>`;
      sucursalesFiltradas.forEach(s => {
        const cant = arbol[s]?.itemsCATV[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#ea580c;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  if (dbModels.size > 0) {
    html += `<tr onclick="toggleGrupoStock('db-rows')" style="cursor:pointer;">
      <td style="background:#e0f2fe; color:#0369a1; font-weight:800; padding:8px 10px; border:1px solid #bae6fd;">
        <span id="arrow-db-rows" style="display:inline-block; width:15px;">▶</span> 🔵 DUAL BAND VIP (${totDB.toLocaleString('es-AR')} un.)
      </td>`;
    sucursalesFiltradas.forEach(s => {
      const totalDbSucursal = arbol[s]?.DB || 0;
      html += `<td style="background:#e0f2fe; color:#0369a1; font-weight:800; padding:8px 10px; border:1px solid #bae6fd; text-align:center;">
        ${totalDbSucursal > 0 ? totalDbSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(dbModels).sort().forEach(modelo => {
      html += `<tr class="db-rows" style="display:none; border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#1e293b; padding-left:25px;">${modelo}</td>`;
      sucursalesFiltradas.forEach(s => {
        const cant = arbol[s]?.itemsDB[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#0284c7;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  if (otrasModels.size > 0) {
    html += `<tr onclick="toggleGrupoStock('otras-rows')" style="cursor:pointer;">
      <td style="background:#f1f5f9; color:#475569; font-weight:800; padding:8px 10px; border:1px solid #cbd5e1;">
        <span id="arrow-otras-rows" style="display:inline-block; width:15px;">▶</span> ⚙️ OTRAS ONUs / LEGACY (${totOtras.toLocaleString('es-AR')} un.)
      </td>`;
    sucursalesFiltradas.forEach(s => {
      const totalOtrasSucursal = arbol[s]?.Otras || 0;
      html += `<td style="background:#f1f5f9; color:#475569; font-weight:800; padding:8px 10px; border:1px solid #cbd5e1; text-align:center;">
        ${totalOtrasSucursal > 0 ? totalOtrasSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(otrasModels).sort().forEach(modelo => {
      html += `<tr class="otras-rows" style="display:none; border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#334155; padding-left:25px;">${modelo}</td>`;
      sucursalesFiltradas.forEach(s => {
        const cant = arbol[s]?.itemsOtras[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#64748b;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  html += '</tbody></table>';
  document.getElementById('tablaWrapper').innerHTML = html;
}

function renderStockTactico(devCant, devCatvCant, valDev, descCant, valDesc, descVipCant, valDescVip, catrielCant, itemsDev, itemsDesc, itemsDescVip, itemsCatriel) {
  const grid = document.getElementById('grid-tactico-cards');
  if (!grid) return;

  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  const renderDesglose = (itemsObj, idTag) => {
    const keys = Object.keys(itemsObj);
    if (!keys.length) return `<div id="${idTag}" style="display:none; padding:8px; font-size:0.75rem; color:#94a3b8; text-align:center;">Sin ítems en esta categoría</div>`;
    
    let listHtml = keys.sort().map(k => `
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; padding:3px 0; border-bottom:1px solid #334155; color:#cbd5e1;">
        <span>${k}</span>
        <strong style="color:#f8fafc;">${itemsObj[k]} un.</strong>
      </div>
    `).join('');
    
    return `<div id="${idTag}" style="display:none; margin-top:8px; max-height:130px; overflow-y:auto; background:#0f172a; padding:6px 8px; border-radius:6px; border:1px solid #334155;">${listHtml}</div>`;
  };

  grid.innerHTML = `
    <!-- 1. DEVOLUCIONES / TRIAGE -->
    <div class="card-tactico" style="background:#1e293b; border:1px solid #334155; padding:14px; border-radius:10px; flex:1; min-width:210px;">
      <div style="font-size:0.78rem; font-weight:700; color:#94a3b8; text-transform:uppercase; display:flex; align-items:center; gap:6px;">
        ♜ DEVOLUCIONES / TRIAGE [${sucActiva}]
      </div>
      <div style="font-size:1.6rem; font-weight:800; color:#f8fafc; margin:6px 0;">${devCant.toLocaleString('es-AR')} un.</div>
      <div class="req-costos" style="font-size:0.78rem; color:#94a3b8;">
        Capital Parado (ONUs): <strong style="color:#cbd5e1;">$ ${Math.round(valDev).toLocaleString('es-AR')} USD</strong>
      </div>
      <div style="font-size:0.78rem; color:#ea580c; font-weight:700; margin-top:4px;">
        📺 Cantidad de CATV a probar: ${devCatvCant.toLocaleString('es-AR')} un.
      </div>
      <button type="button" class="btn" style="width:100%; margin-top:10px; background:#0f172a; border:1px solid #334155; color:#cbd5e1; font-size:0.75rem; padding:5px; border-radius:6px; cursor:pointer;" onclick="const el = document.getElementById('desglose-dev'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
        ▼ Ver Desglose
      </button>
      ${renderDesglose(itemsDev, 'desglose-dev')}
    </div>

    <!-- 2. DESCARTE GENERAL -->
    <div class="card-tactico" style="background:#1e293b; border:1px solid #334155; padding:14px; border-radius:10px; flex:1; min-width:210px;">
      <div style="font-size:0.78rem; font-weight:700; color:#94a3b8; text-transform:uppercase; display:flex; align-items:center; gap:6px;">
        🗑️ DESCARTE GENERAL [${sucActiva}]
      </div>
      <div style="font-size:1.6rem; font-weight:800; color:#f8fafc; margin:6px 0;">${descCant.toLocaleString('es-AR')} un.</div>
      <div class="req-costos" style="font-size:0.78rem; color:#94a3b8;">
        Capital Afectado (ONUs): <strong style="color:#cbd5e1;">$ ${Math.round(valDesc).toLocaleString('es-AR')} USD</strong>
      </div>
      <button type="button" class="btn" style="width:100%; margin-top:22px; background:#0f172a; border:1px solid #334155; color:#cbd5e1; font-size:0.75rem; padding:5px; border-radius:6px; cursor:pointer;" onclick="const el = document.getElementById('desglose-desc'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
        ▼ Ver Desglose
      </button>
      ${renderDesglose(itemsDesc, 'desglose-desc')}
    </div>

    <!-- 3. DESCARTE VIP -->
    <div class="card-tactico" style="background:#1e293b; border:1px solid #991b1b; padding:14px; border-radius:10px; flex:1; min-width:210px;">
      <div style="font-size:0.78rem; font-weight:700; color:#f87171; text-transform:uppercase; display:flex; align-items:center; gap:6px;">
        👑 DESCARTE VIP [${sucActiva}]
      </div>
      <div style="font-size:1.6rem; font-weight:800; color:#f8fafc; margin:6px 0;">${descVipCant.toLocaleString('es-AR')} un.</div>
      <div class="req-costos" style="font-size:0.78rem; color:#94a3b8;">
        Capital VIP Inmovilizado: <strong style="color:#cbd5e1;">$ ${Math.round(valDescVip).toLocaleString('es-AR')} USD</strong>
      </div>
      <button type="button" class="btn" style="width:100%; margin-top:22px; background:#0f172a; border:1px solid #334155; color:#cbd5e1; font-size:0.75rem; padding:5px; border-radius:6px; cursor:pointer;" onclick="const el = document.getElementById('desglose-descvip'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
        ▼ Ver Desglose
      </button>
      ${renderDesglose(itemsDescVip, 'desglose-descvip')}
    </div>

    <!-- 4. STOCK NUEVO / COMPRAS -->
    <div class="card-tactico" style="background:#1e293b; border:1px solid #334155; padding:14px; border-radius:10px; flex:1; min-width:210px;">
      <div style="font-size:0.78rem; font-weight:700; color:#38bdf8; text-transform:uppercase; display:flex; align-items:center; gap:6px;">
        🛒 STOCK NUEVO / COMPRAS [${sucActiva}]
      </div>
      <div style="font-size:1.6rem; font-weight:800; color:#f8fafc; margin:6px 0;">${catrielCant.toLocaleString('es-AR')} un.</div>
      <div style="font-size:0.78rem; color:#94a3b8;">ONUs Estratégicas Nuevas</div>
      <button type="button" class="btn" style="width:100%; margin-top:22px; background:#0f172a; border:1px solid #334155; color:#cbd5e1; font-size:0.75rem; padding:5px; border-radius:6px; cursor:pointer;" onclick="const el = document.getElementById('desglose-catriel'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
        ▼ Ver Desglose
      </button>
      ${renderDesglose(itemsCatriel, 'desglose-catriel')}
    </div>
  `;
}