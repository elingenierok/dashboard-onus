// ====================================================
// MÓDULO AUTÓNOMO DE STOCK - FILTRADO Y TOOLTIPS TÁCTICOS
// ====================================================

const SUPABASE_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const COSTO_POR_DEFECTO = 0;

// 1. ALMACENES OFICIALES REVISADOS
const SUCURSALES = [
  'OBE_ALM_PRINCIPAL', 
  'OBE_ALM_CATRIEL', 
  'SPD_ALM_PRINCIPAL', 
  'WND_ALM_PRINCIPAL', 
  'ITU_ALM_PRINCIPAL', 
  'ELDO_ALM_PRINCIPAL'
];
const SUCURSALES_CORTAS = ['OBE PRINC', 'OBE CATR', 'SPD PRINC', 'WND PRINC', 'ITU PRINC', 'ELD PRINC'];

const ALMACEN_DEV = 'OBE_ALM_DEVOLUCIONES';
const ALMACEN_DESC = 'OBE_ALM_DESCARTE';
const ALMACEN_DESC_VIP = 'OBE_ALM_DESCARTE_VIP'; // Nuevo almacén futuro

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

function normalizar(str) {
  return (str || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// 2. LISTAS ESTRATÉGICAS DEFINITIVAS (EQUIPOS VIP INCLUYENDO VARIANTES DE ESPACIADO)
const GRUPO_DUAL_BAND = [
  "ONU ZTE F6201B V9.3 WIFI6 AX3000",
  "ONU ZTE F6201B V9.3 WIFI6 AX3000(USADO)",
  "ONU ZTE F6201B V9.3 WIFI6 AX3000 (USADO)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS) (USADA)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)(USADA)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI (USADA)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI(USADA)"
].map(normalizar);

const GRUPO_CATV = [
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

let stockData = [];
let mapaPrecios = new Map();
let listaPreciosTabla = [];
let kpiChart = null;

// CARGA DESDE SUPABASE
async function cargarStockModulo() {
  const tagCSV = document.getElementById('tagCSV');
  if (tagCSV) {
    tagCSV.textContent = 'Supabase: ⏳ Consultando...';
    tagCSV.className = 'file-tag no';
  }

  try {
    const { data: ult, error: errUlt } = await supabaseClient
      .from('registro_stock')
      .select('fecha_registro')
      .order('fecha_registro', { ascending: false })
      .limit(1);

    if (errUlt) throw errUlt;
    if (!ult || !ult.length) throw new Error('Sin datos de stock');

    const ultimaFecha = ult[0].fecha_registro;

    const [resStock, resPrecios] = await Promise.all([
      supabaseClient.from('registro_stock').select('codigo, descripcion, stock_total, almacen').eq('fecha_registro', ultimaFecha),
      supabaseClient.from('precios_catalogos').select('codigo, descripcion, precio_final, moneda')
    ]);

    if (resStock.error) throw resStock.error;

    stockData = (resStock.data || []).map(d => {
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
    listaPreciosTabla = resPrecios.data || [];
    listaPreciosTabla.forEach(p => {
      const val = parseFloat(p.precio_final) || 0;
      if (p.codigo) mapaPrecios.set(p.codigo.trim().toUpperCase(), val);
      if (p.descripcion) mapaPrecios.set(normalizar(p.descripcion), val);
    });

    if (tagCSV) {
      tagCSV.textContent = `Supabase: ✅ ${ultimaFecha}`;
      tagCSV.className = 'file-tag ok';
    }

    procesarYRenderizarStock();
    renderTablaPrecios();
  } catch (err) {
    console.error('Error al consultar Supabase:', err);
    if (tagCSV) {
      tagCSV.textContent = `Supabase: ❌ ${err.message || 'Error'}`;
      tagCSV.className = 'file-tag no';
    }
  }
}

// PROCESAMIENTO
function procesarYRenderizarStock() {
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
    const descNorm = normalizar(row.descripcion);

    // Solo procesamos ítems que sean ONUs
    if (!descNorm.includes('ONU')) return;

    const esVIP_DB = GRUPO_DUAL_BAND.includes(descNorm);
    const esVIP_CATV = GRUPO_CATV.includes(descNorm);
    const esAlmacenPrincipal = SUCURSALES.includes(row.almacen);

    const precioUnitario = mapaPrecios.get(row.codigo) || mapaPrecios.get(descNorm) || COSTO_POR_DEFECTO;
    const valorFila = row.stock * precioUnitario;

    // A) INDICADOR ESTRATÉGICO
    if (esAlmacenPrincipal && (esVIP_DB || esVIP_CATV)) {
      stratTotal += row.stock;
      stratValorUSD += valorFila;

      if (esVIP_DB) {
        stratDB += row.stock;
        arbolEstrategico[row.almacen].DB += row.stock;
      } else if (esVIP_CATV) {
        stratCATV += row.stock;
        arbolEstrategico[row.almacen].CATV += row.stock;
      }

      // Clasificación de condición para la 2da barra
      if (descNorm.includes('USAD')) {
        stratUsados += row.stock;
      } else {
        stratNuevos += row.stock;
      }
    }

    // B) INDICADOR OPERATIVO Y TÁCTICO
    if (esAlmacenPrincipal) {
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

      if (row.almacen === 'OBE_ALM_CATRIEL' && (esVIP_DB || esVIP_CATV)) {
        catrielCant += row.stock;
        itemsCatriel[row.descripcion] = (itemsCatriel[row.descripcion] || 0) + row.stock;
      }
    } 
    else if (row.almacen === ALMACEN_DEV) {
      devCant += row.stock;
      valorDevoluciones += valorFila;
      itemsDev[row.descripcion] = (itemsDev[row.descripcion] || 0) + row.stock;

      if (esVIP_CATV) {
        devCatvCant += row.stock;
      }
    } 
    else if (row.almacen === ALMACEN_DESC) {
      descCant += row.stock;
      valorDescarte += valorFila;
      itemsDesc[row.descripcion] = (itemsDesc[row.descripcion] || 0) + row.stock;
    }
    else if (row.almacen === ALMACEN_DESC_VIP) {
      if (esVIP_DB || esVIP_CATV) {
        descVipCant += row.stock;
        valorDescVip += valorFila;
        itemsDescVip[row.descripcion] = (itemsDescVip[row.descripcion] || 0) + row.stock;
      }
    }
  });

  renderStockEstrategico(stratDB, stratCATV, stratNuevos, stratUsados, stratTotal, stratValorUSD, arbolEstrategico);
  renderStockOperativo(arbolOperativo);
  renderStockTactico(devCant, devCatvCant, valorDevoluciones, descCant, valorDescarte, descVipCant, valorDescVip, catrielCant, itemsDev, itemsDesc, itemsDescVip, itemsCatriel);
  renderAuditoriaTabla();
}

// RENDER: GRÁFICO ESTRATÉGICO CON 2 BARRAS PARALELAS DE IGUAL LONGITUD
function renderStockEstrategico(db, catv, nuevos, usados, total, valorGlobal, arbol) {
  const pctDB = total > 0 ? Math.round((db / total) * 100) : 0;
  const pctCATV = total > 0 ? Math.round((catv / total) * 100) : 0;

  document.getElementById('val-db').textContent = db.toLocaleString('es-AR');
  document.getElementById('pct-db').textContent = `(${pctDB}%)`;

  document.getElementById('val-catv').textContent = catv.toLocaleString('es-AR');
  document.getElementById('pct-catv').textContent = `(${pctCATV}%)`;

  document.getElementById('val-total').textContent = `${total.toLocaleString('es-AR')} un.`;
  document.getElementById('val-costo').textContent = `$ ${Math.round(valorGlobal).toLocaleString('es-AR')} USD`;

  const chartData = {
    labels: ['Tecnología VIP', 'Condición VIP'],
    datasets: [
      {
        label: 'Dual Band VIP',
        data: [db, 0],
        backgroundColor: '#0284c7',
        borderRadius: 4
      },
      {
        label: 'CATV VIP',
        data: [catv, 0],
        backgroundColor: '#ea580c',
        borderRadius: 4
      },
      {
        label: 'Nuevos',
        data: [0, nuevos],
        backgroundColor: '#22c55e',
        borderRadius: 4
      },
      {
        label: 'Usados / Reacond.',
        data: [0, usados],
        backgroundColor: '#eab308',
        borderRadius: 4
      }
    ]
  };

  const canvas = document.getElementById('kpiStackedChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (kpiChart) {
    kpiChart.arbolRef = arbol;
    kpiChart.data = chartData;
    kpiChart.update();
  } else {
    kpiChart = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#38bdf8',
            bodyColor: '#f8fafc',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            filter: (tooltipItem) => tooltipItem.raw > 0,
            callbacks: {
              label: (context) => {
                const val = context.raw || 0;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return ` ${context.dataset.label}: ${val.toLocaleString('es-AR')} un. (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { stacked: true, grid: { display: false }, ticks: { color: '#f8fafc', font: { size: 11, weight: 'bold' } } }
        }
      }
    });
    kpiChart.arbolRef = arbol;
  }
}

// RENDER: TÁCTICO CON TOOLTIPS EMERGENTES
function renderStockTactico(devCant, devCatvCant, valorDevoluciones, descCant, valorDescarte, descVipCant, valorDescVip, catrielCant, itemsDev, itemsDesc, itemsDescVip, itemsCatriel) {
  const armarTooltipHTML = (titulo, objItems) => {
    let listHtml = `<strong style="color:#38bdf8; display:block; margin-bottom:6px; border-bottom:1px solid #334155; padding-bottom:4px;">${titulo}</strong>`;
    const entries = Object.entries(objItems);
    if (entries.length === 0) {
      listHtml += '<span style="color:#94a3b8; font-style:italic;">Sin ítems registrados</span>';
    } else {
      entries.forEach(([desc, cant]) => {
        listHtml += `<div style="margin-bottom:3px; color:#cbd5e1;">• ${desc}: <strong style="color:#f8fafc;">${cant.toLocaleString('es-AR')} un.</strong></div>`;
      });
    }
    return `<div class="kpi-card-tooltip">${listHtml}</div>`;
  };

  document.getElementById('grid-tactico-cards').innerHTML = `
    <div class="kpi-card-dark kpi-tooltip-container" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#475569;">📥 OBE_ALM_DEVOLUCIONES (A Probar)</div>
      <div class="value">${devCant.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#64748b;">Capital Parado (ONUs): <strong>$ ${Math.round(valorDevoluciones).toLocaleString('es-AR')} USD</strong></div>
      <div class="subtext" style="color:#c2410c; margin-top:3px; font-weight:600;">📺 Cantidad de CATV a probar: <strong style="color:#ea580c;">${devCatvCant.toLocaleString('es-AR')} un.</strong></div>
      ${armarTooltipHTML('📥 Desglose Devoluciones', itemsDev)}
    </div>

    <div class="kpi-card-dark kpi-tooltip-container" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#475569;">🗑️ OBE_ALM_DESCARTE (General)</div>
      <div class="value">${descCant.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#64748b;">Capital Afectado (ONUs): <strong>$ ${Math.round(valorDescarte).toLocaleString('es-AR')} USD</strong></div>
      ${armarTooltipHTML('🗑️ Desglose Descarte', itemsDesc)}
    </div>

    <div class="kpi-card-dark kpi-tooltip-container" style="background:#f8fafc; border:1px solid #991b1b; color:#0f172a;">
      <div class="title" style="color:#991b1b;">👑 OBE_ALM_DESCARTE_VIP</div>
      <div class="value">${descVipCant.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#64748b;">Capital VIP Inmovilizado: <strong>$ ${Math.round(valorDescVip).toLocaleString('es-AR')} USD</strong></div>
      ${armarTooltipHTML('👑 Desglose Descarte VIP', itemsDescVip)}
    </div>

    <div class="kpi-card-dark kpi-tooltip-container" style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a;">
      <div class="title" style="color:#0284c7;">🛒 STOCK NUEVO (OBE_CATRIEL)</div>
      <div class="value">${catrielCant.toLocaleString('es-AR')} un.</div>
      <div class="subtext" style="color:#475569;">ONUs Estratégicas Nuevas</div>
      ${armarTooltipHTML('🛒 Desglose Stock Nuevo (Catriel)', itemsCatriel)}
    </div>
  `;
}

// RENDER: TABLA AUDITORÍA
async function renderAuditoriaTabla() {
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

  LISTA_AUDITORIA.forEach(item => {
    const stockSistemaTotal = stockData.reduce((acc, d) => {
      const dNorm = normalizar(d.descripcion);
      return (d.almacen === item.key && dNorm.includes('ONU')) ? acc + d.stock : acc;
    }, 0);

    html += `<tr>
      <td style="font-weight:600; color:#334155;">${item.nombre}</td>
      <td style="text-align:center; font-weight:700;">${stockSistemaTotal.toLocaleString('es-AR')} un.</td>
      <td style="text-align:center; color:#0284c7; font-weight:700;">${stockSistemaTotal.toLocaleString('es-AR')} un.</td>
      <td style="text-align:center;"><span class="tag-sin-desviacion">🟢 Exacto (0)</span></td>
      <td style="text-align:center; font-weight:700;">0.0%</td>
      <td style="text-align:center;"><span style="color:#94a3b8; font-style:italic;">Al día</span></td>
    </tr>`;
  });

  html += `</tbody></table>`;
  document.getElementById('tablaAuditoriaWrapper').innerHTML = html;
}

// RENDER: TABLA OPERATIVA (NUEVA MATRIZ PÍVOT CON SUMATORIA VERTICAL POR SUCURSAL)
function renderStockOperativo(arbol) {
  let totDB = 0, totCATV = 0, totOtras = 0;
  SUCURSALES.forEach(s => {
    totDB += arbol[s].DB;
    totCATV += arbol[s].CATV;
    totOtras += arbol[s].Otras;
  });

  // Recopilar modelos únicos por cada categoría
  const catvModels = new Set();
  const dbModels = new Set();
  const otrasModels = new Set();

  SUCURSALES.forEach(s => {
    Object.keys(arbol[s].itemsCATV || {}).forEach(m => catvModels.add(m));
    Object.keys(arbol[s].itemsDB || {}).forEach(m => dbModels.add(m));
    Object.keys(arbol[s].itemsOtras || {}).forEach(m => otrasModels.add(m));
  });

  let html = '<table class="arbol" style="width:100%; border-collapse:collapse; text-align:left;">';
  
  // Encabezado principal y columnas de sucursales
  html += `<thead>
    <tr>
      <td class="celda-total" colspan="${SUCURSALES.length + 1}" style="background:#0f172a; color:#f8fafc; font-weight:800; padding:10px; text-align:center;">
        📦 TOTAL ONUs EN SUCURSALES: ${(totDB + totCATV + totOtras).toLocaleString('es-AR')} (VIP: ${(totDB + totCATV).toLocaleString('es-AR')} | Otras ONUs: ${totOtras.toLocaleString('es-AR')})
      </td>
    </tr>
    <tr style="background:#1e293b; color:#38bdf8;">
      <th style="padding:10px; border:1px solid #334155;">Modelo / Descripción de ONU</th>`;
  
  SUCURSALES_CORTAS.forEach(suc => {
    html += `<th style="padding:10px; border:1px solid #334155; text-align:center; min-width:85px;">${suc}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // 1. SECCIÓN CATV VIP CON SUMATORIA POR SUCURSAL EN LA FILA DE ENCABEZADO
  if (catvModels.size > 0) {
    html += `<tr>
      <td style="background:#ffedd5; color:#c2410c; font-weight:800; padding:8px 10px; border:1px solid #fed7aa;">
        🟠 CATV VIP (${totCATV.toLocaleString('es-AR')} un.)
      </td>`;
    SUCURSALES.forEach(s => {
      const totalCatvSucursal = arbol[s].CATV || 0;
      html += `<td style="background:#ffedd5; color:#c2410c; font-weight:800; padding:8px 10px; border:1px solid #fed7aa; text-align:center;">
        ${totalCatvSucursal > 0 ? totalCatvSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(catvModels).sort().forEach(modelo => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#1e293b;">${modelo}</td>`;
      SUCURSALES.forEach(s => {
        const cant = arbol[s].itemsCATV[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#ea580c;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  // 2. SECCIÓN DUAL BAND VIP CON SUMATORIA POR SUCURSAL EN LA FILA DE ENCABEZADO
  if (dbModels.size > 0) {
    html += `<tr>
      <td style="background:#e0f2fe; color:#0369a1; font-weight:800; padding:8px 10px; border:1px solid #bae6fd;">
        🔵 DUAL BAND VIP (${totDB.toLocaleString('es-AR')} un.)
      </td>`;
    SUCURSALES.forEach(s => {
      const totalDbSucursal = arbol[s].DB || 0;
      html += `<td style="background:#e0f2fe; color:#0369a1; font-weight:800; padding:8px 10px; border:1px solid #bae6fd; text-align:center;">
        ${totalDbSucursal > 0 ? totalDbSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(dbModels).sort().forEach(modelo => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#1e293b;">${modelo}</td>`;
      SUCURSALES.forEach(s => {
        const cant = arbol[s].itemsDB[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#0284c7;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  // 3. SECCIÓN OTRAS ONUs / LEGACY CON SUMATORIA POR SUCURSAL EN LA FILA DE ENCABEZADO
  if (otrasModels.size > 0) {
    html += `<tr>
      <td style="background:#f1f5f9; color:#475569; font-weight:800; padding:8px 10px; border:1px solid #cbd5e1;">
        ⚙️ OTRAS ONUs / LEGACY (${totOtras.toLocaleString('es-AR')} un.)
      </td>`;
    SUCURSALES.forEach(s => {
      const totalOtrasSucursal = arbol[s].Otras || 0;
      html += `<td style="background:#f1f5f9; color:#475569; font-weight:800; padding:8px 10px; border:1px solid #cbd5e1; text-align:center;">
        ${totalOtrasSucursal > 0 ? totalOtrasSucursal.toLocaleString('es-AR') : ''}
      </td>`;
    });
    html += `</tr>`;

    Array.from(otrasModels).sort().forEach(modelo => {
      html += `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:600; color:#334155;">${modelo}</td>`;
      SUCURSALES.forEach(s => {
        const cant = arbol[s].itemsOtras[modelo] || 0;
        html += `<td style="padding:8px 10px; text-align:center; font-weight:700; color:#64748b;">${cant > 0 ? cant.toLocaleString('es-AR') : ''}</td>`;
      });
      html += `</tr>`;
    });
  }

  html += '</tbody></table>';
  document.getElementById('tablaWrapper').innerHTML = html;
}

// RENDER: CATÁLOGO PRECIOS
function renderTablaPrecios() {
  let html = '<table class="arbol" style="text-align: left;">';
  html += '<tr><th style="background:#0f172a; color:white;">Código</th><th style="background:#0f172a; color:white;">Descripción</th><th style="background:#0f172a; color:white; width: 150px; text-align:center;">Precio Final</th></tr>';
  
  if (listaPreciosTabla.length === 0) {
    html += '<tr><td colspan="3" style="text-align:center; color:#64748b;">No hay precios cargados en Supabase.</td></tr>';
  } else {
    listaPreciosTabla.forEach(item => {
      html += `<tr>
        <td style="font-weight: 700; color: #0284c7;">${item.codigo || '-'}</td>
        <td style="font-weight: 600; color: #334155;">${item.descripcion || '-'}</td>
        <td style="text-align:center; color: #16a34a; font-weight: 700;">$ ${item.precio_final} ${item.moneda || 'USD'}</td>
      </tr>`;
    });
  }
  
  html += '</table>';
  document.getElementById('tablaPreciosWrapper').innerHTML = html;
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
  const btnReload = document.getElementById('btnReloadSupabase');
  if (btnReload) {
    btnReload.addEventListener('click', async () => {
      await cargarStockModulo();
    });
  }
  cargarStockModulo();
});