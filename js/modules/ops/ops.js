// ====================================================
// MÓDULO AUTÓNOMO DE SUITE OPERATIVA (CARGA, LAB & AUDITORÍA)
// ====================================================

const SUPABASE_URL_OPS = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_OPS = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';

// Validación blindada: Evita que el script se rompa si Supabase tarda en cargar
const supabaseOps = window.supabase ? window.supabase.createClient(SUPABASE_URL_OPS, SUPABASE_KEY_OPS) : null;

let catalogoEquiposMemoria = [];
let equipoCargadoActual = null;
let veredictoFinalCalculado = 'CIRCULACIÓN';
let fechaInicioPruebaTemp = null;

const NOMBRES_ALMACEN_AUDITORIA = {
  'OBE_ALM_PRINCIPAL': 'OBE Principal',
  'OBE_ALM_CATRIEL': 'OBE Catriel (Compras)',
  'OBE_ALM_DEVOLUCIONES': 'OBE Devoluciones (Triage)',
  'OBE_ALM_DESCARTE': 'OBE Descarte (Inmovilizado)',
  'SPD_ALM_PRINCIPAL': 'San Pedro Principal',
  'WND_ALM_PRINCIPAL': 'Wanda Principal',
  'ITU_ALM_PRINCIPAL': 'Ituzaingó Principal',
  'ELDO_ALM_PRINCIPAL': 'Eldorado Principal'
};

function obtenerSucursalOps() {
  return window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';
}

function normalizarTexto(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// RESOLUCIÓN JERÁRQUICA DE REGLA DE CATÁLOGO POR SUCURSAL
function resolverInfoEquipoOps(descNorm, sucActiva) {
  const coincidencias = catalogoEquiposMemoria.filter(item => {
    const itemNorm = item.modelo_norm || normalizarTexto(item.modelo);
    return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
  });

  if (!coincidencias.length) return null;

  let match = coincidencias.find(c => c.sucursal_id === sucActiva);
  if (!match) match = coincidencias.find(c => c.sucursal_id === 'GLOBAL');
  if (!match) match = coincidencias.find(c => c.sucursal_id === 'OBE');
  if (!match) match = coincidencias[0];

  return match;
}

// CARGA DINÁMICA DE MODELOS DESDE SUPABASE (SPD + GLOBAL)
async function cargarCatalogoEquipos() {
  const selectModelo = document.getElementById('cg_modelo');
  if (!selectModelo || !supabaseOps) return;

  try {
    const { data, error } = await supabaseOps
      .from('catalogo_equipos')
      .select('*')
      .order('modelo', { ascending: true });

    if (error) throw error;

    catalogoEquiposMemoria = data || [];
    const sucActiva = obtenerSucursalOps(); // Retorna 'SPD' u 'OBE'

    // Mapa para unificar modelos sin duplicados
    const mapaModelos = new Map();

    // 1. Cargar base de equipos GLOBAL
    catalogoEquiposMemoria
      .filter(item => item.sucursal_id === 'GLOBAL')
      .forEach(item => mapaModelos.set(item.modelo, item));

    // 2. Sobrescribir o agregar con las reglas específicas de la sucursal (ej: SPD)
    catalogoEquiposMemoria
      .filter(item => item.sucursal_id === sucActiva)
      .forEach(item => mapaModelos.set(item.modelo, item));

    selectModelo.innerHTML = '<option value="" disabled selected>-- Seleccionar Modelo --</option>';

    if (mapaModelos.size === 0) {
      selectModelo.innerHTML += '<option value="" disabled>Sin equipos en catálogo</option>';
      return;
    }

    // 3. Renderizar desplegable
    Array.from(mapaModelos.values())
      .sort((a, b) => a.modelo.localeCompare(b.modelo))
      .forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.modelo;

        let tag = '';
        if (item.es_obsoleto) {
          tag = ' ⚠️ [DESCARTE/OBSOLETO]';
        } else if (item.es_vip) {
          tag = ' 👑 [VIP]';
        }

        opt.textContent = `${item.modelo}${tag}`;
        selectModelo.appendChild(opt);
      });

  } catch (err) {
    console.error('Error al cargar catálogo de equipos:', err);
    selectModelo.innerHTML = '<option value="" disabled selected>❌ Error al cargar modelos</option>';
  }
}

function obtenerUrlImagenModelo(modelo) {
  const norm = normalizarTexto(modelo);
  const sucActiva = obtenerSucursalOps();
  const info = resolverInfoEquipoOps(norm, sucActiva);
  return info ? (info.imagen_url || '') : '';
}

function esModeloVIP(modelo) {
  const norm = normalizarTexto(modelo);
  const sucActiva = obtenerSucursalOps();
  const info = resolverInfoEquipoOps(norm, sucActiva);
  return info ? Boolean(info.es_vip && !info.es_obsoleto) : false;
}

function switchOps(tabId, btn) {
  document.querySelectorAll('.ops-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.card-form').forEach(f => f.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}

// 1. CARGA DE EQUIPOS (CON CONFIRMACIÓN DOBLE, SELLADO MULTISUCURSAL Y FUSIÓN DE REGISTROS)
document.getElementById('form-carga')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmitCarga = document.querySelector('#form-carga .btn-submit');
  if (btnSubmitCarga) btnSubmitCarga.disabled = true; // Previene doble clic

  const msg = document.getElementById('statusCarga');
  const sn = document.getElementById('cg_serial')?.value.trim().toUpperCase();
  const modelo = document.getElementById('cg_modelo')?.value;
  const origen = document.getElementById('cg_origen')?.value || 'Sucursal / Mostrador';
  const detalleTecnico = document.getElementById('cg_tecnico')?.value.trim();
  const sucActiva = obtenerSucursalOps();
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';

  if (!sn || !modelo) {
    if (msg) {
      msg.textContent = '⚠️ Debe ingresar el Número de Serie y seleccionar un Modelo.';
      msg.style.color = '#fde047';
    }
    if (btnSubmitCarga) btnSubmitCarga.disabled = false;
    return;
  }

  const mensajeConfirmacion = `⚠️ CONFIRMACIÓN DE INGRESO [Sucursal: ${sucActiva}]\n\n` +
                              `¿Seguro que desea guardar este registro?\n\n` +
                              `• SN: ${sn}\n` +
                              `• Modelo: ${modelo}`;

  if (!window.confirm(mensajeConfirmacion)) {
    if (msg) {
      msg.textContent = '⏹️ Carga cancelada por el operador.';
      msg.style.color = '#cbd5e1';
    }
    if (btnSubmitCarga) btnSubmitCarga.disabled = false;
    return;
  }

  if (msg) {
    msg.textContent = `⏳ Verificando registros de ${sucActiva}...`;
    msg.style.color = '#38bdf8';
  }

  try {
    const esVIP = esModeloVIP(modelo);
    const condicionAsignada = esVIP ? 'PENDIENTE' : 'DESCARTE';
    
    let detalleObs = (detalleTecnico ? detalleTecnico + ' | ' : '') + 'Cargado por: ' + operadorNombre;
    if (!esVIP) {
      detalleObs += ' [Derivado automáticamente: Tecnología Obsoleta / Descarte]';
    }

    // BUSCAMOS SI YA EXISTE UN REGISTRO PREVIO (Para actualizarlo en vez de duplicarlo)
    let checkQuery = supabaseOps
      .from('recupero_operativo')
      .select('id, condicion')
      .eq('sn', sn);

    if (sucActiva !== 'TODAS') {
      checkQuery = checkQuery.eq('sucursal_id', sucActiva);
    }

    const { data: exist, error: errCheck } = await checkQuery.limit(1);

    if (errCheck) throw errCheck;

    if (exist && exist.length > 0) {
      // 🔄 ACTUALIZACIÓN: El equipo ya estaba cargado. Lo pisamos en vez de duplicar.
      const idRegistro = exist[0].id;
      const { error: errUpdate } = await supabaseOps
        .from('recupero_operativo')
        .update({
          descripcion: modelo,
          almacen_origen: origen,
          tecnico: operadorNombre,
          observaciones: detalleObs,
          condicion: condicionAsignada
        })
        .eq('id', idRegistro);

      if (errUpdate) throw errUpdate;

      if (msg) {
        msg.textContent = `✅ Registro existente actualizado en la mesa de ${sucActiva}.`;
        msg.style.color = '#4ade80';
      }

    } else {
      // ➕ INSERCIÓN: Es un equipo 100% nuevo.
      const payload = {
        sn: sn,
        descripcion: modelo,
        almacen_origen: origen,
        tecnico: operadorNombre,
        observaciones: detalleObs,
        condicion: condicionAsignada,
        sucursal_id: sucActiva
      };

      const { error: errInsert } = await supabaseOps.from('recupero_operativo').insert([payload]);

      if (errInsert) throw errInsert;

      if (msg) {
        if (esVIP) {
          msg.textContent = `✅ ¡Equipo VIP ingresado a la mesa de ${sucActiva}!`;
          msg.style.color = '#4ade80';
        } else {
          msg.textContent = `📼 ¡Equipo Derivado a DESCARTE en ${sucActiva}!`;
          msg.style.color = '#fde047';
        }
      }
    }

    // Limpiar formulario tras éxito
    document.getElementById('cg_serial').value = '';
    document.getElementById('cg_modelo').selectedIndex = 0;
    if (document.getElementById('boxPreviewCarga')) document.getElementById('boxPreviewCarga').style.display = 'none';
    document.getElementById('cg_serial')?.focus();

  } catch (err) {
    console.error('Error al guardar carga:', err);
    if (msg) {
      msg.textContent = '❌ Error de conexión: ' + err.message;
      msg.style.color = '#ef4444';
    }
  } finally {
    if (btnSubmitCarga) btnSubmitCarga.disabled = false;
  }
});

// 2. PRUEBAS DE LABORATORIO
async function buscarEquipoParaPrueba() {
  const sn = document.getElementById('pr_serial')?.value.trim().toUpperCase();
  const infoBox = document.getElementById('infoEquipoEnc');
  const bannerTesteado = document.getElementById('bannerTesteado');
  const blockControles = document.getElementById('blockControlesPrueba');
  const btnGuardar = document.getElementById('btnGuardarPrueba');
  const btnImprimir = document.getElementById('btnImprimir');
  const msg = document.getElementById('statusPrueba');
  const boxPreviewPrueba = document.getElementById('boxPreviewPrueba');
  const imgPreviewPrueba = document.getElementById('imgPreviewPrueba');
  const sucActiva = obtenerSucursalOps();

  if (!sn) return;

  if (msg) {
    msg.textContent = `⏳ Buscando equipo en mesa activa de ${sucActiva}...`;
    msg.style.color = '#38bdf8';
  }

  let query = supabaseOps
    .from('recupero_operativo')
    .select('*')
    .eq('sn', sn);

  if (sucActiva !== 'TODAS') {
    query = query.eq('sucursal_id', sucActiva);
  }

  const { data, error } = await query.order('id', { ascending: false }).limit(1);

  if (error || !data || data.length === 0) {
    if (msg) {
      msg.textContent = `⚠️ No se encuentra el SN ${sn} en la mesa de prueba de ${sucActiva}.`;
      msg.style.color = '#ef4444';
    }
    if (infoBox) infoBox.style.display = 'none';
    if (bannerTesteado) bannerTesteado.style.display = 'none';
    if (blockControles) blockControles.style.display = 'none';
    if (btnImprimir) btnImprimir.style.display = 'none';
    if (boxPreviewPrueba) boxPreviewPrueba.style.display = 'none';
    equipoCargadoActual = null;
    fechaInicioPruebaTemp = null;
    return;
  }

  equipoCargadoActual = data[0];
  const descModelo = equipoCargadoActual.descripcion || equipoCargadoActual.modelo || '-';
  
  if (document.getElementById('infModelo')) document.getElementById('infModelo').textContent = 'Modelo: ' + descModelo;
  if (document.getElementById('infOrigen')) document.getElementById('infOrigen').textContent = 'Origen: ' + (equipoCargadoActual.almacen_origen || '-') + ' | Técnico: ' + (equipoCargadoActual.tecnico || '-');
  
  const urlImgPrueba = obtenerUrlImagenModelo(descModelo);
  if (urlImgPrueba && boxPreviewPrueba && imgPreviewPrueba) {
    imgPreviewPrueba.src = urlImgPrueba;
    boxPreviewPrueba.style.display = 'flex';
  } else if (boxPreviewPrueba) {
    boxPreviewPrueba.style.display = 'none';
  }

  if (infoBox) infoBox.style.display = 'block';

  const estadoActual = (equipoCargadoActual.condicion || '').toUpperCase();
  if (btnImprimir) btnImprimir.style.display = 'block';

  if (estadoActual !== 'PENDIENTE') {
    if (bannerTesteado) bannerTesteado.style.display = 'block';

    const formatearFechaHora = (fechaIso) => {
      if (!fechaIso) return 'Sin registro';
      const f = new Date(fechaIso);
      return `${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
    };

    const fechaIngresoStr = formatearFechaHora(equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at);
    const fechaPruebaStr = formatearFechaHora(equipoCargadoActual.fin_prueba);

    let veredictoFormateado = `<strong>${estadoActual}</strong>`;
    if (estadoActual.includes('CIRCULACI')) {
      veredictoFormateado = `<strong style="color: #4ade80;">🟢 CIRCULACIÓN</strong>`;
    } else if (estadoActual.includes('DESCARTE')) {
      veredictoFormateado = `<strong style="color: #f87171;">🚨 DESCARTE</strong>`;
    }

    if (bannerTesteado) {
      bannerTesteado.innerHTML = `ℹ️ <strong>Equipo ya testeado o procesado</strong><br>` +
        `Veredicto previo: ${veredictoFormateado}<br>` +
        `📥 Ingreso: <strong>${fechaIngresoStr}</strong> | 🔬 Testeado: <strong>${fechaPruebaStr}</strong><br>` +
        `Detalle / Observación: ${equipoCargadoActual.observaciones || 'Ninguno'}`;
    }
    
    if (blockControles) blockControles.style.display = 'none';
    if (msg) {
      msg.textContent = 'ℹ️ Equipo no requiere prueba. Etiqueta lista para imprimir.';
      msg.style.color = '#a5b4fc';
    }
    fechaInicioPruebaTemp = null;
  } else {
    if (bannerTesteado) bannerTesteado.style.display = 'none';
    if (blockControles) blockControles.style.display = 'flex';
    if (btnGuardar) btnGuardar.disabled = false;
    if (msg) {
      msg.textContent = '✅ Equipo listo para prueba de laboratorio.';
      msg.style.color = '#4ade80';
    }
    
    fechaInicioPruebaTemp = new Date();
    evaluarVeredictoPrueba();
  }
}

function evaluarVeredictoPrueba() {
  const t1 = document.getElementById('test_1')?.checked;
  const t2 = document.getElementById('test_2')?.checked;
  const dbm = parseFloat(document.getElementById('test_dbm')?.value || '-99');
  const box = document.getElementById('boxVeredictoPrueba');
  const groupMotivo = document.getElementById('groupMotivoFalla');

  const modelo = equipoCargadoActual ? (equipoCargadoActual.descripcion || equipoCargadoActual.modelo || '').trim() : '';
  const esVIP = esModeloVIP(modelo);

  const opticaValida = dbm >= -27.0 && dbm <= -15.0;
  const pasaPruebas = t1 && t2 && opticaValida;

  if (esVIP && pasaPruebas) {
    veredictoFinalCalculado = 'CIRCULACIÓN';
    if (box) {
      box.className = 'veredicto-box veredicto-ok';
      box.textContent = 'Veredicto: 🟢 CIRCULACIÓN';
    }
    if (groupMotivo) groupMotivo.style.display = 'none';
  } else {
    veredictoFinalCalculado = 'DESCARTE';
    if (box) {
      box.className = 'veredicto-box veredicto-fail';
    }
    if (groupMotivo) groupMotivo.style.display = 'flex';
    
    if (!esVIP) {
      if (box) box.textContent = 'Veredicto: 🔴 DESCARTE (TECNOLOGÍA OBSOLETA)';
      const prMotivo = document.getElementById('pr_motivo');
      if (prMotivo) prMotivo.value = 'Tecnología Obsoleta (Sin Prueba)';
    } else {
      if (box) box.textContent = 'Veredicto: 🔴 DESCARTE (FALLA DE LAB)';
    }
  }
}

document.getElementById('form-prueba')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('statusPrueba');
  const operadorNombre = document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';

  if (!equipoCargadoActual) {
    if (msg) {
      msg.textContent = '⚠️ Primero debes buscar un número de serie válido.';
      msg.style.color = '#fde047';
    }
    return;
  }

  if (msg) {
    msg.textContent = '⏳ Guardando resultado de prueba...';
    msg.style.color = '#38bdf8';
  }

  const fechaFinPrueba = new Date();
  const fechaIngresoEquipo = (equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at) 
    ? new Date(equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at) 
    : fechaFinPrueba;

  const tiempoPruebaSeg = fechaInicioPruebaTemp ? Math.round((fechaFinPrueba - fechaInicioPruebaTemp) / 1000) : null;
  const tiempoEsperaHs = parseFloat(((fechaFinPrueba - fechaIngresoEquipo) / (1000 * 60 * 60)).toFixed(2));

  const potenciaIngresada = parseFloat(document.getElementById('test_dbm')?.value);
  const motivoFalla = veredictoFinalCalculado === 'DESCARTE' ? (document.getElementById('pr_motivo')?.value || 'Sin especificar') : 'Ninguno';

  const payloadUpdate = {
    condicion: veredictoFinalCalculado,
    tecnico: operadorNombre,
    inicio_prueba: fechaInicioPruebaTemp ? fechaInicioPruebaTemp.toISOString() : null,
    fin_prueba: fechaFinPrueba.toISOString(),
    tiempo_prueba_seg: tiempoPruebaSeg,
    tiempo_espera_hs: tiempoEsperaHs,
    observaciones: (equipoCargadoActual.observaciones || '') + ' | Lab: ' + operadorNombre + ' [Pot: ' + (isNaN(potenciaIngresada) ? 'N/D' : potenciaIngresada + 'dBm') + '] [Falla: ' + motivoFalla + ']'
  };

  const { error } = await supabaseOps
    .from('recupero_operativo')
    .update(payloadUpdate)
    .eq('id', equipoCargadoActual.id);

  if (error) {
    if (msg) {
      msg.textContent = '❌ Error al actualizar: ' + error.message;
      msg.style.color = '#ef4444';
    }
  } else {
    if (msg) {
      msg.textContent = '✅ ¡Resultado de laboratorio guardado!';
      msg.style.color = '#4ade80';
    }
    if (document.getElementById('btnImprimir')) document.getElementById('btnImprimir').style.display = 'block';
  }
});

function imprimirEtiquetaPrueba() {
  if (!equipoCargadoActual) return;

  const sn = equipoCargadoActual.sn || document.getElementById('pr_serial')?.value.trim().toUpperCase();
  const modelo = equipoCargadoActual.descripcion || 'GENERICO';
  const dbm = document.getElementById('test_dbm')?.value || 'N/D';
  const operadorNombre = document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';
  
  let veredicto = 'CIRCULACIÓN';
  const estadoPrevio = (equipoCargadoActual.condicion || '').toUpperCase();
  
  if (estadoPrevio !== 'PENDIENTE') {
    veredicto = estadoPrevio;
  } else {
    veredicto = document.getElementById('boxVeredictoPrueba')?.textContent.replace('Veredicto:', '').trim();
  }

  const fecha = new Date().toLocaleDateString('es-AR');

  if (document.getElementById('lbl_sn')) document.getElementById('lbl_sn').textContent = 'SN: ' + sn;
  if (document.getElementById('lbl_modelo')) document.getElementById('lbl_modelo').textContent = modelo;
  if (document.getElementById('lbl_dbm')) document.getElementById('lbl_dbm').textContent = dbm + ' dBm';
  if (document.getElementById('lbl_fecha')) document.getElementById('lbl_fecha').textContent = fecha;

  const lblTecnico = document.getElementById('lbl_tecnico');
  if (lblTecnico) {
    lblTecnico.textContent = equipoCargadoActual.tecnico || operadorNombre;
  }

  const containerFallas = document.getElementById('lbl_fallas_container');
  const txtFallas = document.getElementById('lbl_fallas_texto');
  
  let fallaDetectada = '';
  if (veredicto.includes('DESCARTE')) {
    const motivoSelect = document.getElementById('pr_motivo')?.value;
    if (motivoSelect && motivoSelect !== 'Ninguno') {
      fallaDetectada = motivoSelect;
    } else if (equipoCargadoActual.observaciones) {
      fallaDetectada = equipoCargadoActual.observaciones;
    } else {
      fallaDetectada = 'DESCARTE / FALLA DE LAB';
    }
  }

  if (containerFallas && txtFallas) {
    if (fallaDetectada && fallaDetectada.trim() !== '' && !fallaDetectada.toUpperCase().includes('NINGUNO')) {
      txtFallas.textContent = fallaDetectada;
      containerFallas.style.display = 'block';
    } else {
      containerFallas.style.display = 'none';
    }
  }

  const lblVeredicto = document.getElementById('lbl_veredicto_box');
  if (lblVeredicto) {
    lblVeredicto.textContent = veredicto;
    if (veredicto.includes('CIRCULACI')) {
      lblVeredicto.className = 'lbl-veredicto lbl-ok';
    } else {
      lblVeredicto.className = 'lbl-veredicto lbl-fail';
    }
  }

  window.print();
}

// 3. AUDITORÍA CIEGA ÍTEM POR ÍTEM
async function iniciarSnapshotSistema() {
  const btn = document.getElementById('btnSnapshot');
  const status = document.getElementById('statusSnapshot');
  const operadorNombre = document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';
  
  if (btn) btn.disabled = true;
  if (status) {
    status.textContent = '⏳ Consultando registro_stock...';
    status.style.color = '#38bdf8';
  }

  try {
    const { data: ult, error: errUlt } = await supabaseOps
      .from('registro_stock')
      .select('fecha_registro')
      .order('fecha_registro', { ascending: false })
      .limit(1);

    if (errUlt) throw errUlt;
    if (!ult || !ult.length) throw new Error('No hay datos en registro_stock');

    const ultimaFecha = ult[0].fecha_registro;

    const { data: stockData, error: errStock } = await supabaseOps
      .from('registro_stock')
      .select('almacen, stock_total, descripcion')
      .eq('fecha_registro', ultimaFecha);

    if (errStock) throw errStock;

    const sumaPorAlmacen = {};
    const sumaPorModelo = {};

    Object.keys(NOMBRES_ALMACEN_AUDITORIA).forEach(k => {
      sumaPorAlmacen[k] = 0;
      sumaPorModelo[k] = {};
    });

    (stockData || []).forEach(row => {
      let rawAlm = (row.almacen || '').trim().toUpperCase();
      if (rawAlm === 'SPD_PRINCIPAL') rawAlm = 'SPD_ALM_PRINCIPAL';
      if (rawAlm === 'WND-PRINCIPAL' || rawAlm === 'WND_PRINCIPAL') rawAlm = 'WND_ALM_PRINCIPAL';

      const descNorm = normalizarTexto(row.descripcion);
      if (descNorm.includes('ONU') && sumaPorAlmacen.hasOwnProperty(rawAlm)) {
        const cant = parseInt(row.stock_total, 10) || 0;
        const modeloRaw = (row.descripcion || 'DESCONOCIDO').trim();

        sumaPorAlmacen[rawAlm] += cant;
        sumaPorModelo[rawAlm][modeloRaw] = (sumaPorModelo[rawAlm][modeloRaw] || 0) + cant;
      }
    });

    const ahoraIso = new Date().toISOString();

    const listaPayloadsActivo = Object.keys(NOMBRES_ALMACEN_AUDITORIA).map(key => {
      const stockSis = sumaPorAlmacen[key] || 0;
      return {
        almacen_key: key,
        almacen_nombre: NOMBRES_ALMACEN_AUDITORIA[key],
        stock_sistema: stockSis,
        stock_fisico: 0,
        diferencia: -stockSis,
        desviacion_pct: stockSis > 0 ? 100.00 : 0.00,
        fecha_snapshot: ahoraIso,
        auditor_nombre: operadorNombre
      };
    });

    const { error: errUpsertActivo } = await supabaseOps
      .from('auditoria_control_activo')
      .upsert(listaPayloadsActivo, { onConflict: 'almacen_key' });

    if (errUpsertActivo) throw errUpsertActivo;

    const listaPayloadsDetalle = [];
    Object.keys(sumaPorModelo).forEach(key => {
      Object.keys(sumaPorModelo[key]).forEach(mod => {
        const cant = sumaPorModelo[key][mod];
        listaPayloadsDetalle.push({
          almacen_key: key,
          modelo: mod,
          stock_sistema: cant,
          stock_fisico: 0,
          diferencia: -cant,
          fecha_snapshot: ahoraIso,
          auditor_nombre: operadorNombre
        });
      });
    });

    if (listaPayloadsDetalle.length > 0) {
      const { error: errUpsertDetalle } = await supabaseOps
        .from('auditoria_control_detalle')
        .upsert(listaPayloadsDetalle, { onConflict: 'almacen_key,modelo' });

      if (errUpsertDetalle) throw errUpsertDetalle;
    }

    if (status) {
      status.textContent = `✅ ¡Control iniciado! Foto congelada (${ultimaFecha}).`;
      status.style.color = '#4ade80';
    }

    const selectSuc = document.getElementById('aud_sucursal');
    if (selectSuc && selectSuc.value) {
      cargarTablaConteoFisico();
    }

  } catch (err) {
    console.error('Error al iniciar snapshot:', err);
    if (status) {
      status.textContent = '❌ Error: ' + (err.message || 'Fallo de conexión');
      status.style.color = '#ef4444';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function cargarTablaConteoFisico() {
  const selectSuc = document.getElementById('aud_sucursal');
  const contenedorTabla = document.getElementById('contenedorTablaConteo');
  const tbody = document.getElementById('tbodyConteoModelos');
  const status = document.getElementById('statusAuditoria');

  if (!selectSuc) return;

  const keyAlmacen = selectSuc.value;
  if (!keyAlmacen) return;

  if (status) {
    status.textContent = '⏳ Cargando lista de equipos para auditar...';
    status.style.color = '#38bdf8';
  }

  try {
    const sucActiva = obtenerSucursalOps();
    const listaCatalogoOrdenada = [...catalogoEquiposMemoria].sort((a, b) => {
      const infoA = resolverInfoEquipoOps(normalizarTexto(a.modelo), sucActiva);
      const infoB = resolverInfoEquipoOps(normalizarTexto(b.modelo), sucActiva);
      const vipA = infoA ? infoA.es_vip : Boolean(a.es_vip);
      const vipB = infoB ? infoB.es_vip : Boolean(b.es_vip);
      return (vipB === vipA) ? 0 : vipB ? 1 : -1;
    });

    if (tbody) tbody.innerHTML = '';

    if (listaCatalogoOrdenada.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="padding:10px; text-align:center; color:#94a3b8;">Sin equipos en catálogo.</td></tr>`;
    } else {
      const modelosAgregados = new Set();
      listaCatalogoOrdenada.forEach(item => {
        const info = resolverInfoEquipoOps(normalizarTexto(item.modelo), sucActiva);
        const modNombre = info ? info.modelo : item.modelo;

        if (!modelosAgregados.has(modNombre)) {
          modelosAgregados.add(modNombre);
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid #334155';

          const esVip = info ? (info.es_vip && !info.es_obsoleto) : Boolean(item.es_vip);
          const tagClasif = esVip 
            ? '<span style="color:#38bdf8; font-weight:bold;">🔵 VIP</span>' 
            : '<span style="color:#94a3b8;">⚙️ Obsoleto</span>';

          tr.innerHTML = `
            <td style="padding:6px 8px; color:#f8fafc; font-weight:600;">
              ${modNombre} ${tagClasif}
            </td>
            <td style="padding:6px 8px; text-align:right;">
              <input type="number" min="0" class="input-conteo-modelo" data-modelo="${modNombre}" style="width:75px; text-align:right; padding:4px; font-weight:bold; color:#4ade80;" placeholder="0">
            </td>
          `;
          if (tbody) tbody.appendChild(tr);
        }
      });
    }

    if (contenedorTabla) contenedorTabla.style.display = 'flex';
    if (status) status.textContent = '';

  } catch (err) {
    console.error('Error al cargar tabla de conteo:', err);
    if (status) {
      status.textContent = '❌ Error al preparar la tabla de conteo.';
      status.style.color = '#ef4444';
    }
  }
}

async function guardarConteoFisicoReal() {
  const selectSuc = document.getElementById('aud_sucursal');
  const btnGuardar = document.getElementById('btnGuardarAuditoria');
  const status = document.getElementById('statusAuditoria');
  const operadorNombre = document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';

  if (!selectSuc) return;

  const keyAlmacen = selectSuc.value;
  const nombreAlmacen = NOMBRES_ALMACEN_AUDITORIA[keyAlmacen] || keyAlmacen;

  if (!keyAlmacen) {
    if (status) {
      status.textContent = '⚠️ Seleccioná un almacén válido.';
      status.style.color = '#fde047';
    }
    return;
  }

  if (btnGuardar) btnGuardar.disabled = true;
  if (status) {
    status.textContent = '⏳ Guardando auditoría en Supabase...';
    status.style.color = '#38bdf8';
  }

  try {
    const ahoraIso = new Date().toISOString();

    const { data: detallesPrevios } = await supabaseOps
      .from('auditoria_control_detalle')
      .select('modelo, stock_sistema')
      .eq('almacen_key', keyAlmacen);

    const mapStockSistemaModelo = {};
    (detallesPrevios || []).forEach(d => {
      mapStockSistemaModelo[d.modelo] = d.stock_sistema || 0;
    });

    let totalFisicoGeneral = 0;
    let sumaAbsolutaDesviaciones = 0;
    const listaUpsertDetalle = [];

    document.querySelectorAll('.input-conteo-modelo').forEach(input => {
      const modelo = input.getAttribute('data-modelo');
      const cantFisica = parseInt(input.value, 10) || 0;
      totalFisicoGeneral += cantFisica;

      const stockSis = mapStockSistemaModelo[modelo] || 0;
      const dif = cantFisica - stockSis;

      sumaAbsolutaDesviaciones += Math.abs(dif);

      listaUpsertDetalle.push({
        almacen_key: keyAlmacen,
        modelo: modelo,
        stock_sistema: stockSis,
        stock_fisico: cantFisica,
        diferencia: dif,
        fecha_inspeccion: ahoraIso,
        auditor_nombre: operadorNombre
      });
    });

    if (listaUpsertDetalle.length > 0) {
      const { error: errDet } = await supabaseOps
        .from('auditoria_control_detalle')
        .upsert(listaUpsertDetalle, { onConflict: 'almacen_key,modelo' });

      if (errDet) throw errDet;
    }

    const { data: audActiva } = await supabaseOps
      .from('auditoria_control_activo')
      .select('stock_sistema')
      .eq('almacen_key', keyAlmacen)
      .maybeSingle();

    const stockSistemaTotal = audActiva ? (audActiva.stock_sistema || 0) : 0;
    const desvPctTotal = stockSistemaTotal > 0 ? parseFloat(((sumaAbsolutaDesviaciones / stockSistemaTotal) * 100).toFixed(2)) : 0.00;

    const payloadActivo = {
      almacen_nombre: nombreAlmacen,
      stock_fisico: totalFisicoGeneral,
      diferencia: sumaAbsolutaDesviaciones,
      desviacion_pct: desvPctTotal,
      fecha_inspeccion: ahoraIso,
      auditor_nombre: operadorNombre
    };

    const { error: errAct } = await supabaseOps
      .from('auditoria_control_activo')
      .update(payloadActivo)
      .eq('almacen_key', keyAlmacen);

    if (errAct) throw errAct;

    if (status) {
      status.textContent = `✅ ¡Conteo físico registrado correctamente para ${nombreAlmacen}!`;
      status.style.color = '#4ade80';
    }

  } catch (err) {
    console.error('Error al guardar auditoría:', err);
    if (status) {
      status.textContent = '❌ Error al guardar la auditoría: ' + (err.message || 'Error de conexión');
      status.style.color = '#ef4444';
    }
  } finally {
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

// INICIALIZACIÓN DE EVENTOS EN DOM
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cg_modelo')?.addEventListener('change', (e) => {
    const modelo = e.target.value;
    const urlImg = obtenerUrlImagenModelo(modelo);
    const box = document.getElementById('boxPreviewCarga');
    const img = document.getElementById('imgPreviewCarga');

    if (urlImg && box && img) {
      img.src = urlImg;
      box.style.display = 'flex';
    } else if (box) {
      box.style.display = 'none';
    }
  });

  document.getElementById('pr_serial')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarEquipoParaPrueba();
    }
  });

  if (supabaseOps) cargarCatalogoEquipos();
});