// ====================================================
// MÓDULO AUTÓNOMO DE SUITE OPERATIVA (CARGA & LAB)
// ====================================================

const SUPABASE_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizarTexto(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// MAPA DE IMÁGENES OFICIALES VINCULADAS (Incluye nuevos modelos)
const MAPA_IMAGENES_MODELOS = {
  "F6201B": "https://provetel.com.ar/wp-content/uploads/sites/18/2026/01/images-1.jpeg",
  "F6600P": "https://www.zte.com.cn/content/dam/zte-site/res-www-zte-com-cn/mediares/zte/global/productimages/fm_pictures/ont/ZXHN%20F6600P-2.JPG",
  "F670L": "https://provetel.com.ar/wp-content/uploads/sites/18/2023/06/Zte.jpg",
  "EG8147X6": "https://www.sawerin.com.ar/wp-content/uploads/2025/09/overview-600x450.png",
  "F6600R": "https://www.ycict.net/wp-content/uploads/2024/05/ZXHN-F6600R-ycict.jpg",
  "HG8145V5": "https://www.sawerin.com.ar/wp-content/uploads/2025/09/overview-600x450.png",
  "EG8145V5": "https://www.sawerin.com.ar/wp-content/uploads/2025/09/overview-600x450.png",
  "WTXGV2": "https://www.ycict.net/wp-content/uploads/2024/05/ZXHN-F6600R-ycict.jpg"
};

function obtenerUrlImagenModelo(modelo) {
  const norm = normalizarTexto(modelo);
  for (let key in MAPA_IMAGENES_MODELOS) {
    if (norm.includes(key)) {
      return MAPA_IMAGENES_MODELOS[key];
    }
  }
  return '';
}

// LISTA STRICTA DE MODELOS VIP (Los que NO estén aquí pasan directo a DESCARTE)
const LISTA_VIP_EXACTA = [
  "ONU ZTE F6201B V9.3 WIFI6 AX3000",
  "ONU ZTE ZXHN F6600P DB/WIFI6 (FXS)",
  "ONU ZTE F670L V1.1 DUAL BAND WIFI (USADA)",
  "ONU HUAWEI ECHOLIFE EG8147X6",
  "ONU HUAWEI ECHOLIFE EG8147X6 (CATV)",
  "ONU ZTE F6600R DUAL BAND WIFI (CATV)"
].map(normalizarTexto);

function esModeloVIP(modelo) {
  const m = normalizarTexto(modelo);
  return LISTA_VIP_EXACTA.some(vip => m.includes(vip) || vip.includes(m));
}

let equipoCargadoActual = null;
let veredictoFinalCalculado = 'CIRCULACIÓN';
let usuarioOperadorNombre = '';
let fechaInicioPruebaTemp = null;

// --- 1. LÓGICA DE LOGIN Y SESIÓN ---
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
  document.getElementById('aud_nombre').value = usuarioOperadorNombre;

  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
}

function switchOps(tabId, btn) {
  document.querySelectorAll('.ops-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.card-form').forEach(f => f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// EVENTO SELECCIÓN DE MODELO EN CARGA (MUESTRA VISTA PREVIA)
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

// --- 2. CARGA DE EQUIPOS (DERIVACIÓN AUTOMÁTICA DE OBSOLETOS A DESCARTE) ---
document.getElementById('form-carga').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('statusCarga');
  const sn = document.getElementById('cg_serial').value.trim().toUpperCase();

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

  const modelo = document.getElementById('cg_modelo').value;
  const detalleTecnico = document.getElementById('cg_tecnico').value.trim();

  // Evaluación de categoría VIP / Obsoleto
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

// --- 3. BUSCAR EQUIPO PARA PRUEBA ---
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

// --- 4. GUARDAR PRUEBA DE LABORATORIO ---
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

// --- 5. IMPRESIÓN DE ETIQUETAS ---
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

// --- 6. AUDITORÍA DE STOCK ---
document.getElementById('form-auditoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('statusAuditoria');
  msg.textContent = '⏳ Guardando auditoría...';
  msg.style.color = '#38bdf8';

  const real = parseInt(document.getElementById('aud_fisico').value, 10) || 0;
  const sis = parseInt(document.getElementById('aud_sistema').value, 10) || 0;

  const payload = {
    sucursal: document.getElementById('aud_sucursal').value,
    stock_real: real,
    stock_sistema: sis,
    diferencia: real - sis,
    auditor_nombre: usuarioOperadorNombre,
    observaciones: document.getElementById('aud_obs').value.trim()
  };

  const { error } = await supabaseClient.from('auditoria_sucursales').insert([payload]);

  if (error) {
    msg.textContent = '❌ Error: ' + error.message;
    msg.style.color = '#ef4444';
  } else {
    msg.textContent = '✅ ¡Auditoría registrada exitosamente!';
    msg.style.color = '#4ade80';
    document.getElementById('aud_fisico').value = '';
    document.getElementById('aud_sistema').value = '';
    document.getElementById('aud_obs').value = '';
  }
});

document.getElementById('pr_serial').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    buscarEquipoParaPrueba();
  }
});

window.onload = revisarSesionActiva;