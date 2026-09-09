// ====================================================
// MÓDULO 1: DATOS Y ESTADO GLOBAL DE RECUPERO
// ====================================================

const SUPABASE_URL_REC = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REC = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseRecupero = supabase.createClient(SUPABASE_URL_REC, SUPABASE_KEY_REC);

// Estado Global Expuesto (Estructura Unificada)
window.EstadoRecupero = {
  cargado: false,
  totalRecibidos: 0,
  directoDescarteObs: 0,
  enCirculacionVIP: 0,
  fueraCirculacionVIP: 0,
  pendientesVIP: 0, // 👈 Agregado para equipos VIP sin veredicto
  probadosVIP: 0,
  pctReaprovechamiento: "0.0",
  valorPromedioRecuperado: 0,
  capitalRevalorizado: 0,
  capitalTotal: 0, // 👈 Normalizado con la actualización
  recuperadosHoy: 0,
  itemsIngresadosHoy: [],
  itemsVipTesteadosHoy: [],
  desgloseOperativo: {},
  origenPersonalRetiro: 0,
  origenTecnicoReclamos: 0,
  origenSucursal: 0,
  origenOtros: 0
};

function normalizar(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function esDeHoy(fechaIso) {
  if (!fechaIso) return false;
  const f = new Date(fechaIso);
  if (isNaN(f.getTime())) return false;
  
  const hoy = new Date();
  return f.getDate() === hoy.getDate() &&
         f.getMonth() === hoy.getMonth() &&
         f.getFullYear() === hoy.getFullYear();
}

function obtenerHoraCorta(fechaIso) {
  if (!fechaIso) return '--:--';
  const f = new Date(fechaIso);
  if (isNaN(f.getTime())) return '--:--';
  return f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function obtenerInfoCatalogo(descNorm, catalogo) {
  if (!descNorm) return { esVIP: false, precioUsd: 0.0 };

  // Búsqueda exacta primero, luego coincidencia segura de subcadena
  const encontrado = catalogo.find(item => {
    const itemNorm = item.modelo_norm || normalizar(item.modelo);
    if (!itemNorm) return false;
    return descNorm === itemNorm || descNorm.includes(itemNorm);
  });

  return encontrado 
    ? { esVIP: Boolean(encontrado.es_vip), precioUsd: parseFloat(encontrado.precio_usd) || 0.0 }
    : { esVIP: false, precioUsd: 0.0 };
}

async function cargarModuloRecupero() {
  const tag = document.getElementById('tagRecupero');
  if (tag) {
    tag.textContent = 'Supabase: ⏳ Consultando...';
    tag.className = 'file-tag no';
  }

  try {
    const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

    // 1. Traemos los últimos 5000 registros, ordenados por FECHA REAL
    const [resRec, resCatalogo] = await Promise.all([
      supabaseRecupero
        .from('recupero_operativo')
        .select('*')
        .order('fecha_ingreso', { ascending: false })
        .limit(5000),
      supabaseRecupero
        .from('catalogo_equipos')
        .select('*')
    ]);

    if (resRec.error) throw resRec.error;
    if (resCatalogo.error) throw resCatalogo.error;

    const dataRecCrudo = resRec.data || [];
    const catalogo = resCatalogo.data || [];

    // 2. Filtrado estricto en JS
    const dataRec = dataRecCrudo.filter(row => {
      if (sucActiva === 'TODAS') return true;
      return (row.sucursal_id || 'OBE') === sucActiva;
    });

    if (tag) {
      tag.textContent = `Supabase: ✅ ${dataRec.length} Registros [${sucActiva}]`;
      tag.className = 'file-tag ok';
    }

    // 3. Procesar Cabeceras y Tabla Vieja
    procesarDatosRecupero(dataRec, catalogo);

    // 4. NUEVO: DIBUJAR LA TABLA DE RENDIMIENTO DIARIO
    if (typeof renderTablaRecuperoDiario === 'function') {
      renderTablaRecuperoDiario(dataRec, catalogo);
    } else {
      console.warn("⚠️ La función renderTablaRecuperoDiario no está definida. Revisá si pegaste el código en recupero_ui.js");
    }

    // 5. Disparar renderizado adicional de UI
    if (typeof window.renderizarModuloRecuperoUI === 'function') {
      try {
        window.renderizarModuloRecuperoUI();
      } catch (uiErr) {
        console.error('Error al renderizar UI de Recupero:', uiErr);
      }
    }
  } catch (err) {
    console.error('Error al cargar datos de Recupero:', err);
    if (tag) {
      tag.textContent = 'Supabase: ❌ Error';
      tag.className = 'file-tag no';
    }
  }
}

function procesarDatosRecupero(data, catalogo) {
  let totalRecibidos = 0;
  let directoDescarteObs = 0;
  let enCirculacionVIP = 0;
  let fueraCirculacionVIP = 0;
  let pendientesVIP = 0;
  let capitalRevalorizado = 0;
  let recuperadosHoy = 0;

  let origenPersonalRetiro = 0;
  let origenTecnicoReclamos = 0;
  let origenSucursal = 0;
  let origenOtros = 0;

  const desgloseOperativo = {};
  const itemsIngresadosHoy = [];
  const itemsVipTesteadosHoy = [];

  data.forEach(row => {
    const cant = parseInt(row.cantidad || 1, 10) || 1;
    const desc = row.descripcion || row.modelo || row.equipo || 'DESCONOCIDO';
    const descNorm = normalizar(desc);
    const condicion = normalizar(row.condicion || row.estado_final || row.estado || row.veredicto || '');
    
    // Clasificación por Origen
    const origenRaw = normalizar(row.origen || row.almacen_origen || '');
    if (origenRaw.includes('RETIRO') || origenRaw.includes('PERSONAL')) {
      origenPersonalRetiro += cant;
    } else if (origenRaw.includes('RECLAMO') || origenRaw.includes('TECNICO')) {
      origenTecnicoReclamos += cant;
    } else if (origenRaw.includes('SUCURSAL') || origenRaw.includes('MOSTRADOR') || origenRaw.includes('DEVOLUCION')) {
      origenSucursal += cant;
    } else {
      origenOtros += cant;
    }

    const infoCat = obtenerInfoCatalogo(descNorm, catalogo);
    const esEquipoVIP = infoCat.esVIP;
    const precioUnit = infoCat.precioUsd;

    totalRecibidos += cant;

    if (!desgloseOperativo[descNorm]) {
      desgloseOperativo[descNorm] = { desc: desc, vip: esEquipoVIP, circ: 0, descVIP: 0, descObs: 0, pendVIP: 0 };
    }

    const esAprobado = ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO'].some(e => condicion.includes(e));
    const esRechazado = ['DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => condicion.includes(e));

    const fechaIng = row.fecha_ingreso || row.created_at;
    const fechaFin = row.fin_prueba;

    if (esDeHoy(fechaIng)) {
      itemsIngresadosHoy.push({
        hora: obtenerHoraCorta(fechaIng),
        sn: row.sn || 'SIN SN',
        modelo: desc,
        esVIP: esEquipoVIP,
        tecnico: row.tecnico || 'Operador'
      });
    }

    if (esEquipoVIP && fechaFin && esDeHoy(fechaFin)) {
      itemsVipTesteadosHoy.push({
        hora: obtenerHoraCorta(fechaFin),
        sn: row.sn || 'SIN SN',
        modelo: desc,
        esAprobado: esAprobado,
        condicionRaw: condicion,
        observaciones: row.observaciones || 'Sin detalles'
      });
    }

    if (!esEquipoVIP) {
      directoDescarteObs += cant;
      desgloseOperativo[descNorm].descObs += cant;
    } else if (esAprobado) {
      enCirculacionVIP += cant;
      capitalRevalorizado += (cant * precioUnit);
      desgloseOperativo[descNorm].circ += cant;

      if (esDeHoy(fechaFin)) {
        recuperadosHoy += cant;
      }
    } else if (esRechazado) {
      fueraCirculacionVIP += cant;
      desgloseOperativo[descNorm].descVIP += cant;
    } else {
      // Caso VIP sin testear / sin resolución
      pendientesVIP += cant;
      desgloseOperativo[descNorm].pendVIP += cant;
    }
  });

  const probadosVIP = enCirculacionVIP + fueraCirculacionVIP;
  const pctReaprovechamiento = probadosVIP > 0 ? ((enCirculacionVIP / probadosVIP) * 100).toFixed(1) : "0.0";
  const valorPromedioRecuperado = enCirculacionVIP > 0 ? Math.round(capitalRevalorizado / enCirculacionVIP) : 0;

  // Estado Global Sincronizado
  window.EstadoRecupero = {
    cargado: true,
    totalRecibidos,
    directoDescarteObs,
    enCirculacionVIP,
    fueraCirculacionVIP,
    pendientesVIP,
    probadosVIP,
    pctReaprovechamiento,
    valorPromedioRecuperado,
    capitalRevalorizado,
    capitalTotal: capitalRevalorizado,
    recuperadosHoy,
    itemsIngresadosHoy,
    itemsVipTesteadosHoy,
    desgloseOperativo,
    origenPersonalRetiro,
    origenTecnicoReclamos,
    origenSucursal,
    origenOtros
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cargarModuloRecupero);
} else {
  cargarModuloRecupero();
}