// ====================================================
// MÓDULO: RADAR MULTISUCURSAL (COMPARATIVO)
// Lee sus propios datos desde Supabase, una sola vez.
// ====================================================

let radar_charts = {};
let radar_datosCache = null;
let radar_catalogoCache = null;

const NOMBRES_SUC_RADAR = {
  'OBE': 'Oberá',
  'SPD': 'San Pedro',
  'WND': 'Wanda',
  'ELDO': 'Eldorado',
  'ITU': 'Ituzaingó'
};

// Toggle de la sección desplegable
window.toggleRadarMultisucursal = function() {
  const seccion = document.getElementById('sec-radar-multisucursal');
  const icono = document.getElementById('icon-sec-radar');
  if (!seccion) return;

  if (seccion.style.display === 'none' || seccion.style.display === '') {
    seccion.style.display = 'block';
    if (icono) icono.textContent = '▼';

    // Cargar automáticamente la primera vez
    if (!radar_datosCache) {
      cargarDatosRadar(false);
    }
  } else {
    seccion.style.display = 'none';
    if (icono) icono.textContent = '►';
  }
};

function radar_mapearSucursal(sucRaw) {
  const s = (sucRaw || 'OBE').toUpperCase();
  if (s.includes('OBE')) return 'OBE';
  if (s.includes('SPD')) return 'SPD';
  if (s.includes('WND')) return 'WND';
  if (s.includes('ELDO')) return 'ELDO';
  if (s.includes('ITU')) return 'ITU';
  return 'OBE';
}

function radar_actualizarStatus(texto, tipo) {
  const el = document.getElementById('radar-status');
  if (!el) return;
  el.textContent = texto;
  el.style.background = tipo === 'ok' ? '#064e3b' : (tipo === 'error' ? '#7f1d1d' : '#713f12');
  el.style.color = tipo === 'ok' ? '#4ade80' : (tipo === 'error' ? '#fca5a5' : '#fde047');
  el.style.borderColor = tipo === 'ok' ? '#059669' : (tipo === 'error' ? '#dc2626' : '#ca8a04');
}

window.cargarDatosRadar = async function(forzarDescarga) {
  const statusTag = document.getElementById('radar-status');

  const fechaDesde = document.getElementById('radar-filtro-desde')?.value || '';
  const fechaHasta = document.getElementById('radar-filtro-hasta')?.value || '';

  const checkboxes = Array.from(document.querySelectorAll('#radar-contenedor-sucursales input:checked'));
  const sucsSeleccionadas = checkboxes.map(cb => cb.value);
  const labelsGrafico = sucsSeleccionadas.map(cod => NOMBRES_SUC_RADAR[cod] || cod);

  if (sucsSeleccionadas.length === 0) {
    radar_actualizarStatus('⚠️ Seleccioná al menos una sucursal', 'error');
    return;
  }

  // Descarga con cache
  if (forzarDescarga || !radar_datosCache) {
    radar_actualizarStatus('⏳ Consultando Mesa Activa e Histórico...', 'load');

    const db = window.supabaseClient || window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_KEY
    );

    try {
      const [resOperativo, resHistorico, resCat] = await Promise.all([
        db.from('recupero_operativo').select('*').order('fecha_ingreso', { ascending: false }).limit(5000),
        db.from('recupero_historico_equipos').select('*').order('fecha_ingreso', { ascending: false }).limit(5000),
        db.from('catalogo_equipos').select('*')
      ]);

      if (resOperativo.error) throw resOperativo.error;
      if (resHistorico.error) throw resHistorico.error;
      if (resCat.error) throw resCat.error;

      radar_datosCache = [...(resOperativo.data || []), ...(resHistorico.data || [])];
      radar_catalogoCache = resCat.data || [];

      radar_actualizarStatus(`✅ ${radar_datosCache.length} registros descargados`, 'ok');

    } catch (err) {
      console.error('Error al descargar datos del radar:', err);
      radar_actualizarStatus('❌ Error al leer Supabase: ' + err.message, 'error');
      return;
    }
  }

  // Filtrar en JS
  let dataFiltrada = radar_datosCache;

  if (fechaDesde) {
    dataFiltrada = dataFiltrada.filter(r => (r.fecha_ingreso || r.created_at || '') >= fechaDesde);
  }
  if (fechaHasta) {
    dataFiltrada = dataFiltrada.filter(r => (r.fecha_ingreso || r.created_at || '') <= fechaHasta + 'T23:59:59');
  }

  // Contadores por sucursal
  const stats = {};
  sucsSeleccionadas.forEach(suc => {
    stats[suc] = {
      totalRecibidos: 0,
      directoDescarteObs: 0,
      enCirculacionVIP: 0,
      fueraCirculacionVIP: 0,
      pendientesVIP: 0,
      probadosVIP: 0,
      origenPersonalRetiro: 0,
      origenTecnicoReclamos: 0,
      origenSucursal: 0,
      origenOtros: 0
    };
  });

  const normalizar = window.normalizar || ((t) => (t || '').toUpperCase().trim());
  const obtenerInfo = window.obtenerInfoCatalogo || (() => ({ esVIP: false, precioUsd: 0 }));

  dataFiltrada.forEach(row => {
    const suc = radar_mapearSucursal(row.sucursal_id || 'OBE');
    if (!stats[suc]) return;

    const cant = parseInt(row.cantidad || 1, 10) || 1;
    const desc = row.descripcion || row.modelo || row.equipo || 'DESCONOCIDO';
    const descNorm = normalizar(desc);
    const condicion = normalizar(row.condicion || row.estado_final || row.estado || row.veredicto || '');
    const origenRaw = normalizar(row.origen || row.almacen_origen || '');

    if (origenRaw.includes('RETIRO') || origenRaw.includes('PERSONAL')) {
      stats[suc].origenPersonalRetiro += cant;
    } else if (origenRaw.includes('RECLAMO') || origenRaw.includes('TECNICO')) {
      stats[suc].origenTecnicoReclamos += cant;
    } else if (origenRaw.includes('SUCURSAL') || origenRaw.includes('MOSTRADOR') || origenRaw.includes('DEVOLUCION')) {
      stats[suc].origenSucursal += cant;
    } else {
      stats[suc].origenOtros += cant;
    }

    const infoCat = obtenerInfo(descNorm, radar_catalogoCache);
    const esVIP = infoCat.esVIP;

    stats[suc].totalRecibidos += cant;

    const esAprobado = ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO'].some(e => condicion.includes(e));
    const esRechazado = ['DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => condicion.includes(e));

    if (!esVIP) {
      stats[suc].directoDescarteObs += cant;
    } else if (esAprobado) {
      stats[suc].enCirculacionVIP += cant;
    } else if (esRechazado) {
      stats[suc].fueraCirculacionVIP += cant;
    } else {
      stats[suc].pendientesVIP += cant;
    }
  });

  sucsSeleccionadas.forEach(suc => {
    stats[suc].probadosVIP = stats[suc].enCirculacionVIP + stats[suc].fueraCirculacionVIP;
  });

  const metaBase = 50;

  // 1. RECIBIDOS VS DESCARTE OBS
  renderRadar('radarRecibidos', {
    labels: labelsGrafico,
    datasets: [
      {
        label: 'Total Recibidos',
        data: sucsSeleccionadas.map(suc => stats[suc].totalRecibidos),
        borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.25)', borderWidth: 2
      },
      {
        label: 'Descarte Obs.',
        data: sucsSeleccionadas.map(suc => stats[suc].directoDescarteObs),
        borderColor: '#eab308', backgroundColor: 'rgba(234, 179, 8, 0.25)', borderWidth: 2
      }
    ]
  });

  // 2. CANALES DE ORIGEN
  renderRadar('radarOrigen', {
    labels: labelsGrafico,
    datasets: [
      {
        label: 'Personal Retiro',
        data: sucsSeleccionadas.map(suc => stats[suc].origenPersonalRetiro),
        borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.2)', borderWidth: 2
      },
      {
        label: 'Téc. Reclamos',
        data: sucsSeleccionadas.map(suc => stats[suc].origenTecnicoReclamos),
        borderColor: '#fde047', backgroundColor: 'rgba(253, 224, 71, 0.2)', borderWidth: 2
      },
      {
        label: 'Sucursal / Mostrador',
        data: sucsSeleccionadas.map(suc => stats[suc].origenSucursal),
        borderColor: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.2)', borderWidth: 2
      }
    ]
  });

  // 3. VIP CIRCULACIÓN VS DESCARTE
  renderRadar('radarVIP', {
    labels: labelsGrafico,
    datasets: [
      {
        label: 'En Circulación VIP',
        data: sucsSeleccionadas.map(suc => stats[suc].enCirculacionVIP),
        borderColor: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.25)', borderWidth: 2
      },
      {
        label: 'Fuera Circulación VIP',
        data: sucsSeleccionadas.map(suc => stats[suc].fueraCirculacionVIP),
        borderColor: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.25)', borderWidth: 2
      }
    ]
  });

  // 4. RITMO VS META
  renderRadar('radarRitmo', {
    labels: labelsGrafico,
    datasets: [
      {
        label: 'Probados VIP (Total)',
        data: sucsSeleccionadas.map(suc => stats[suc].probadosVIP),
        borderColor: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.3)', borderWidth: 3
      },
      {
        label: `Meta (${metaBase} un.)`,
        data: sucsSeleccionadas.map(() => metaBase),
        borderColor: '#94a3b8', borderDash: [5, 5], backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0
      }
    ]
  });

  if (radar_datosCache) {
    radar_actualizarStatus(`✅ ${dataFiltrada.length} registros consolidados`, 'ok');
  }
};

function renderRadar(canvasId, chartData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (radar_charts[canvasId]) {
    radar_charts[canvasId].destroy();
  }

  radar_charts[canvasId] = new Chart(ctx, {
    type: 'radar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          ticks: {
            color: '#94a3b8',
            backdropColor: 'transparent',
            font: { size: 10, weight: 'bold' }
          },
          grid: { color: '#334155' },
          angleLines: { color: '#475569' },
          pointLabels: {
            color: '#f8fafc',
            font: { size: 12, weight: '800' }
          }
        }
      },
      plugins: {
        legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' }, boxWidth: 12 } },
        tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 }
      }
    }
  });
}