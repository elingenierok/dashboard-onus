// ====================================================
// MÓDULO 3: ACCIONES Y CIERRE SEMANAL DE RECUPERO (MULTISUCURSAL)
// ====================================================

async function ejecutarCierreSemanal() {
  const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';

  if (sucActiva === 'TODAS') {
    alert("⚠️ Para ejecutar un cierre semanal debes seleccionar una sucursal específica en el selector del header (ej. Oberá o San Pedro). No se puede cerrar en vista global 'TODAS'.");
    return;
  }

  const confirmacion = confirm(
    `⚠️ ¿Estás seguro de cerrar la semana actual para la sucursal [ ${sucActiva} ]?\n\n` +
    "- Los equipos procesados de esta sucursal se archivarán en el historial.\n" +
    "- Se conservarán las métricas exactas de tiempo de prueba y espera.\n" +
    "- Se generará un resumen numérico consolidado por sucursal.\n" +
    "- Los equipos 'PENDIENTES' se mantendrán en la mesa activa.\n\n" +
    "Esta acción no se puede deshacer."
  );

  if (!confirmacion) return;

  try {
    const [resTodos, resCatalogo] = await Promise.all([
      supabaseRecupero.from('recupero_operativo').select('*'),
      supabaseRecupero.from('catalogo_equipos').select('*')
    ]);

    if (resTodos.error) throw resTodos.error;
    if (resCatalogo.error) throw resCatalogo.error;

    const todosCrudos = resTodos.data || [];
    const catalogo = resCatalogo.data || [];

    // FILTRADO POR SUCURSAL ACTIVA (Soporta registros viejos asignando 'OBE' por defecto)
    const todos = todosCrudos.filter(row => (row.sucursal_id || 'OBE') === sucActiva);

    if (todos.length === 0) {
      alert(`⚠️ No hay equipos registrados en la mesa activa para la sucursal [ ${sucActiva} ].`);
      return;
    }

    const probados = todos.filter(row => {
      const cond = normalizar(row.condicion || row.estado || '');
      return ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO', 'DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => cond.includes(e));
    });

    if (probados.length === 0) {
      alert(`⚠️ No hay equipos con veredicto final para cerrar esta semana en [ ${sucActiva} ]. Los equipos 'PENDIENTES' permanecerán en la mesa.`);
      return;
    }

    let enCirc = 0, descVip = 0, descObs = 0, valorUsd = 0;
    const desglose = {};

    probados.forEach(row => {
      const cant = parseInt(row.cantidad || 1, 10) || 1;
      const desc = row.descripcion || row.modelo || 'DESCONOCIDO';
      const descNorm = normalizar(desc);
      const cond = normalizar(row.condicion || row.estado || '');

      const infoCat = obtenerInfoCatalogo(descNorm, catalogo);
      const esEquipoVIP = infoCat.esVIP;
      const precio = infoCat.precioUsd;

      if (!desglose[descNorm]) {
        desglose[descNorm] = { desc: desc, vip: esEquipoVIP, circ: 0, descVIP: 0, descObs: 0 };
      }

      const esAprobado = ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO'].some(e => cond.includes(e));

      if (!esEquipoVIP) {
        descObs += cant;
        desglose[descNorm].descObs += cant;
      } else if (esAprobado) {
        enCirc += cant;
        valorUsd += (cant * precio);
        desglose[descNorm].circ += cant;
      } else {
        descVip += cant;
        desglose[descNorm].descVIP += cant;
      }
    });

    const fechaHoy = new Date().toISOString().split('T')[0];
    const semanaLabel = `Semana Cierre ${fechaHoy} (${sucActiva})`;

    // COPIA AL HISTORIAL CON ETIQUETA DE SUCURSAL
    const copiaHistorico = probados.map(row => ({
      fecha_ingreso: row.fecha_ingreso,
      codigo: row.codigo,
      descripcion: row.descripcion,
      sn: row.sn,
      condicion: row.condicion,
      tecnico: row.tecnico,
      almacen_origen: row.almacen_origen,
      observaciones: row.observaciones,
      inicio_prueba: row.inicio_prueba,
      fin_prueba: row.fin_prueba,
      tiempo_prueba_seg: row.tiempo_prueba_seg,
      tiempo_espera_hs: row.tiempo_espera_hs,
      sucursal_id: row.sucursal_id || sucActiva
    }));

    const { error: errHist } = await supabaseRecupero
      .from('recupero_historico_equipos')
      .insert(copiaHistorico);

    if (errHist) throw errHist;

    // INFORME SEMANAL CON ETIQUETA DE SUCURSAL
    const { error: errInforme } = await supabaseRecupero
      .from('recupero_informes_semanales')
      .insert([{
        semana_label: semanaLabel,
        total_recibidos: probados.length,
        en_circulacion: enCirc,
        descarte_vip: descVip,
        descarte_obsoleto: descObs,
        valor_recuperado_usd: valorUsd,
        desglose_operativo: desglose,
        sucursal_id: sucActiva
      }]);

    if (errInforme) throw errInforme;

    // BORRADO DE LA MESA ACTIVA SOLO DE LOS EQUIPOS PROCESADOS DE ESTA SUCURSAL
    const idsProcesados = probados.map(r => r.id);
    const { error: errBorrado } = await supabaseRecupero
      .from('recupero_operativo')
      .delete()
      .in('id', idsProcesados);

    if (errBorrado) throw errBorrado;

    alert(`🎉 Cierre semanal de [ ${sucActiva} ] completado con éxito.\n\n` +
          `- Procesados y Archivados: ${probados.length} equipos.\n` +
          `- Pendientes conservados: ${todos.length - probados.length} equipos.`);

    cargarModuloRecupero();

  } catch (err) {
    console.error("❌ Error en el cierre semanal:", err);
    alert("Ocurrió un error al intentar realizar el cierre semanal.");
  }
}

// ====================================================
// FUNCIÓN AUXILIAR: CASCADA DE EVALUACIÓN DE FORMATO
// ====================================================
function evaluarFormatoSerial(sn) {
  // PREGUNTA 1: ¿Está vacío?
  if (!sn) {
    return { valido: false, mensaje: 'Debes ingresar un número de Serie (SN).' };
  }

  // PREGUNTA 2: ¿Tiene longitud aceptable?
  if (sn.length < 10 || sn.length > 20) {
    return { 
      valido: false, 
      mensaje: `Longitud inválida (${sn.length} caracteres). Se esperan entre 10 y 20 caracteres.` 
    };
  }

  // PREGUNTA 3: ¿Es un Serial Estándar (con prefijo de marca)?
  const PREFIJOS = ['ZTEGD', 'HWTC', 'FKBA', 'ALCL', 'GPON', 'SN'];
  const esSerialEstandar = PREFIJOS.some(prefijo => sn.startsWith(prefijo));

  // PREGUNTA 4: ¿Es un Serial Largo Escaneado (Hexadecimal de 16 caracteres)?
  // Detecta patrones como 48575443... (HWTC) o 5A54454744... (ZTEGD)
  const esSerialLargoHex = /^[0-9A-F]{16}$/.test(sn);

  // DECISIÓN FINAL DE FORMATO:
  // Si Pasa la Pregunta 3 O Pasa la Pregunta 4 -> ¡ES VÁLIDO!
  if (esSerialEstandar || esSerialLargoHex) {
    return { valido: true };
  }

  // Si no cumplió ninguna de las dos formas validas:
  return {
    valido: false,
    mensaje: `El serial "${sn}" no tiene un formato válido.\n\n` +
             `Debe cumplir una de estas opciones:\n` +
             `• Iniciar con prefijo: ${PREFIJOS.join(', ')}\n` +
             `• Ser un Serial Largo de escáner (16 caracteres hexadecimales).`
  };
}


// ====================================================
// INGRESO DE EQUIPO CON VALIDACIÓN RIGUROSA Y ANTI-DUPLICADOS
// ====================================================
async function registrarIngresoEquipo(event) {
  if (event) event.preventDefault();

  const btnGuardar = document.getElementById('btn-guardar-recupero');
  if (!btnGuardar || btnGuardar.disabled) return;

  btnGuardar.disabled = true;
  const textoOriginal = btnGuardar.innerHTML;
  btnGuardar.innerHTML = '⏳ Verificando...';

  try {
    const inputSN = document.getElementById('txt-sn-equipo');
    const rawSN = inputSN ? inputSN.value : '';
    const snLimpio = rawSN.trim().toUpperCase().replace(/\s+/g, '');

    // 1. PASAR POR LA CASCADA DE FILTROS DE FORMATO
    const chequeoFormato = evaluarFormatoSerial(snLimpio);
    if (!chequeoFormato.valido) {
      throw new Error(chequeoFormato.mensaje);
    }

    // 2. CONSULTAR DUPLICADOS EN BASE DE DATOS (Mesa Activa e Histórico)
    btnGuardar.innerHTML = '🔍 Buscando duplicados...';

    const [resActivos, resHistorico] = await Promise.all([
      supabaseRecupero.from('recupero_operativo').select('id, sn, sucursal_id').ilike('sn', snLimpio).limit(1),
      supabaseRecupero.from('recupero_historico_equipos').select('id, sn, sucursal_id').ilike('sn', snLimpio).limit(1)
    ]);

    if (resActivos.error) throw resActivos.error;
    if (resHistorico.error) throw resHistorico.error;

    if (resActivos.data && resActivos.data.length > 0) {
      const reg = resActivos.data[0];
      throw new Error(`🚫 EL SERIAL YA EXISTE en la mesa activa [Sucursal ${reg.sucursal_id || 'DESCONOCIDA'}].`);
    }

    if (resHistorico.data && resHistorico.data.length > 0) {
      const regHist = resHistorico.data[0];
      throw new Error(`🚫 EL SERIAL YA FUE PROCESADO en un Cierre Semanal [Sucursal ${regHist.sucursal_id || 'DESCONOCIDA'}].`);
    }

    // 3. INSERCIÓN DE DATOS
    btnGuardar.innerHTML = '💾 Guardando...';

    const sucActiva = window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';
    
    const { error: errInsert } = await supabaseRecupero
      .from('recupero_operativo')
      .insert([{
        sn: snLimpio,
        sucursal_id: sucActiva,
        fecha_ingreso: new Date().toISOString(),
        condicion: 'PENDIENTE'
      }]);

    if (errInsert) throw errInsert;

    alert(`✅ Equipo SN: ${snLimpio} ingresado correctamente.`);
    if (inputSN) inputSN.value = '';

    if (typeof cargarModuloRecupero === 'function') cargarModuloRecupero();

  } catch (err) {
    alert(`⚠️ ATENCIÓN:\n\n${err.message}`);
  } finally {
    setTimeout(() => {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = textoOriginal;
    }, 600);
  }
}