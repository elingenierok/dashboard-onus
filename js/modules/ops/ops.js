// ====================================================
// MÓDULO AUTÓNOMO DE SUITE OPERATIVA (CARGA Y LAB)
// ====================================================

const SUPABASE_URL_OPS = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_OPS = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';

// Validación blindada: Evita que el script se rompa si Supabase tarda en cargar
const supabaseOps = window.supabase ? window.supabase.createClient(SUPABASE_URL_OPS, SUPABASE_KEY_OPS) : null;

let catalogoEquiposMemoria = [];
let equipoCargadoActual = null;
let veredictoFinalCalculado = 'CIRCULACIÓN';
let fechaInicioPruebaTemp = null;

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

// CARGA DINÁMICA DE MODELOS DESDE SUPABASE
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
    const sucActiva = obtenerSucursalOps();

    const mapaModelos = new Map();

    // 1. Cargar base de equipos GLOBAL
    catalogoEquiposMemoria
      .filter(item => item.sucursal_id === 'GLOBAL')
      .forEach(item => mapaModelos.set(item.modelo, item));

    // 2. Sobrescribir o agregar con las reglas específicas de la sucursal
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

// ====================================================
// 1. CARGA DE EQUIPOS (VALIDACIÓN RIGUROSA, ANTI-DUPLICADOS Y ANTI DOBLE-CLIC)
// ====================================================
document.getElementById('form-carga')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmitCarga = document.querySelector('#form-carga .btn-submit');
  
  // 🛡️ 1. BLOQUEO ANTI DOBLE-CLIC INMEDIATO
  if (btnSubmitCarga) btnSubmitCarga.disabled = true;

  const msg = document.getElementById('statusCarga');
  const rawSn = document.getElementById('cg_serial')?.value || '';
  
  // Clean string: Mayúsculas, sin espacios ni saltos de línea
  const sn = rawSn.trim().toUpperCase().replace(/\s+/g, '');
  const modelo = document.getElementById('cg_modelo')?.value;
  const origen = document.getElementById('cg_origen')?.value || 'Sucursal / Mostrador';
  const detalleTecnico = document.getElementById('cg_tecnico')?.value.trim();
  const sucActiva = obtenerSucursalOps();
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';

  try {
    // 🛡️ 2. VALIDACIÓN DE CAMPOS OBLIGATORIOS
    if (!sn || !modelo) {
      if (msg) {
        msg.textContent = '⚠️ Debe ingresar el Número de Serie y seleccionar un Modelo.';
        msg.style.color = '#fde047';
      }
      return;
    }

    // 🛡️ 3. VALIDACIÓN SINTÁCTICA (PREFIJOS AUTORIZADOS Y SERIALES LARGOS HEX)
    const PREFIJOS_PERMITIDOS = ['ZTEGD', 'HWTC', 'FKBA', 'ALCL', 'GPON', 'SN'];
    const esSerialEstandar = PREFIJOS_PERMITIDOS.some(p => sn.startsWith(p));
    
    // Evalúa si es un Serial Largo Escaneado (Hexadecimal de 16 caracteres)
    const esSerialLargoHex = /^[0-9A-F]{16}$/i.test(sn);

    if (!esSerialEstandar && !esSerialLargoHex) {
      const errTxt = `El serial "${sn}" no tiene un formato válido.\n\nDebe cumplir una de las siguientes opciones:\n• Comenzar con un prefijo autorizador: ${PREFIJOS_PERMITIDOS.join(', ')}\n• Ser un Serial Largo de escáner (16 caracteres Hexadecimales).`;
      if (msg) {
        msg.textContent = `⚠️ Serial inválido. Requiere prefijo conocido o 16 caracteres Hexadecimales.`;
        msg.style.color = '#f87171';
      }
      alert(`⚠️ ATENCIÓN:\n\n${errTxt}`);
      return;
    }

    // 🛡️ 4. VALIDACIÓN DE LONGITUD DE CARACTERES
    if (sn.length < 10 || sn.length > 20) {
      const errTxt = `El serial "${sn}" posee ${sn.length} caracteres.\nLa longitud permitida para equipos de fibra es entre 10 y 20 caracteres.`;
      if (msg) {
        msg.textContent = `⚠️ Longitud inválida (${sn.length} caracteres). Se requieren entre 10 y 20.`;
        msg.style.color = '#f87171';
      }
      alert(`⚠️ ATENCIÓN:\n\n${errTxt}`);
      return;
    }

    // 🛡️ 5. CONFIRMACIÓN DEL OPERADOR
    const mensajeConfirmacion = `⚠️ CONFIRMACIÓN DE INGRESO [Sucursal: ${sucActiva}]\n\n` +
                                `¿Seguro que desea guardar este registro?\n\n` +
                                `• SN: ${sn}\n` +
                                `• Modelo: ${modelo}`;

    if (!window.confirm(mensajeConfirmacion)) {
      if (msg) {
        msg.textContent = '⏹️ Carga cancelada por el operador.';
        msg.style.color = '#cbd5e1';
      }
      return;
    }

    if (msg) {
      msg.textContent = `⏳ Verificando duplicados en Supabase (Global)...`;
      msg.style.color = '#38bdf8';
    }

    // 🛡️ 6. CONSULTA GLOBAL Y PERMISO PARA PISAR / REINGRESAR
    const [resOperativo, resHistorico] = await Promise.all([
      supabaseOps.from('recupero_operativo').select('id, sn, sucursal_id, condicion').ilike('sn', sn).limit(1),
      supabaseOps.from('recupero_historico_equipos').select('id, sn, sucursal_id').ilike('sn', sn).limit(1)
    ]);

    if (resOperativo.error) throw resOperativo.error;
    if (resHistorico.error) throw resHistorico.error;

    // Si ya existe en la Mesa Activa, se le permite al operador "PISAR" el registro anterior
    if (resOperativo.data && resOperativo.data.length > 0) {
      const reg = resOperativo.data[0];
      const sucOrigen = reg.sucursal_id || 'Mesa Activa';
      const cond = reg.condicion || 'REGISTRADO';

      const pisarRegistro = window.confirm(
        `🔄 REINGRESO / PISAR REGISTRO ANTERIOR 🔄\n\n` +
        `El serial "${sn}" ya existe en la sucursal [${sucOrigen}] (Estado actual: ${cond}).\n\n` +
        `¿Deseas PISAR el registro anterior y actualizar la mesa con este nuevo ingreso?`
      );

      if (pisarRegistro) {
        const { error: errDelete } = await supabaseOps
          .from('recupero_operativo')
          .delete()
          .eq('id', reg.id);

        if (errDelete) throw errDelete;

        if (msg) {
          msg.textContent = `🔄 Registro anterior removido para ${sn}. Guardando nuevo ingreso...`;
          msg.style.color = '#38bdf8';
        }
      } else {
        if (msg) {
          msg.textContent = `⏹️ Carga cancelada: Se conservó el registro anterior de ${sn}.`;
          msg.style.color = '#cbd5e1';
        }
        return;
      }
    }

    // Si el equipo pertenecía a un Histórico (Cierre semanal previo), se permite reingresarlo para volver a probar
    if (resHistorico.data && resHistorico.data.length > 0) {
      const regHist = resHistorico.data[0];
      const sucOrigen = regHist.sucursal_id || 'Histórico';

      const reingresarHist = window.confirm(
        `ℹ️ REINGRESO DE EQUIPO HISTÓRICO ℹ️\n\n` +
        `El serial "${sn}" fue procesado anteriormente en un Cierre Semanal [${sucOrigen}].\n\n` +
        `¿Deseas volver a ingresarlo a la Mesa Activa para una nueva inspección?`
      );

      if (!reingresarHist) {
        if (msg) {
          msg.textContent = `⏹️ Carga cancelada: Serial ${sn} se mantiene en histórico.`;
          msg.style.color = '#cbd5e1';
        }
        return;
      }
    }

    // 🛡️ 7. INSERCIÓN DE REGISTRO NUEVO
    const esVIP = esModeloVIP(modelo);
    const condicionAsignada = esVIP ? 'PENDIENTE' : 'DESCARTE';
    
    let detalleObs = (detalleTecnico ? detalleTecnico + ' | ' : '') + 'Cargado por: ' + operadorNombre;
    if (!esVIP) {
      detalleObs += ' [Derivado automáticamente: Tecnología Obsoleta / Descarte]';
    }

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
        msg.textContent = `✅ ¡Equipo VIP (${sn}) ingresado a la mesa de ${sucActiva}!`;
        msg.style.color = '#4ade80';
      } else {
        msg.textContent = `📼 ¡Equipo (${sn}) Derivado a DESCARTE en ${sucActiva}!`;
        msg.style.color = '#fde047';
      }
    }

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
    setTimeout(() => {
      if (btnSubmitCarga) btnSubmitCarga.disabled = false;
    }, 600);
  }
});

// ====================================================
// 2. PRUEBAS DE LABORATORIO
// ====================================================
async function buscarEquipoParaPrueba() {
  const rawSn = document.getElementById('pr_serial')?.value || '';
  // Clean string: Sanitización estricta idéntica al módulo de carga
  const sn = rawSn.trim().toUpperCase().replace(/\s+/g, '');
  
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
    .ilike('sn', sn);

  if (sucActiva !== 'TODAS') {
    query = query.eq('sucursal_id', sucActiva);
  }

  // 🛡️ CORRECCIÓN CLAVE: Ordenar por fecha_ingreso (cronológico) en lugar de id (UUID)
  const { data, error } = await query.order('fecha_ingreso', { ascending: false }).limit(1);

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
      if (isNaN(f.getTime())) return 'Sin registro';
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
  const btnGuardarPrueba = document.getElementById('btnGuardarPrueba');
  
  // 🛡️ 1. BLOQUEO ANTI DOBLE-CLIC
  if (btnGuardarPrueba) btnGuardarPrueba.disabled = true;

  const msg = document.getElementById('statusPrueba');
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';

  if (!equipoCargadoActual) {
    if (msg) {
      msg.textContent = '⚠️ Primero debes buscar un número de serie válido.';
      msg.style.color = '#fde047';
    }
    if (btnGuardarPrueba) btnGuardarPrueba.disabled = false;
    return;
  }

  // 🛡️ 2. RECALCULAR VEREDICTO JUSTO ANTES DE GUARDAR
  evaluarVeredictoPrueba();

  if (msg) {
    msg.textContent = '⏳ Guardando resultado de prueba en Supabase...';
    msg.style.color = '#38bdf8';
  }

  try {
    const fechaFinPrueba = new Date();
    const rawIngreso = equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at;
    const fechaIngresoEquipo = (rawIngreso && !isNaN(new Date(rawIngreso).getTime()))
      ? new Date(rawIngreso)
      : fechaFinPrueba;

    const tiempoPruebaSeg = fechaInicioPruebaTemp ? Math.max(0, Math.round((fechaFinPrueba - fechaInicioPruebaTemp) / 1000)) : 0;
    const tiempoEsperaHs = parseFloat(Math.max(0, (fechaFinPrueba - fechaIngresoEquipo) / (1000 * 60 * 60)).toFixed(2));

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

    if (error) throw error;

    if (msg) {
      msg.textContent = '✅ ¡Resultado de laboratorio guardado con éxito!';
      msg.style.color = '#4ade80';
    }
    if (document.getElementById('btnImprimir')) document.getElementById('btnImprimir').style.display = 'block';

  } catch (err) {
    console.error('Error al guardar prueba:', err);
    if (msg) {
      msg.textContent = '❌ Error al actualizar: ' + err.message;
      msg.style.color = '#ef4444';
    }
  } finally {
    setTimeout(() => {
      if (btnGuardarPrueba) btnGuardarPrueba.disabled = false;
    }, 600);
  }
});

function imprimirEtiquetaPrueba() {
  if (!equipoCargadoActual) return;

  const rawSn = equipoCargadoActual.sn || document.getElementById('pr_serial')?.value || '';
  const sn = rawSn.trim().toUpperCase().replace(/\s+/g, '');
  const modelo = equipoCargadoActual.descripcion || 'GENERICO';
  const dbm = document.getElementById('test_dbm')?.value || 'N/D';
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Operador';
  
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

// ====================================================
// INICIALIZACIÓN DE EVENTOS EN DOM
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  // Preview de imagen en Formulario Carga
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

  // Búsqueda por ENTER en Laboratorio
  document.getElementById('pr_serial')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarEquipoParaPrueba();
    }
  });

  // Revaluación dinámica en tiempo real durante la prueba
  ['test_1', 'test_2', 'test_dbm', 'pr_motivo'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('change', evaluarVeredictoPrueba);
      elem.addEventListener('input', evaluarVeredictoPrueba);
    }
  });

  if (supabaseOps) cargarCatalogoEquipos();
});