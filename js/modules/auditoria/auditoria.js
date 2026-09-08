// ====================================================
// MÓDULO INDEPENDIENTE DE AUDITORÍA Y CONTEO FÍSICO
// ====================================================

const SUPABASE_URL_AUD = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_AUD = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';

function getSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL_AUD, SUPABASE_KEY_AUD);
    return window.supabaseClient;
  }
  return null;
}

const LISTA_ALMACENES_AUDITORIA = [
  { key: 'OBE_ALM_PRINCIPAL', nombre: 'OBE Principal' },
  { key: 'OBE_ALM_CATRIEL', nombre: 'OBE Catriel (Compras)' },
  { key: 'OBE_ALM_DEVOLUCIONES', nombre: 'OBE Devoluciones (Triage)' },
  { key: 'OBE_ALM_DESCARTE', nombre: 'OBE Descarte (Inmovilizado)' },
  { key: 'SPD_ALM_PRINCIPAL', nombre: 'San Pedro Principal' },
  { key: 'WND_ALM_PRINCIPAL', nombre: 'Wanda Principal' },
  { key: 'ITU_ALM_PRINCIPAL', nombre: 'Ituzaingó Principal' },
  { key: 'ELDO_ALM_PRINCIPAL', nombre: 'Eldorado Principal' }
];

let catalogoModelosAuditoria = [];

function normalizarTextoAud(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// 📸 PASO 1: CONGELAR MAPA DE STOCK DEL SISTEMA
async function iniciarSnapshotSistema() {
  const btn = document.getElementById('btnSnapshot');
  const msg = document.getElementById('statusSnapshot');
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Auditor';
  const client = getSupabaseClient();

  if (!client) {
    alert('❌ Error: Cliente de Supabase no disponible.');
    return;
  }

  if (btn) btn.disabled = true;
  if (msg) {
    msg.textContent = '⏳ Obteniendo stock actual del sistema...';
    msg.style.color = '#38bdf8';
  }

  try {
    // 1. Obtener última fecha en registro_stock
    const { data: ult, error: errUlt } = await client
      .from('registro_stock')
      .select('fecha_registro')
      .order('fecha_registro', { ascending: false })
      .limit(1);

    if (errUlt) throw new Error('Error al consultar stock: ' + errUlt.message);
    if (!ult || !ult.length) throw new Error('No hay datos de stock registrados.');

    const ultimaFecha = ult[0].fecha_registro;

    // 2. Traer registros del stock por paginación
    let todosLosRegistros = [];
    let desde = 0;
    const tamanoPagina = 1000;
    let tieneMas = true;

    while (tieneMas) {
      const { data: pagina, error: errPag } = await client
        .from('registro_stock')
        .select('codigo, descripcion, stock_total, almacen')
        .eq('fecha_registro', ultimaFecha)
        .range(desde, desde + tamanoPagina - 1);

      if (errPag) throw errPag;
      if (pagina && pagina.length > 0) {
        todosLosRegistros = todosLosRegistros.concat(pagina);
        if (pagina.length < tamanoPagina) tieneMas = false;
        else desde += tamanoPagina;
      } else {
        tieneMas = false;
      }
    }

    const nowIso = new Date().toISOString();
    const mapaAlmacenes = {};
    LISTA_ALMACENES_AUDITORIA.forEach(a => { mapaAlmacenes[a.key] = {}; });

    // 3. Crear mapa por modelo para cada depósito
    todosLosRegistros.forEach(row => {
      let rawAlm = (row.almacen || '').trim().toUpperCase();
      if (rawAlm === 'SPD_PRINCIPAL') rawAlm = 'SPD_ALM_PRINCIPAL';
      if (rawAlm === 'WND_PRINCIPAL' || rawAlm === 'WND-PRINCIPAL') rawAlm = 'WND_ALM_PRINCIPAL';

      if (!mapaAlmacenes[rawAlm]) mapaAlmacenes[rawAlm] = {};

      const modDesc = normalizarTextoAud(row.descripcion || 'DESCONOCIDO');
      const cant = parseInt(row.stock_total, 10) || 0;

      mapaAlmacenes[rawAlm][modDesc] = (mapaAlmacenes[rawAlm][modDesc] || 0) + cant;
    });

    // 4. Crear o actualizar sesiones activas en auditoria_control_activo
    const registrosCabecera = LISTA_ALMACENES_AUDITORIA.map(alm => ({
      almacen_key: alm.key,
      almacen_nombre: alm.nombre,
      stock_sistema: 0,
      stock_fisico: 0,
      diferencia: 0,
      desviacion_pct: 0.00,
      fecha_snapshot: nowIso,
      fecha_inicio: nowIso,
      auditor: operadorNombre,
      auditor_nombre: operadorNombre,
      snapshot_datos: mapaAlmacenes[alm.key] || {},
      estado: 'EN_PROCESO'
    }));

    const { error: errUpsert } = await client
      .from('auditoria_control_activo')
      .upsert(registrosCabecera, { onConflict: 'almacen_key' });

    if (errUpsert) throw new Error('Error al congelar snapshot: ' + errUpsert.message);

    if (msg) {
      msg.textContent = `✅ Stock congelado. Listo para registrar conteos.`;
      msg.style.color = '#4ade80';
    }

  } catch (err) {
    console.error(err);
    alert('❌ ERROR AL CONGELAR STOCK:\n\n' + err.message);
    if (msg) {
      msg.textContent = '❌ Error: ' + err.message;
      msg.style.color = '#ef4444';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 📝 PASO 2: CARGAR TABLA DE CONTEO FÍSICO POR MODELOS
async function cargarTablaConteoFisico() {
  const selectSucursal = document.getElementById('aud_sucursal');
  const contenedorTabla = document.getElementById('contenedorTablaConteo');
  const tbody = document.getElementById('tbodyConteoModelos');
  const msg = document.getElementById('statusAuditoria');
  const client = getSupabaseClient();

  if (!selectSucursal || !selectSucursal.value) return;

  if (msg) {
    msg.textContent = '⏳ Cargando catálogo...';
    msg.style.color = '#38bdf8';
  }

  try {
    if (catalogoModelosAuditoria.length === 0 && client) {
      const { data, error } = await client
        .from('catalogo_equipos')
        .select('modelo')
        .order('modelo', { ascending: true });

      if (error) throw error;
      catalogoModelosAuditoria = (data || []).map(d => d.modelo);
    }

    if (!tbody) return;
    tbody.innerHTML = '';

    if (catalogoModelosAuditoria.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:12px; color:#f87171;">Sin modelos en catálogo.</td></tr>';
    } else {
      catalogoModelosAuditoria.forEach((modelo, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${modelo}</strong></td>
          <td style="text-align:right;">
            <input type="number" 
                   class="input-count" 
                   data-modelo="${modelo}" 
                   min="0" 
                   placeholder="0" 
                   id="cnt_${index}">
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    if (contenedorTabla) contenedorTabla.style.display = 'flex';
    if (msg) msg.textContent = '';

  } catch (err) {
    console.error(err);
  }
}

// 💾 PASO 3: GUARDAR CONTEO Y RECALCULAR CABECERA SEGÚN MODELOS AUDITADOS
async function guardarConteoFisicoReal() {
  const selectSucursal = document.getElementById('aud_sucursal');
  const btnGuardar = document.getElementById('btnGuardarAuditoria');
  const msg = document.getElementById('statusAuditoria');
  const operadorNombre = window.USUARIO_NOMBRE_MOSTRAR || document.getElementById('user-badge')?.textContent.replace('👤', '').trim() || 'Auditor';
  const client = getSupabaseClient();

  if (!client) {
    alert('❌ Error: Cliente de Supabase no disponible.');
    return;
  }

  const almacenseleccionado = selectSucursal?.value;
  if (!almacenseleccionado) {
    alert('⚠️ Seleccioná un almacén antes de guardar.');
    return;
  }

  const inputs = document.querySelectorAll('.input-count');
  const listaDetallesInsertar = [];
  const sucCodigo = almacenseleccionado.split('_')[0] || 'OBE';

  // 1. Cargar cabecera del almacén seleccionado
  const { data: cabeceraActual, error: errCab } = await client
    .from('auditoria_control_activo')
    .select('*')
    .eq('almacen_key', almacenseleccionado)
    .limit(1)
    .single();

  if (errCab || !cabeceraActual) {
    alert('⚠️ No se encontró la sesión de stock congelado. Hacé clic en "📸 Paso 1: Iniciar Control y Congelar Stock" primero.');
    return;
  }

  const snapshotMap = cabeceraActual.snapshot_datos || {};

  let sumaStockSistemaAuditado = 0;
  let sumaStockFisicoAuditado = 0;

  // 2. Evaluar únicamente los inputs que tienen valor ingresado
  inputs.forEach(input => {
    const valorTxt = input.value.trim();
    if (valorTxt !== '') {
      const cantFisica = parseInt(valorTxt, 10) || 0;
      const modeloOriginal = input.getAttribute('data-modelo');
      const modeloNorm = normalizarTextoAud(modeloOriginal);

      // Buscar si este modelo existe en el stock congelado del sistema (0 si no existía)
      let cantSistema = 0;
      Object.keys(snapshotMap).forEach(k => {
        if (k.includes(modeloNorm) || modeloNorm.includes(k)) {
          cantSistema += snapshotMap[k];
        }
      });

      const dif = cantFisica - cantSistema;

      listaDetallesInsertar.push({
        almacen_key: almacenseleccionado,
        almacen: almacenseleccionado,
        sucursal_id: sucCodigo,
        modelo: modeloOriginal,
        stock_sistema: cantSistema,
        cantidad_sistema: cantSistema,
        stock_fisico: cantFisica,
        cantidad_fisica: cantFisica,
        diferencia: dif,
        auditor: operadorNombre,
        auditor_nombre: operadorNombre,
        fecha_snapshot: cabeceraActual.fecha_snapshot || new Date().toISOString(),
        fecha_inspeccion: new Date().toISOString()
      });

      sumaStockSistemaAuditado += cantSistema;
      sumaStockFisicoAuditado += cantFisica;
    }
  });

  if (listaDetallesInsertar.length === 0) {
    alert('⚠️ Ingresá al menos una cantidad en la tabla de conteo.');
    return;
  }

  if (!confirm(`¿Guardar conteo de ${sumaStockFisicoAuditado} unidades para [${almacenseleccionado}]?`)) return;

  if (btnGuardar) btnGuardar.disabled = true;
  if (msg) { msg.textContent = '⏳ Guardando en Supabase...'; msg.style.color = '#38bdf8'; }

  try {
    // 3. Guardar o actualizar renglones en auditoria_control_detalle
    const { error: errInsert } = await client
      .from('auditoria_control_detalle')
      .upsert(listaDetallesInsertar, { onConflict: 'almacen_key, modelo' });

    if (errInsert) throw new Error('Error al guardar en auditoria_control_detalle: ' + errInsert.message);

    // 4. Recalcular la cabecera basándonos ÚNICAMENTE en los modelos auditados
    const difTotal = sumaStockFisicoAuditado - sumaStockSistemaAuditado;
    const desvPct = sumaStockSistemaAuditado > 0 
      ? parseFloat(((Math.abs(difTotal) / sumaStockSistemaAuditado) * 100).toFixed(2)) 
      : 0;

    await client
      .from('auditoria_control_activo')
      .update({
        stock_sistema: sumaStockSistemaAuditado,
        stock_fisico: sumaStockFisicoAuditado,
        diferencia: difTotal,
        desviacion_pct: desvPct,
        fecha_inspeccion: new Date().toISOString(),
        estado: 'COMPLETADO'
      })
      .eq('id', cabeceraActual.id);

    alert(`✅ ¡Conteo guardado con éxito!\n\n• Stock Sistema (Modelos Auditados): ${sumaStockSistemaAuditado} un.\n• Stock Físico Encontrado: ${sumaStockFisicoAuditado} un.\n• Diferencia: ${difTotal >= 0 ? '+' : ''}${difTotal} un.`);

    if (msg) { msg.textContent = `✅ Auditoría completada.`; msg.style.color = '#4ade80'; }
    inputs.forEach(i => i.value = '');

  } catch (err) {
    console.error(err);
    alert('❌ ERROR AL GUARDAR CONTEO:\n\n' + err.message);
  } finally {
    setTimeout(() => { if (btnGuardar) btnGuardar.disabled = false; }, 600);
  }
}