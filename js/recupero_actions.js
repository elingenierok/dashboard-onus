// ====================================================
// MÓDULO 3: ACCIONES Y CIERRE SEMANAL DE RECUPERO
// ====================================================

async function ejecutarCierreSemanal() {
  const confirmacion = confirm(
    "⚠️ ¿Estás seguro de cerrar la semana actual?\n\n" +
    "- Los equipos con veredicto final (OK/Descarte) se archivarán en el historial.\n" +
    "- Se conservarán las métricas exactas de tiempo de prueba y espera.\n" +
    "- Se generará un resumen numérico consolidado.\n" +
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

    const todos = resTodos.data || [];
    const catalogo = resCatalogo.data || [];

    if (todos.length === 0) {
      alert("⚠️ No hay equipos registrados en la mesa activa.");
      return;
    }

    const probados = todos.filter(row => {
      const cond = normalizar(row.condicion || row.estado || '');
      return ['CIRCULACION', 'RECUPERADO', 'OK', 'BUENO', 'APROBADO', 'DESCARTE', 'FALLA', 'BAJA', 'DEFECTUOSO', 'ROTO', 'RECHAZADO'].some(e => cond.includes(e));
    });

    if (probados.length === 0) {
      alert("⚠️ No hay equipos con veredicto final para cerrar esta semana. Los equipos 'PENDIENTES' permanecerán en la mesa.");
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
    const semanaLabel = `Semana Cierre ${fechaHoy}`;

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
      tiempo_espera_hs: row.tiempo_espera_hs
    }));

    const { error: errHist } = await supabaseRecupero
      .from('recupero_historico_equipos')
      .insert(copiaHistorico);

    if (errHist) throw errHist;

    const { error: errInforme } = await supabaseRecupero
      .from('recupero_informes_semanales')
      .insert([{
        semana_label: semanaLabel,
        total_recibidos: probados.length,
        en_circulacion: enCirc,
        descarte_vip: descVip,
        descarte_obsoleto: descObs,
        valor_recuperado_usd: valorUsd,
        desglose_operativo: desglose
      }]);

    if (errInforme) throw errInforme;

    const idsProcesados = probados.map(r => r.id);
    const { error: errBorrado } = await supabaseRecupero
      .from('recupero_operativo')
      .delete()
      .in('id', idsProcesados);

    if (errBorrado) throw errBorrado;

    alert(`🎉 Cierre semanal completado con éxito.\n\n` +
          `- Procesados y Archivados: ${probados.length} equipos.\n` +
          `- Pendientes conservados: ${todos.length - probados.length} equipos.`);

    cargarModuloRecupero();

  } catch (err) {
    console.error("❌ Error en el cierre semanal:", err);
    alert("Ocurrió un error al intentar realizar el cierre semanal.");
  }
}