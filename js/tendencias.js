// ====================================================
// MÓDULO AUTÓNOMO: TENDENCIAS, PAGINACIÓN E INTELIGENCIA PREDICTIVA
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

const DUAL_BAND_LIST = [
  "ONU ZTE F6201B V9.3 WIFI6 AX3000",
  "ONU ZTE F6201B V9.3 WIFI6 AX3000(USADO)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS) (USADA)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI (USADA)"
];

const CATV_LIST = [
  "ONU HUAWEI ECHOLIFE EG8147X6",
  "ONU HUAWEI ECHOLIFE EG8147X6(USADO)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV)(USADA)"
];

let rawHistoricoData = [];
let tendenciasChart = null;

// MOTOR DE PREDICCIÓN: Calculadora de Regresión Lineal
function calcularRegresionLineal(fechas, valores) {
  if (fechas.length < 2) return null;

  // Normalizamos las fechas a "días transcurridos" desde el primer dato
  const fecha0 = new Date(fechas[0]).getTime() / 86400000;
  const xData = fechas.map(f => (new Date(f).getTime() / 86400000) - fecha0);
  const yData = valores;
  const n = xData.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xData[i];
    sumY += yData[i];
    sumXY += xData[i] * yData[i];
    sumXX += xData[i] * xData[i];
  }

  // Pendiente (m) y Ordenada al origen (b)
  const divisor = (n * sumXX - sumX * sumX);
  if (divisor === 0) return null; // Evita división por cero si solo hay 1 fecha repetida

  const m = (n * sumXY - sumX * sumY) / divisor;
  const b = (sumY - m * sumX) / n;

  // Puntos ideales de la recta de tendencia
  const trendData = xData.map(x => Math.max(0, m * x + b)); // Math.max para no graficar negativos

  // Cálculo: ¿En cuántos días a partir del ÚLTIMO día registrado llegamos a 0?
  let diasParaCero = null;
  const lastX = xData[n - 1];
  
  if (m < -0.01) { // Solo si hay una pendiente descendente clara
    const xZero = -b / m;
    diasParaCero = Math.max(0, Math.round(xZero - lastX));
  }

  return { trendData, m, diasParaCero };
}

async function cargarModuloTendencias() {
  const tag = document.getElementById('tagTendencias');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Descargando historial...';
    tag.className = 'file-tag no';
  }

  try {
    let allData = [];
    let from = 0;
    const step = 999;
    let hasMore = true;

    // Bucle para evadir el límite de 1000 filas de Supabase
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

    rawHistoricoData = allData;

    if (tag) {
      tag.textContent = `Supabase: ✅ ${rawHistoricoData.length} Registros Cargados`;
      tag.className = 'file-tag ok';
    }

    actualizarGraficoTendencias();
  } catch (err) {
    console.error('Error al consultar Supabase:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error de lectura';
      tag.className = 'file-tag no';
    }
  }
}

function actualizarGraficoTendencias() {
  if (!rawHistoricoData.length) return;

  const almacenesTildados = Array.from(document.querySelectorAll('#check-almacenes input:checked')).map(cb => cb.value);
  const onusTildadas = Array.from(document.querySelectorAll('#check-onus input:checked')).map(cb => cb.value);
  const checkProyeccion = document.getElementById('check-proyeccion-global');
  const activarProyecciones = checkProyeccion ? checkProyeccion.checked : false;

  const incluirDB = onusTildadas.includes('DUAL_BAND');
  const incluirCATV = onusTildadas.includes('CATV');

  const fechasUnicas = [...new Set(rawHistoricoData.map(d => d.fecha_registro))].sort();

  const mapaSuma = {};
  almacenesTildados.forEach(alm => {
    mapaSuma[alm] = {};
    fechasUnicas.forEach(f => mapaSuma[alm][f] = 0);
  });

  rawHistoricoData.forEach(row => {
    let alm = (row.almacen || '').trim().toUpperCase();
    if (alm === 'SPD_PRINCIPAL') alm = 'SPD_ALM_PRINCIPAL';
    if (alm === 'WND_PRINCIPAL' || alm === 'WND-PRINCIPAL') alm = 'WND_ALM_PRINCIPAL';

    const fecha = row.fecha_registro;
    const descNorm = (row.descripcion || '').replace(/\s+/g, ' ').trim().toUpperCase();

    if (!almacenesTildados.includes(alm)) return;

    const esDB = DUAL_BAND_LIST.some(item => {
      const itemNorm = item.replace(/\s+/g, ' ').trim().toUpperCase();
      return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
    });

    const esCATV = CATV_LIST.some(item => {
      const itemNorm = item.replace(/\s+/g, ' ').trim().toUpperCase();
      return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
    });

    if ((esDB && incluirDB) || (esCATV && incluirCATV)) {
      mapaSuma[alm][fecha] = (mapaSuma[alm][fecha] || 0) + (parseInt(row.stock_total, 10) || 0);
    }
  });

  const datasets = [];
  let htmlEstimaciones = '';

  almacenesTildados.forEach(alm => {
    const meta = COLORES_SUCURSAL[alm] || { nombre: alm, color: '#cbd5e1' };
    const dataPuntos = fechasUnicas.map(f => mapaSuma[alm][f]);

    // 1. Agregar línea real del stock
    datasets.push({
      label: meta.nombre,
      data: dataPuntos,
      borderColor: meta.color,
      backgroundColor: meta.color,
      tension: 0.3,
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 8
    });

    // 2. Si las proyecciones están activas, calculamos y graficamos la tendencia
    if (activarProyecciones) {
      const regresion = calcularRegresionLineal(fechasUnicas, dataPuntos);
      
      if (regresion) {
        // Línea punteada de tendencia
        datasets.push({
          label: `Tendencia ${meta.nombre}`,
          data: regresion.trendData,
          borderColor: meta.color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4], // Efecto Punteado
          pointRadius: 0, // Sin puntos para no molestar visualmente
          tension: 0
        });

        // Tarjeta de estimación para el panel inferior
        let estadoHtml = '';
        if (regresion.m >= -0.01) {
          estadoHtml = `<strong style="color: #4ade80;">📈 Stock Estable o en Alza</strong>`;
        } else {
          const dias = regresion.diasParaCero;
          let colorDías = '#4ade80'; // Verde (muchos días)
          if (dias <= 15) colorDías = '#f87171'; // Rojo (Crítico)
          else if (dias <= 30) colorDías = '#facc15'; // Amarillo (Precaución)

          estadoHtml = `En <strong style="color: ${colorDías}; font-size: 1.2rem;">${dias} días</strong> aprox.`;
        }

        htmlEstimaciones += `
          <div style="background: #0f172a; border: 1px solid ${meta.color}; border-left: 4px solid ${meta.color}; padding: 12px; border-radius: 6px;">
            <div style="color: #cbd5e1; font-size: 0.8rem; font-weight: bold; margin-bottom: 4px;">${meta.nombre}</div>
            <div style="color: #f8fafc; font-size: 1rem;">${estadoHtml}</div>
          </div>
        `;
      }
    }
  });

  // Mostrar u Ocultar panel de proyecciones
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

  // Renderizar o Actualizar Chart.js
  const canvas = document.getElementById('chartTendenciasLines');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (tendenciasChart) {
    tendenciasChart.data.labels = fechasUnicas;
    tendenciasChart.data.datasets = datasets;
    tendenciasChart.update();
  } else {
    tendenciasChart = new Chart(ctx, {
      type: 'line',
      data: { labels: fechasUnicas, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'top', 
            labels: { color: '#cbd5e1', font: { size: 12, weight: 'bold' } } 
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#38bdf8',
            bodyColor: '#f8fafc',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12
          }
        },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  cargarModuloTendencias();
});