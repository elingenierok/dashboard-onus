// ====================================================
// MÓDULO AUTÓNOMO DE SUITE OPERATIVA (CARGA, LAB & AUDITORÍA)
// ====================================================

const SUPABASE_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let catalogoEquiposMemoria = [];
let equipoCargadoActual = null;
let veredictoFinalCalculado = 'CIRCULACIÓN';
let usuarioOperadorNombre = '';
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

function normalizarTexto(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function cargarCatalogoEquipos() {
  const selectModelo = document.getElementById('cg_modelo');
  if (!selectModelo) return;

  try {
    const { data, error } = await supabaseClient
      .from('catalogo_equipos')
      .select('*')
      .order('modelo', { ascending: true });

    if (error) throw error;

    catalogoEquiposMemoria = data || [];

    selectModelo.innerHTML = '<option value="" disabled selected>-- Seleccionar Modelo --</option>';
    catalogoEquiposMemoria.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.modelo;
      opt.textContent = item.modelo + (!item.es_vip ? ' (OBSOLETO)' : '');
      selectModelo.appendChild(opt);
    });
  } catch (err) {
    console.error('Error al cargar catálogo de equipos:', err);
    selectModelo.innerHTML = '<option value="" disabled selected>❌ Error al cargar modelos</option>';
  }
}

function obtenerUrlImagenModelo(modelo) {
  const norm = normalizarTexto(modelo);
  const encontrado = catalogoEquiposMemoria.find(item => {
    const itemNorm = item.modelo_norm || normalizarTexto(item.modelo);
    return norm.includes(itemNorm) || itemNorm.includes(norm);
  });
  return encontrado ? (encontrado.imagen_url || '') : '';
}

function esModeloVIP(modelo) {
  const norm = normalizarTexto(modelo);
  const encontrado = catalogoEquiposMemoria.find(item => {
    const itemNorm = item.modelo_norm || normalizarTexto(item.modelo);
    return norm.includes(itemNorm) || itemNorm.includes(norm);
  });
  return encontrado ? Boolean(encontrado.es_vip) : false;
}

// LOGIN Y SESIÓN
async function revisarSesionActiva() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    cargarPerfilUsuario(session.user);
  } else {
    mostrarPantallaLogin();
  }
}

async function iniciarSesion() {
  const email = document.getElementById('txt-email').value.trim();
  const pass = document.getElementById('txt-pass').value.trim();
  const errBox = document.getElementById('login-error');

  if(!email || !pass) {
    errBox.textContent = 'Ingrese correo y contraseña.';
    return;
  }

  errBox.textContent = '⏳ Verificando credenciales...';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });

  if (error) {
    errBox.textContent = '❌ Credenciales inválidas.';
  } else {
    errBox.textContent = '';
    cargarPerfilUsuario(data.user);
  }
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

function mostrarPantallaLogin() {
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

async function cargarPerfilUsuario(usuario) {
  const { data } = await supabaseClient
    .from('usuarios_permisos')
    .select('nombre_completo')
    .eq('id', usuario.id)
    .single();

  usuarioOperadorNombre = (data && data.nombre_completo) ? data.nombre_completo : usuario.email;

  document.getElementById('user-badge').textContent = `👤 ${usuarioOperadorNombre}`;
  document.getElementById('pr_tecnico_lab').value = usuarioOperadorNombre;

  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  await cargarCatalogoEquipos();
}

function switchOps(tabId, btn) {
  document.querySelectorAll('.ops-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.card-form').forEach(f => f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

document.getElementById('cg_modelo').addEventListener('change', (e) => {
  const modelo = e.target.value;
  const urlImg = obtenerUrlImagenModelo(modelo);
  const box = document.getElementById('boxPreviewCarga');
  const img = document.getElementById('imgPreviewCarga');

  if (urlImg) {
    img.src = urlImg;
    box.style.display = 'flex';
  } else {
    box.style.display = 'none';
    img.src = '';
  }
});

// --- 2. CARGA DE EQUIPOS (CON CONFIRMACIÓN DOBLE) ---
document.getElementById('form-carga').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('statusCarga');
  const sn = document.getElementById('cg_serial').value.trim().toUpperCase();
  const modelo = document.getElementById('cg_modelo').value;
  const detalleTecnico = document.getElementById('cg_tecnico').value.trim();

  // 1. Verificación básica en pantalla
  if (!sn || !modelo) {
    msg.textContent = '⚠️ Debe ingresar el Número de Serie y seleccionar un Modelo.';
    msg.style.color = '#fde047';
    return;
  }

  // 2. VENTANA EXTRA DE CONFIRMACIÓN AL OPERADOR
  const mensajeConfirmacion = `⚠️ CONFIRMACIÓN DE INGRESO\n\n` +
                              `¿Seguro que desea guardar este registro?\n\n` +
                              `• Número de Serie (SN): ${sn}\n` +
                              `• Modelo de Equipo: ${modelo}`;

  const confirmado = window.confirm(mensajeConfirmacion);

  if (!confirmado) {
    msg.textContent = '⏹️ Carga cancelada por el operador.';
    msg.style.color = '#cbd5e1';
    return;
  }

  // 3. Verificación de duplicados en la mesa activa
  msg.textContent = '⏳ Verificando duplicados en la mesa activa...';
  msg.style.color = '#38bdf8';

  const { data: exist } = await supabaseClient
    .from('recupero_operativo')
    .select('sn, condicion, fecha_ingreso')
    .eq('sn', sn)
    .limit(1);

  if (exist && exist.length > 0) {
    const reg = exist[0];
    msg.textContent = `⚠️ El equipo con SN ${sn} ya está en la mesa activa con condición: [${reg.condicion}].`;
    msg.style.color = '#fde047';
    return;
  }

  // 4. Evaluación de Tecnología VIP / Obsoleta
  const esVIP = esModeloVIP(modelo);
  const condicionAsignada = esVIP ? 'PENDIENTE' : 'DESCARTE';
  
  let detalleObs = (detalleTecnico ? detalleTecnico + ' | ' : '') + 'Cargado por: ' + usuarioOperadorNombre;
  if (!esVIP) {
    detalleObs += ' [Derivado automáticamente: Tecnología Obsoleta]';
  }

  const payload = {
    sn: sn,
    descripcion: modelo,
    almacen_origen: document.getElementById('cg_origen').value,
    tecnico: usuarioOperadorNombre,
    observaciones: detalleObs,
    condicion: condicionAsignada
  };

  // 5. Registro definitivo en Supabase
  const { error } = await supabaseClient.from('recupero_operativo').insert([payload]);

  if (error) {
    msg.textContent = '❌ Error: ' + error.message;
    msg.style.color = '#ef4444';
  } else {
    if (esVIP) {
      msg.textContent = '✅ ¡Equipo VIP cargado a la mesa activa para pruebas!';
      msg.style.color = '#4ade80';
    } else {
      msg.textContent = '📼 ¡Equipo Obsoleto derivado automáticamente a DESCARTE!';
      msg.style.color = '#fde047';
    }
    document.getElementById('cg_serial').value = '';
    document.getElementById('cg_modelo').selectedIndex = 0;
    document.getElementById('boxPreviewCarga').style.display = 'none';
    document.getElementById('cg_serial').focus();
  }
});

// PRUEBAS DE LABORATORIO
async function buscarEquipoParaPrueba() {
  const sn = document.getElementById('pr_serial').value.trim().toUpperCase();
  const infoBox = document.getElementById('infoEquipoEnc');
  const bannerTesteado = document.getElementById('bannerTesteado');
  const blockControles = document.getElementById('blockControlesPrueba');
  const btnGuardar = document.getElementById('btnGuardarPrueba');
  const btnImprimir = document.getElementById('btnImprimir');
  const msg = document.getElementById('statusPrueba');

  const boxPreviewPrueba = document.getElementById('boxPreviewPrueba');
  const imgPreviewPrueba = document.getElementById('imgPreviewPrueba');

  if (!sn) return;

  msg.textContent = '⏳ Buscando equipo en la mesa activa...';
  msg.style.color = '#38bdf8';

  const { data, error } = await supabaseClient
    .from('recupero_operativo')
    .select('*')
    .eq('sn', sn)
    .order('id', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    msg.textContent = '⚠️ Este equipo no se encuentra en la mesa de prueba activa.';
    msg.style.color = '#ef4444';
    infoBox.style.display = 'none';
    bannerTesteado.style.display = 'none';
    blockControles.style.display = 'none';
    btnImprimir.style.display = 'none';
    boxPreviewPrueba.style.display = 'none';
    equipoCargadoActual = null;
    fechaInicioPruebaTemp = null;
    return;
  }

  equipoCargadoActual = data[0];
  const descModelo = equipoCargadoActual.descripcion || equipoCargadoActual.modelo || '-';
  
  document.getElementById('infModelo').textContent = 'Modelo: ' + descModelo;
  document.getElementById('infOrigen').textContent = 'Origen: ' + (equipoCargadoActual.almacen_origen || equipoCargadoActual.origen || '-');
  
  const urlImgPrueba = obtenerUrlImagenModelo(descModelo);
  if (urlImgPrueba) {
    imgPreviewPrueba.src = urlImgPrueba;
    boxPreviewPrueba.style.display = 'flex';
  } else {
    boxPreviewPrueba.style.display = 'none';
    imgPreviewPrueba.src = '';
  }

  infoBox.style.display = 'block';

  const estadoActual = (equipoCargadoActual.condicion || '').toUpperCase();

  btnImprimir.style.display = 'block';

  if (estadoActual !== 'PENDIENTE') {
    bannerTesteado.style.display = 'block';
    bannerTesteado.innerHTML = `ℹ️ <strong>Equipo ya testeado o procesado</strong><br>` +
      `Veredicto previo: <strong>${estadoActual}</strong><br>` +
      `Detalle / Observación: ${equipoCargadoActual.observaciones || 'Ninguno'}`;
    
    blockControles.style.display = 'none';
    msg.textContent = 'ℹ️ Equipo no requiere prueba. Etiqueta lista para imprimir.';
    msg.style.color = '#a5b4fc';
    fechaInicioPruebaTemp = null;
  } else {
    bannerTesteado.style.display = 'none';
    blockControles.style.display = 'flex';
    btnGuardar.disabled = false;
    msg.textContent = '✅ Equipo listo para prueba de laboratorio.';
    msg.style.color = '#4ade80';
    
    fechaInicioPruebaTemp = new Date();
    evaluarVeredictoPrueba();
  }
}

function evaluarVeredictoPrueba() {
  const t1 = document.getElementById('test_1').checked;
  const t2 = document.getElementById('test_2').checked;
  const dbm = parseFloat(document.getElementById('test_dbm').value) || -99;
  const box = document.getElementById('boxVeredictoPrueba');
  const groupMotivo = document.getElementById('groupMotivoFalla');

  const modelo = equipoCargadoActual ? (equipoCargadoActual.descripcion || equipoCargadoActual.modelo || '').trim() : '';
  const esVIP = esModeloVIP(modelo);

  const opticaValida = dbm >= -27.0 && dbm <= -15.0;
  const pasaPruebas = t1 && t2 && opticaValida;

  if (esVIP && pasaPruebas) {
    veredictoFinalCalculado = 'CIRCULACIÓN';
    box.className = 'veredicto-box veredicto-ok';
    box.textContent = 'Veredicto: 🟢 CIRCULACIÓN';
    groupMotivo.style.display = 'none';
  } else {
    veredictoFinalCalculado = 'DESCARTE';
    box.className = 'veredicto-box veredicto-fail';
    groupMotivo.style.display = 'flex';
    
    if (!esVIP) {
      box.textContent = 'Veredicto: 🔴 DESCARTE (TECNOLOGÍA OBSOLETA)';
      document.getElementById('pr_motivo').value = 'Tecnología Obsoleta (Sin Prueba)';
    } else {
      box.textContent = 'Veredicto: 🔴 DESCARTE (FALLA DE LAB)';
    }
  }
}

document.getElementById('form-prueba').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('statusPrueba');

  if (!equipoCargadoActual) {
    msg.textContent = '⚠️ Primero debes buscar un número de serie válido.';
    msg.style.color = '#fde047';
    return;
  }

  msg.textContent = '⏳ Guardando prueba...';
  msg.style.color = '#38bdf8';

  const fechaFinPrueba = new Date();
  const fechaIngresoEquipo = (equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at) ? new Date(equipoCargadoActual.fecha_ingreso || equipoCargadoActual.created_at) : fechaFinPrueba;

  const tiempoPruebaSeg = fechaInicioPruebaTemp ? Math.round((fechaFinPrueba - fechaInicioPruebaTemp) / 1000) : null;
  const tiempoEsperaHs = parseFloat(((fechaFinPrueba - fechaIngresoEquipo) / (1000 * 60 * 60)).toFixed(2));

  const potenciaIngresada = parseFloat(document.getElementById('test_dbm').value);
  const motivoFalla = veredictoFinalCalculado === 'DESCARTE' ? document.getElementById('pr_motivo').value : 'Ninguno';

  const payloadUpdate = {
    condicion: veredictoFinalCalculado,
    tecnico: usuarioOperadorNombre,
    inicio_prueba: fechaInicioPruebaTemp ? fechaInicioPruebaTemp.toISOString() : null,
    fin_prueba: fechaFinPrueba.toISOString(),
    tiempo_prueba_seg: tiempoPruebaSeg,
    tiempo_espera_hs: tiempoEsperaHs,
    observaciones: (equipoCargadoActual.observaciones || '') + ' | Lab: ' + usuarioOperadorNombre + ' [Pot: ' + (isNaN(potenciaIngresada) ? 'N/D' : potenciaIngresada + 'dBm') + '] [Falla: ' + motivoFalla + ']' + (tiempoPruebaSeg !== null ? ' [Prueba: ' + tiempoPruebaSeg + 's]' : '')
  };

  const { error } = await supabaseClient
    .from('recupero_operativo')
    .update(payloadUpdate)
    .eq('id', equipoCargadoActual.id);

  if (error) {
    msg.textContent = '❌ Error al actualizar: ' + error.message;
    msg.style.color = '#ef4444';
  } else {
    msg.textContent = '✅ ¡Resultado de laboratorio guardado!';
    msg.style.color = '#4ade80';
    document.getElementById('btnImprimir').style.display = 'block';
  }
});

function imprimirEtiquetaPrueba() {
  if (!equipoCargadoActual) return;

  const sn = equipoCargadoActual.sn || document.getElementById('pr_serial').value.trim().toUpperCase();
  const modelo = equipoCargadoActual.descripcion || 'GENERICO';
  const dbm = document.getElementById('test_dbm').value || 'N/D';
  
  let veredicto = 'CIRCULACIÓN';
  const estadoPrevio = (equipoCargadoActual.condicion || '').toUpperCase();
  
  if (estadoPrevio !== 'PENDIENTE') {
    veredicto = estadoPrevio;
  } else {
    veredicto = document.getElementById('boxVeredictoPrueba').textContent.replace('Veredicto:', '').trim();
  }

  const fecha = new Date().toLocaleDateString('es-AR');

  document.getElementById('lbl_sn').textContent = 'SN: ' + sn;
  document.getElementById('lbl_modelo').textContent = modelo;
  document.getElementById('lbl_dbm').textContent = dbm + ' dBm';
  document.getElementById('lbl_fecha').textContent = fecha;

  const lblVeredicto = document.getElementById('lbl_veredicto_box');
  lblVeredicto.textContent = veredicto;

  if (veredicto.includes('CIRCULACIÓN')) {
    lblVeredicto.className = 'lbl-veredicto lbl-ok';
  } else {
    lblVeredicto.className = 'lbl-veredicto lbl-fail';
  }

  window.print();
}

// ====================================================
// 4. LÓGICA DE AUDITORÍA CIEGA ÍTEM POR ÍTEM (POR MODELO)
// ====================================================

// A. INICIAR CONTROL DE STOCK (CONGELA FOTO TOTAL Y MODELO POR MODELO)
async function iniciarSnapshotSistema() {
  const btn = document.getElementById('btnSnapshot');
  const status = document.getElementById('statusSnapshot');
  
  if (btn) btn.disabled = true;
  status.textContent = '⏳ Consultando registro_stock...';
  status.style.color = '#38bdf8';

  try {
    const { data: ult, error: errUlt } = await supabaseClient
      .from('registro_stock')
      .select('fecha_registro')
      .order('fecha_registro', { ascending: false })
      .limit(1);

    if (errUlt) throw errUlt;
    if (!ult || !ult.length) throw new Error('No hay datos en registro_stock');

    const ultimaFecha = ult[0].fecha_registro;

    const { data: stockData, error: errStock } = await supabaseClient
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
        auditor_nombre: usuarioOperadorNombre
      };
    });

    const { error: errUpsertActivo } = await supabaseClient
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
          auditor_nombre: usuarioOperadorNombre
        });
      });
    });

    if (listaPayloadsDetalle.length > 0) {
      const { error: errUpsertDetalle } = await supabaseClient
        .from('auditoria_control_detalle')
        .upsert(listaPayloadsDetalle, { onConflict: 'almacen_key,modelo' });

      if (errUpsertDetalle) throw errUpsertDetalle;
    }

    status.textContent = `✅ ¡Control iniciado! Foto congelada (${ultimaFecha}).`;
    status.style.color = '#4ade80';

    const selectSuc = document.getElementById('aud_sucursal');
    if (selectSuc && selectSuc.value) {
      cargarTablaConteoFisico();
    }

  } catch (err) {
    console.error('Error al iniciar snapshot:', err);
    status.textContent = '❌ Error: ' + (err.message || 'Fallo de conexión');
    status.style.color = '#ef4444';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// B. DESPLEGAR TABLA CIEGA DE MODELOS
async function cargarTablaConteoFisico() {
  const selectSuc = document.getElementById('aud_sucursal');
  const contenedorTabla = document.getElementById('contenedorTablaConteo');
  const tbody = document.getElementById('tbodyConteoModelos');
  const status = document.getElementById('statusAuditoria');

  const keyAlmacen = selectSuc.value;
  if (!keyAlmacen) return;

  status.textContent = '⏳ Cargando lista de equipos para auditar...';
  status.style.color = '#38bdf8';

  try {
    const listaCatalogoOrdenada = [...catalogoEquiposMemoria].sort((a, b) => {
      const vipA = Boolean(a.es_vip);
      const vipB = Boolean(b.es_vip);
      return (vipB === vipA) ? 0 : vipB ? 1 : -1;
    });

    tbody.innerHTML = '';

    if (listaCatalogoOrdenada.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="padding:10px; text-align:center; color:#94a3b8;">Sin equipos en catálogo.</td></tr>`;
    } else {
      listaCatalogoOrdenada.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #334155';

        const tagClasif = item.es_vip ? '<span style="color:#38bdf8; font-weight:bold;">🔵 VIP</span>' : '<span style="color:#94a3b8;">⚙️ Obsoleto</span>';

        tr.innerHTML = `
          <td style="padding:6px 8px; color:#f8fafc; font-weight:600;">
            ${item.modelo} ${tagClasif}
          </td>
          <td style="padding:6px 8px; text-align:right;">
            <input type="number" min="0" class="input-conteo-modelo" data-modelo="${item.modelo}" style="width:75px; text-align:right; padding:4px; font-weight:bold; color:#4ade80;" placeholder="0">
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    contenedorTabla.style.display = 'flex';
    status.textContent = '';

  } catch (err) {
    console.error('Error al cargar tabla de conteo:', err);
    status.textContent = '❌ Error al preparar la tabla de conteo.';
    status.style.color = '#ef4444';
  }
}

// C. GUARDAR CONTEO FÍSICO REAL (CON DESVIACIÓN ABSOLUTA REAL)
async function guardarConteoFisicoReal() {
  const selectSuc = document.getElementById('aud_sucursal');
  const btnGuardar = document.getElementById('btnGuardarAuditoria');
  const status = document.getElementById('statusAuditoria');

  const keyAlmacen = selectSuc.value;
  const nombreAlmacen = NOMBRES_ALMACEN_AUDITORIA[keyAlmacen] || keyAlmacen;

  if (!keyAlmacen) {
    status.textContent = '⚠️ Seleccioná un almacén válido.';
    status.style.color = '#fde047';
    return;
  }

  if (btnGuardar) btnGuardar.disabled = true;
  status.textContent = '⏳ Guardando auditoría en Supabase...';
  status.style.color = '#38bdf8';

  try {
    const ahoraIso = new Date().toISOString();

    const { data: detallesPrevios } = await supabaseClient
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
        auditor_nombre: usuarioOperadorNombre
      });
    });

    if (listaUpsertDetalle.length > 0) {
      const { error: errDet } = await supabaseClient
        .from('auditoria_control_detalle')
        .upsert(listaUpsertDetalle, { onConflict: 'almacen_key,modelo' });

      if (errDet) throw errDet;
    }

    const { data: audActiva } = await supabaseClient
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
      auditor_nombre: usuarioOperadorNombre
    };

    const { error: errAct } = await supabaseClient
      .from('auditoria_control_activo')
      .update(payloadActivo)
      .eq('almacen_key', keyAlmacen);

    if (errAct) throw errAct;

    status.textContent = `✅ ¡Conteo físico registrado correctamente para ${nombreAlmacen}!`;
    status.style.color = '#4ade80';

  } catch (err) {
    console.error('Error al guardar auditoría:', err);
    status.textContent = '❌ Error al guardar la auditoría: ' + (err.message || 'Error de conexión');
    status.style.color = '#ef4444';
  } finally {
    if (btnGuardar) btnGuardar.disabled = false;
  }
}

document.getElementById('pr_serial').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    buscarEquipoParaPrueba();
  }
});

window.onload = revisarSesionActiva;