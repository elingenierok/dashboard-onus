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

async function cargarModuloTendencias() {
  const tag = document.getElementById('tagTendencias');
  try {
    // Consultamos la tabla de prueba liberada
    const { data, error } = await supabaseTendencias
      .from('stock_historico')
      .select('fecha_registro, almacen, descripcion, stock_total')
      .order('fecha_registro', { ascending: true });

    if (error) throw error;

    rawHistoricoData = data || [];
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

  const incluirDB = onusTildadas.includes('DUAL_BAND');
  const incluirCATV = onusTildadas.includes('CATV');

  const fechasUnicas = [...new Set(rawHistoricoData.map(d => d.fecha_registro))].sort();

  const mapaSuma = {};
  almacenesTildados.forEach(alm => {
    mapaSuma[alm] = {};
    fechasUnicas.forEach(f => mapaSuma[alm][f] = 0);
  });

  rawHistoricoData.forEach(row => {
    const alm = row.almacen;
    const fecha = row.fecha_registro;
    const descNorm = (row.descripcion || '').trim().toUpperCase();

    if (!almacenesTildados.includes(alm)) return;

    const esDB = DUAL_BAND_LIST.some(item => descNorm.includes(item.toUpperCase()));
    const esCATV = CATV_LIST.some(item => descNorm.includes(item.toUpperCase()));

    if ((esDB && incluirDB) || (esCATV && incluirCATV)) {
      mapaSuma[alm][fecha] = (mapaSuma[alm][fecha] || 0) + (parseInt(row.stock_total, 10) || 0);
    }
  });

  const datasets = almacenesTildados.map(alm => {
    const meta = COLORES_SUCURSAL[alm] || { nombre: alm, color: '#cbd5e1' };
    const dataPuntos = fechasUnicas.map(f => mapaSuma[alm][f]);

    return {
      label: meta.nombre,
      data: dataPuntos,
      borderColor: meta.color,
      backgroundColor: meta.color,
      tension: 0.3,
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 8
    };
  });

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
          legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 12, weight: 'bold' } } },
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