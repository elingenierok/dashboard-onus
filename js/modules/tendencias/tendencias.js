// ====================================================
// MÓDULO AUTÓNOMO: TENDENCIAS E INTELIGENCIA PREDICTIVA
// ====================================================

const SUPABASE_URL_TEN = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_TEN = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseTendencias = supabase.createClient(SUPABASE_URL_TEN, SUPABASE_KEY_TEN);

const COLORES_SUCURSAL = {
  'OBE_ALM_PRINCIPAL': { nombre: 'OBE Principal', color: '#0284c7' },
  'OBE_ALM_CATRIEL':   { nombre: 'OBE Catriel',   color: '#38bdf8' },
  'SPD_ALM_PRINCIPAL': { nombre: 'San Pedro',     color: '#ea580c' },
  'WND_ALM_PRINCIPAL': { nombre: 'Wanda',         color: '#eab308' },
  'ITU_ALM_PRINCIPAL': { nombre: 'Ituzaingó',     color: '#16a34a' },
  'ELDO_ALM_PRINCIPAL':{ nombre: 'Eldorado',      color: '#a855f7' }
};

let rawHistoricoData = [];
let catalogoEquiposMemoria = [];
let tendenciasChart = null;

function normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function obtenerCategoriaCatalogo(descNorm) {
  const encontrado = catalogoEquiposMemoria.find(item => {
    const itemNorm = item.modelo_norm || normalizar(item.modelo);
    return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
  });

  return encontrado && encontrado.categoria ? encontrado.categoria.toUpperCase() : 'OBSOLETO';
}

// CÁLCULO DE REGRESIÓN IGNORANDO DÍAS NULOS (SÁBADOS/DOMINGOS SIN DATOS)
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

    rawHistoricoData = resHist || [];
    catalogoEquiposMemoria = resCat.data || [];

    if (tag) {
      tag.textContent = `Supabase: ✅ ${rawHistoricoData.length} Reg. [${sucActiva}]`;
      tag.className = 'file-tag ok';
    }

    inicializarLimitesFechas();
    actualizarGraficoTendencias();
  } catch (err) {
    console.error('Error al consultar Supabase:', err);
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
      .select('fecha_registro, almacen, descripcion, stock_total')
      .ilike('descripcion', '%ONU%')
      .order('fecha_registro', { ascending: true })
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

function inicializarLimitesFechas() {
  if (!rawHistoricoData.length) return;

  const todasFechas = [...new Set(rawHistoricoData.map(d => d.fecha_registro))].sort();
  const inputDesde = document.getElementById('tendencia-desde');
  const inputHasta = document.getElementById('tendencia-hasta');

  if (inputDesde && !inputDesde.value) {
    const indiceInicio = Math.max(0, todasFechas.length - 30);
    inputDesde.value = todasFechas[indiceInicio];
  }
  if (inputHasta && !inputHasta.value) {
    inputHasta.value = todasFechas[todasFechas.length - 1];
  }
}

function actualizarGraficoTendencias() {
  if (!rawHistoricoData.length) return;

  const almacenesTildados = Array.from(document.querySelectorAll('#check-almacenes input:checked')).map(cb => cb.value);
  const onusTildadas = Array.from(document.querySelectorAll('#check-onus input:checked')).map(cb => cb.value);
  const checkProyeccion = document.getElementById('check-proyeccion-global');
  const activarProyecciones = checkProyeccion ? checkProyeccion.checked : false;

  const zoomVistaVal = document.getElementById('zoom-vista')?.value || 'ALL';
  const fechaDesdeVal = document.getElementById('tendencia-desde')?.value || '';
  const fechaHastaVal = document.getElementById('tendencia-hasta')?.value || '';

  const incluirDB = onusTildadas.includes('DUAL_BAND');
  const incluirCATV = onusTildadas.includes('CATV');

  const todasFechas = [...new Set(rawHistoricoData.map(d => d.fecha_registro))].sort();

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

  rawHistoricoData.forEach(row => {
    let alm = (row.almacen || '').trim().toUpperCase();
    if (alm === 'SPD_PRINCIPAL') alm = 'SPD_ALM_PRINCIPAL';
    if (alm === 'WND_PRINCIPAL' || alm === 'WND-PRINCIPAL') alm = 'WND_ALM_PRINCIPAL';

    if (!almacenesTildados.includes(alm)) return;

    const fecha = row.fecha_registro;
    const descNorm = normalizar(row.descripcion);
    const cat = obtenerCategoriaCatalogo(descNorm);

    const esDB = (cat === 'DUAL_BAND');
    const esCATV = (cat === 'CATV');

    if ((esDB && incluirDB) || (esCATV && incluirCATV)) {
      if (mapaSuma[alm][fecha] === null) {
        mapaSuma[alm][fecha] = 0;
      }
      mapaSuma[alm][fecha] += (parseInt(row.stock_total, 10) || 0);
    }
  });

  const datasets = [];
  let htmlEstimaciones = '';

  almacenesTildados.forEach(alm => {
    const meta = COLORES_SUCURSAL[alm] || { nombre: alm, color: '#cbd5e1' };
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

  if (tendenciasChart) {
    tendenciasChart.data.labels = fechasVisibles;
    tendenciasChart.data.datasets = datasets;
    tendenciasChart.update();
  } else {
    tendenciasChart = new Chart(ctx, {
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
}

// INICIALIZACIÓN (Desacoplada para control centralizado desde app.js / auth.js)