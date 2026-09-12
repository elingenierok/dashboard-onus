// ====================================================
// MÓDULO AUTÓNOMO: TENDENCIAS E INTELIGENCIA PREDICTIVA
// ====================================================

const SUPABASE_URL_TEN = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_TEN = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseTendencias = supabase.createClient(SUPABASE_URL_TEN, SUPABASE_KEY_TEN);

const COLORES_SUCURSAL_TEN = {
  'OBE_ALM_PRINCIPAL': { nombre: 'OBE Principal', color: '#0284c7' },
  'OBE_ALM_CATRIEL':   { nombre: 'OBE Catriel',   color: '#38bdf8' },
  'SPD_ALM_PRINCIPAL': { nombre: 'San Pedro',     color: '#ea580c' },
  'WND_ALM_PRINCIPAL': { nombre: 'Wanda',         color: '#eab308' },
  'ITU_ALM_PRINCIPAL': { nombre: 'Ituzaingó',     color: '#16a34a' },
  'ELDO_ALM_PRINCIPAL':{ nombre: 'Eldorado',      color: '#a855f7' }
};

// Prefijos 'ten_' para aislar variables del módulo
let ten_rawHistoricoData = [];
let ten_catalogoEquiposMemoria = [];
let ten_tendenciasChart = null;

// NUEVAS VARIABLES GLOBALES PARA EL MÓDULO DE INSUMOS
let ten_insumosChart = null;

function ten_normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function ten_obtenerCategoriaCatalogo(descNorm) {
  const encontrado = ten_catalogoEquiposMemoria.find(item => {
    const itemNorm = item.modelo_norm || ten_normalizar(item.modelo);
    return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
  });

  return encontrado && encontrado.categoria ? encontrado.categoria.toUpperCase() : 'OBSOLETO';
}

// MANEJO DE DESPLEGABLES EN INTERFAZ
function toggleSeccionTendencias(seccionId) {
  const elem = document.getElementById(seccionId);
  const icon = document.getElementById(`icon-${seccionId}`);
  if (!elem) return;

  if (elem.style.display === 'none' || elem.style.display === '') {
    elem.style.display = 'block';
    if (icon) icon.textContent = '▼';

    // Disparar renderizado del gráfico de insumos al abrir por primera vez esa sección
    if (seccionId === 'sec-tendencias-insumos') {
      actualizarGraficoInsumos();
    }
  } else {
    elem.style.display = 'none';
    if (icon) icon.textContent = '►';
  }
}
window.toggleSeccionTendencias = toggleSeccionTendencias;

// CÁLCULO DE REGRESIÓN IGNORANDO DÍAS NULOS
function calcularRegresionLinealTramo(fechasCalculo, valoresCalculo, todasFechasVisibles) {
  const puntosValidos = [];
  for (let i = 0; i < fechasCalculo.length; i++) {
    if (valoresCalculo[i] !== null && valoresCalculo[i] !== undefined) {
      puntosValidos.push({
        fecha: fechasCalculo[i],
        valor: valoresCalculo[i]
      });
    }
  }

  if (puntosValidos.length < 2) return null;

  const fecha0Calculo = new Date(puntosValidos[0].fecha).getTime() / 86400000;
  const xDataCalculo = puntosValidos.map(p => (new Date(p.fecha).getTime() / 86400000) - fecha0Calculo);
  const yDataCalculo = puntosValidos.map(p => p.valor);
  const n = xDataCalculo.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xDataCalculo[i];
    sumY += yDataCalculo[i];
    sumXY += xDataCalculo[i] * yDataCalculo[i];
    sumXX += xDataCalculo[i] * xDataCalculo[i];
  }

  const divisor = (n * sumXX - sumX * sumX);
  if (divisor === 0) return null;

  const m = (n * sumXY - sumX * sumY) / divisor;
  const b = (sumY - m * sumX) / n;

  const trendDataVisible = todasFechasVisibles.map(f => {
    const xVis = (new Date(f).getTime() / 86400000) - fecha0Calculo;
    return Math.max(0, parseFloat((m * xVis + b).toFixed(2)));
  });

  let diasParaCero = null;
  if (m < -0.01) {
    const lastX = xDataCalculo[n - 1];
    const xZero = -b / m;
    diasParaCero = Math.max(0, Math.round(xZero - lastX));
  }

  return { trendDataVisible, m, diasParaCero };
}

async function cargarModuloTendencias() {
  const tag = document.getElementById('tagTendencias');
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  if (tag) {
    tag.textContent = `Supabase: ⏳ Descargando historial... [${sucActiva}]`;
    tag.className = 'file-tag no';
  }

  try {
    const [resHist, resCat] = await Promise.all([
      descargarHistorialCompleto(),
      supabaseTendencias.from('catalogo_equipos').select('*')
    ]);

    ten_rawHistoricoData = resHist || [];
    ten_catalogoEquiposMemoria = resCat.data || [];

    if (tag) {
      tag.textContent = `Supabase: ✅ ${ten_rawHistoricoData.length} Reg. [${sucActiva}]`;
      tag.className = 'file-tag ok';
    }

    ten_inicializarLimitesFechas();
    actualizarGraficoTendencias();

    // NUEVO: Cargar autocompletado de insumos y subalmacenes
    await cargarListaInsumosUnicos();

  } catch (err) {
    console.error('Error al consultar Supabase en Tendencias:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error de lectura';
      tag.className = 'file-tag no';
    }
  }
}

async function descargarHistorialCompleto() {
  let allData = [];
  let from = 0;
  const step = 999;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseTendencias
      .from('stock_historico')
      .select('id, fecha_registro, almacen, descripcion, stock_total')
      .ilike('descripcion', '%ONU%')
      .order('fecha_registro', { ascending: true })
      .order('id', { ascending: true }) // 👈 CLAVE: Evita saltos/duplicados en paginación
      .range(from, from + step);

    if (error) throw error;
    
    if (data && data.length > 0) {
      allData = allData.concat(data);
      from += (step + 1);
    }
    
    if (!data || data.length <= step) {
      hasMore = false;
    }
  }
  return allData;
}

function ten_inicializarLimitesFechas() {
  if (!ten_rawHistoricoData.length) return;

  const todasFechas = [...new Set(ten_rawHistoricoData.map(d => d.fecha_registro))].sort();
  const inputDesde = document.getElementById('tendencia-desde');
  const inputHasta = document.getElementById('tendencia-hasta');

  if (inputDesde && !inputDesde.value) {
    const indiceInicio = Math.max(0, todasFechas.length - 30);
    inputDesde.value = todasFechas[indiceInicio];
  }
  if (inputHasta && !inputHasta.value) {
    inputHasta.value = todasFechas[todasFechas.length - 1];
  }

  // Inicializar también las fechas por defecto del módulo de insumos
  const insDesde = document.getElementById('insumo-fecha-desde');
  const insHasta = document.getElementById('insumo-fecha-hasta');
  if (insDesde && !insDesde.value) insDesde.value = todasFechas[Math.max(0, todasFechas.length - 30)];
  if (insHasta && !insHasta.value) insHasta.value = todasFechas[todasFechas.length - 1];
}

// ====================================================
// FUNCIÓN 1: GRÁFICO TENDENCIAS ONUs (MANTENIDO INTACTO)
// ====================================================
function actualizarGraficoTendencias() {
  if (!ten_rawHistoricoData.length) return;

  const almacenesTildados = Array.from(document.querySelectorAll('#check-almacenes input:checked')).map(cb => cb.value);
  const onusTildadas = Array.from(document.querySelectorAll('#check-onus input:checked')).map(cb => cb.value);
  const checkProyeccion = document.getElementById('check-proyeccion-global');
  const activarProyecciones = checkProyeccion ? checkProyeccion.checked : false;

  const zoomVistaVal = document.getElementById('zoom-vista')?.value || 'ALL';
  const fechaDesdeVal = document.getElementById('tendencia-desde')?.value || '';
  const fechaHastaVal = document.getElementById('tendencia-hasta')?.value || '';

  const incluirDB = onusTildadas.includes('DUAL_BAND');
  const incluirCATV = onusTildadas.includes('CATV');

  const todasFechas = [...new Set(ten_rawHistoricoData.map(d => d.fecha_registro))].sort();

  let fechasVisibles = [...todasFechas];
  if (zoomVistaVal !== 'ALL') {
    const diasZoom = parseInt(zoomVistaVal, 10);
    const limiteFecha = new Date();
    limiteFecha.setDate(limiteFecha.getDate() - diasZoom);
    const strLimite = limiteFecha.toISOString().split('T')[0];
    fechasVisibles = todasFechas.filter(f => f >= strLimite);
  }

  const fechasCalculo = todasFechas.filter(f => {
    if (fechaDesdeVal && f < fechaDesdeVal) return false;
    if (fechaHastaVal && f > fechaHastaVal) return false;
    return true;
  });

  if (fechasVisibles.length === 0) return;

  const mapaSuma = {};
  almacenesTildados.forEach(alm => {
    mapaSuma[alm] = {};
    todasFechas.forEach(f => mapaSuma[alm][f] = null);
  });

  // 1. Acumulación primaria de datos
  ten_rawHistoricoData.forEach(row => {
    let alm = (row.almacen || '').trim().toUpperCase();
    if (alm === 'SPD_PRINCIPAL') alm = 'SPD_ALM_PRINCIPAL';
    if (alm === 'WND_PRINCIPAL' || alm === 'WND-PRINCIPAL') alm = 'WND_ALM_PRINCIPAL';

    if (!almacenesTildados.includes(alm)) return;

    const fecha = row.fecha_registro;
    const descNorm = ten_normalizar(row.descripcion);
    const cat = ten_obtenerCategoriaCatalogo(descNorm);

    const esDB = (cat === 'DUAL_BAND');
    const esCATV = (cat === 'CATV');

    if ((esDB && incluirDB) || (esCATV && incluirCATV)) {
      if (mapaSuma[alm][fecha] === null) {
        mapaSuma[alm][fecha] = 0;
      }
      mapaSuma[alm][fecha] += (parseInt(row.stock_total, 10) || 0);
    }
  });

  // 2. CORRECCIÓN DE PICOS A CERO (Forward Fill / Arrastre de Stock)
  almacenesTildados.forEach(alm => {
    let ultimoValorValido = null;
    todasFechas.forEach(f => {
      if (mapaSuma[alm][f] !== null) {
        ultimoValorValido = mapaSuma[alm][f];
      } else if (ultimoValorValido !== null) {
        mapaSuma[alm][f] = ultimoValorValido;
      }
    });
  });

  const datasets = [];
  let htmlEstimaciones = '';

  almacenesTildados.forEach(alm => {
    const meta = COLORES_SUCURSAL_TEN[alm] || { nombre: alm, color: '#cbd5e1' };
    const dataPuntosVisibles = fechasVisibles.map(f => mapaSuma[alm][f]);

    datasets.push({
      label: meta.nombre,
      data: dataPuntosVisibles,
      borderColor: meta.color,
      backgroundColor: meta.color,
      tension: 0.2,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 7,
      spanGaps: true
    });

    if (activarProyecciones && fechasCalculo.length >= 2) {
      const valoresCalculo = fechasCalculo.map(f => mapaSuma[alm][f]);
      const regresion = calcularRegresionLinealTramo(fechasCalculo, valoresCalculo, fechasVisibles);

      if (regresion) {
        datasets.push({
          label: `Tendencia ${meta.nombre}`,
          data: regresion.trendDataVisible,
          borderColor: meta.color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          spanGaps: true
        });

        let estadoHtml = '';
        if (regresion.m >= -0.01) {
          estadoHtml = `<strong style="color: #4ade80;">📈 Stock Estable o en Alza</strong>`;
        } else {
          const dias = regresion.diasParaCero;
          let colorDias = '#4ade80';
          if (dias <= 15) colorDias = '#f87171';
          else if (dias <= 30) colorDias = '#facc15';

          estadoHtml = `Quiebre en <strong style="color: ${colorDias}; font-size: 1.15rem;">${dias} días</strong> aprox.`;
        }

        htmlEstimaciones += `
          <div style="background: #0f172a; border: 1px solid ${meta.color}; border-left: 4px solid ${meta.color}; padding: 10px 14px; border-radius: 6px;">
            <div style="color: #cbd5e1; font-size: 0.78rem; font-weight: bold; margin-bottom: 2px;">${meta.nombre}</div>
            <div style="color: #f8fafc; font-size: 0.9rem;">${estadoHtml}</div>
          </div>
        `;
      }
    }
  });

  const panel = document.getElementById('panel-estimaciones');
  const grid = document.getElementById('grid-estimaciones');
  if (panel && grid) {
    if (activarProyecciones && htmlEstimaciones !== '') {
      grid.innerHTML = htmlEstimaciones;
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  }

  const canvas = document.getElementById('chartTendenciasLines');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (ten_tendenciasChart) {
    ten_tendenciasChart.destroy();
  }
  
  ten_tendenciasChart = new Chart(ctx, {
    type: 'line',
    data: { labels: fechasVisibles, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'top', 
          labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } 
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#38bdf8',
          bodyColor: '#f8fafc',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
      }
    }
  });
}
window.actualizarGraficoTendencias = actualizarGraficoTendencias;


// ====================================================
// FUNCIÓN 2: ANÁLISIS DE CONSUMO E HISTÓRICO DE INSUMOS
// ====================================================

// A. Llenar el Datalist con los insumos existentes
async function cargarListaInsumosUnicos() {
  const listContainer = document.getElementById('list-insumos-items');
  if (!listContainer) return;

  try {
    const { data, error } = await supabaseTendencias
      .from('stock_historico')
      .select('descripcion')
      .not('descripcion', 'ilike', '%ONU%')
      .limit(3000);

    if (error) throw error;

    const mapaUnicos = new Set();
    (data || []).forEach(r => {
      const desc = (r.descripcion || '').trim();
      if (desc) mapaUnicos.add(desc);
    });

    const itemsOrdenados = Array.from(mapaUnicos).sort();

    let html = '';
    itemsOrdenados.forEach(desc => {
      html += `<option value="${desc}">`;
    });

    listContainer.innerHTML = html;
    
    // Popular subalmacenes iniciales
    await popularAlmacenesEspecificos();
  } catch (err) {
    console.error("Error al cargar lista de insumos:", err);
  }
}

// B. Llenar el selector 2.b con los vehículos/almacenes reales disponibles
async function popularAlmacenesEspecificos() {
  const selEspecifico = document.getElementById('sel-insumo-almacen-especifico');
  if (!selEspecifico) return;

  const sucFiltro = document.getElementById('sel-insumo-sucursal')?.value || 'TODAS';
  const tipoFiltro = document.getElementById('sel-insumo-tipo-alm')?.value || 'TODOS';

  try {
    let query = supabaseTendencias
      .from('stock_historico')
      .select('almacen, sucursal_id, tipo_almacen')
      .limit(2000);

    if (sucFiltro !== 'TODAS') query = query.eq('sucursal_id', sucFiltro);
    if (tipoFiltro !== 'TODOS') query = query.eq('tipo_almacen', tipoFiltro);

    const { data, error } = await query;
    if (error) throw error;

    const almacenesUnicos = new Set();
    (data || []).forEach(r => {
      if (r.almacen) almacenesUnicos.add(r.almacen.trim());
    });

    const listaOrdenada = Array.from(almacenesUnicos).sort();

    let html = `<option value="TODOS">🌐 Todos los del Tipo Seleccionado (${listaOrdenada.length})</option>`;
    listaOrdenada.forEach(alm => {
      html += `<option value="${alm}">${alm}</option>`;
    });

    selEspecifico.innerHTML = html;
  } catch (err) {
    console.error("Error al popular almacenes específicos:", err);
  }
}

// Evento al cambiar Tipo de Almacén o Sucursal
function alCambiarFiltroTipoOAgrupar() {
  popularAlmacenesEspecificos();
}
window.alCambiarFiltroTipoOAgrupar = alCambiarFiltroTipoOAgrupar;

// C. Consulta y renderizado de Gráfico + Tarjetas KPI
async function actualizarGraficoInsumos() {
  const selInsumo = document.getElementById('txt-insumo-item')?.value?.trim();
  const sucFiltro = document.getElementById('sel-insumo-sucursal')?.value || 'TODAS';
  const tipoAlmFiltro = document.getElementById('sel-insumo-tipo-alm')?.value || 'TODOS';
  const almEspecifico = document.getElementById('sel-insumo-almacen-especifico')?.value || 'TODOS';
  const fechaDesde = document.getElementById('insumo-fecha-desde')?.value || '';
  const fechaHasta = document.getElementById('insumo-fecha-hasta')?.value || '';

  const kpiStock = document.getElementById('kpi-insumo-stock-actual');
  const kpiConsumo = document.getElementById('kpi-insumo-consumo-total');
  const kpiPromedio = document.getElementById('kpi-insumo-promedio-diario');
  const kpiAutonomia = document.getElementById('kpi-insumo-autonomia');

  if (!selInsumo) {
    if (kpiStock) kpiStock.textContent = '0 un.';
    if (kpiConsumo) kpiConsumo.textContent = '0 un.';
    if (kpiPromedio) kpiPromedio.textContent = '0 un./día';
    if (kpiAutonomia) kpiAutonomia.textContent = '-- días';
    return;
  }

  try {
    let query = supabaseTendencias
      .from('stock_historico')
      .select('fecha_registro, stock_total, sucursal_id, tipo_almacen, almacen')
      .ilike('descripcion', `%${selInsumo}%`)
      .order('fecha_registro', { ascending: true });

    if (sucFiltro !== 'TODAS') query = query.eq('sucursal_id', sucFiltro);
    if (tipoAlmFiltro !== 'TODOS') query = query.eq('tipo_almacen', tipoAlmFiltro);
    if (almEspecifico !== 'TODOS') query = query.eq('almacen', almEspecifico);
    if (fechaDesde) query = query.gte('fecha_registro', fechaDesde);
    if (fechaHasta) query = query.lte('fecha_registro', fechaHasta);

    const { data, error } = await query;
    if (error) throw error;

    const registros = data || [];

    // Agrupar suma total por fecha
    const sumaPorFecha = {};
    registros.forEach(r => {
      const f = r.fecha_registro;
      if (!sumaPorFecha[f]) sumaPorFecha[f] = 0;
      sumaPorFecha[f] += (parseInt(r.stock_total, 10) || 0);
    });

    const fechasOrdenadas = Object.keys(sumaPorFecha).sort();
    let serieStock = fechasOrdenadas.map(f => sumaPorFecha[f]);

    if (fechasOrdenadas.length === 0) {
      if (kpiStock) kpiStock.textContent = '0 un.';
      if (kpiConsumo) kpiConsumo.textContent = '0 un.';
      if (kpiPromedio) kpiPromedio.textContent = '0 un./día';
      if (kpiAutonomia) kpiAutonomia.textContent = 'Sin datos';
      if (ten_insumosChart) ten_insumosChart.destroy();
      return;
    }

    // Cálculo de Consumo Neto (Salidas acumuladas)
    let consumoAcumulado = 0;
    for (let i = 1; i < serieStock.length; i++) {
      const diff = serieStock[i - 1] - serieStock[i];
      if (diff > 0) { 
        consumoAcumulado += diff;
      }
    }

    const stockActual = serieStock[serieStock.length - 1];
    const cantDias = Math.max(1, fechasOrdenadas.length);
    const promedioDiario = parseFloat((consumoAcumulado / cantDias).toFixed(1));

    let autonomiaDias = '--';
    if (promedioDiario > 0) {
      autonomiaDias = Math.round(stockActual / promedioDiario) + ' días';
    } else {
      autonomiaDias = '∞ Sin Consumo';
    }

    // Actualizar Tarjetas KPI
    if (kpiStock) kpiStock.textContent = `${stockActual.toLocaleString('es-AR')} un.`;
    if (kpiConsumo) kpiConsumo.textContent = `${consumoAcumulado.toLocaleString('es-AR')} un.`;
    if (kpiPromedio) kpiPromedio.textContent = `${promedioDiario} un./día`;
    if (kpiAutonomia) kpiAutonomia.textContent = autonomiaDias;

    // Renderizar Gráfico de Insumos
    const canvas = document.getElementById('chartInsumosLine');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (ten_insumosChart) {
      ten_insumosChart.destroy();
    }

    const labelGrafico = almEspecifico !== 'TODOS' 
      ? `${selInsumo} en [${almEspecifico}]` 
      : `${selInsumo} (${tipoAlmFiltro})`;

    ten_insumosChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: fechasOrdenadas,
        datasets: [{
          label: `Evolución: ${labelGrafico}`,
          data: serieStock,
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74, 222, 128, 0.1)',
          fill: true,
          borderWidth: 3,
          tension: 0.2,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#f8fafc', font: { size: 12, weight: 'bold' } } },
          tooltip: {
            backgroundColor: '#0f172a', titleColor: '#38bdf8', bodyColor: '#f8fafc', borderColor: '#334155', borderWidth: 1, padding: 10
          }
        },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
        }
      }
    });

  } catch (err) {
    console.error("Error al calcular gráfico de insumos:", err);
  }
}
window.actualizarGraficoInsumos = actualizarGraficoInsumos;