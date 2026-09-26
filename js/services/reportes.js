// ====================================================
// MOTOR COMPILADOR DE INFORMES MONOCARÁCTER A4
// MULTISUCURSAL Y ADAPTATIVO
// ====================================================

const supabaseReportes = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_KEY);

// Estado independiente solo para el reporte
window.EstadoReporte = {
  usarHistorico: false,
  rangoStr: 'MESA ACTIVA (HOY)',
  stock: {},
  recupero: {}
};

function normRep(txt) {
  return (txt || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();
}

function obtenerSucursalReporte() {
  return window.SUCURSAL_FILTRO_ACTIVA || window.SUCURSAL_USUARIO || 'OBE';
}

function normRepSucursal(suc) {
  const s = (suc || '').toUpperCase();
  if (s.includes('ELD')) return 'ELDO';
  if (s.includes('WND') || s.includes('WAN')) return 'WND';
  if (s.includes('SPD') || s.includes('PEDRO')) return 'SPD';
  if (s.includes('ITU')) return 'ITU';
  return 'OBE';
}

// ====================================================
// 1. APERTURA DEL MODAL (ACTIVANDO RECUPERO POR DEFECTO)
// ====================================================
function abrirModalReportes() {
  const modal = document.getElementById('modal-reportes');
  if (modal) {
    modal.style.display = 'flex';
    const usr = document.getElementById('user-badge')?.textContent || 'Operador';
    const inputOp = document.getElementById('rep-txt-operador');
    if (inputOp) inputOp.value = usr.replace('👤', '').trim();
    
    // Marcar automáticamente las casillas de Recupero
    const chkRecEst = document.getElementById('rep-chk-rec-est');
    const chkRecTac = document.getElementById('rep-chk-rec-tac');
    const chkRecOpe = document.getElementById('rep-chk-rec-ope');
    if (chkRecEst) chkRecEst.checked = true;
    if (chkRecTac) chkRecTac.checked = true;
    if (chkRecOpe) chkRecOpe.checked = true;

    document.getElementById('rep-rango-rapido').value = 'HOY';
    cambiarRangoReporte();
    compilarReporteLive();
  }
}

function cerrarModalReportes() {
  const modal = document.getElementById('modal-reportes');
  if (modal) modal.style.display = 'none';
}

async function cambiarRangoReporte() {
  const rango = document.getElementById('rep-rango-rapido').value;
  const customDiv = document.getElementById('rep-custom-dates');
  const btnAplicar = document.getElementById('btn-aplicar-fecha-rep');
  const statusMsg = document.getElementById('rep-status-fechas');

  if (statusMsg) statusMsg.style.display = 'none';

  if (rango === 'CUSTOM') {
    if (customDiv) customDiv.style.display = 'flex';
    if (btnAplicar) btnAplicar.style.display = 'block';
  } else if (rango === 'HOY') {
    if (customDiv) customDiv.style.display = 'none';
    if (btnAplicar) btnAplicar.style.display = 'none';
    window.EstadoReporte.usarHistorico = false;
    window.EstadoReporte.rangoStr = 'MESA ACTIVA (HOY)';
    compilarReporteLive();
  } else {
    if (customDiv) customDiv.style.display = 'flex';
    if (btnAplicar) btnAplicar.style.display = 'block';
    
    const hoy = new Date();
    let desde = new Date();
    let hasta = new Date();

    if (rango === 'SEMANA') {
      const diaSem = hoy.getDay();
      const distLunes = (diaSem === 0 ? -6 : 1 - diaSem);
      desde.setDate(hoy.getDate() + distLunes);
      
      hasta = new Date(desde);
      hasta.setDate(desde.getDate() + 6);
    } else if (rango === 'MES') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    }

    const fDesdeStr = desde.toISOString().split('T')[0];
    const fHastaStr = hasta.toISOString().split('T')[0];

    document.getElementById('rep-desde').value = fDesdeStr;
    document.getElementById('rep-hasta').value = fHastaStr;

    if (typeof cargarDatosHistoricosReporte === 'function') {
      await cargarDatosHistoricosReporte();
    }
  }
}

// ====================================================
// CONSULTA DE HISTORIAL A SUPABASE AISLADA POR SUCURSAL
// ====================================================
async function cargarDatosHistoricosReporte() {
  const btn = document.getElementById('btn-aplicar-fecha-rep');
  const statusMsg = document.getElementById('rep-status-fechas');
  const dDesde = document.getElementById('rep-desde').value;
  const dHasta = document.getElementById('rep-hasta').value;
  const sucActiva = obtenerSucursalReporte();

  if (!dDesde || !dHasta) {
    alert("Seleccione fecha Desde y Hasta.");
    return;
  }

  btn.textContent = '⏳ Consultando historial...';
  btn.disabled = true;

  try {
    const [resCat, resPrec] = await Promise.all([
      supabaseReportes.from('catalogo_equipos').select('*'),
      supabaseReportes.from('precios_catalogos').select('*')
    ]);
    
    const catalogo = resCat.data || [];
    
    const resolverInfoRep = (descNorm) => {
      const coincidencias = catalogo.filter(item => {
        const itemNorm = item.modelo_norm || normRep(item.modelo);
        return descNorm.includes(itemNorm) || itemNorm.includes(descNorm);
      });
      if (!coincidencias.length) return null;
      let match = coincidencias.find(c => c.sucursal_id === sucActiva);
      if (!match) match = coincidencias.find(c => c.sucursal_id === 'GLOBAL');
      if (!match) match = coincidencias.find(c => c.sucursal_id === 'OBE');
      return match || coincidencias[0];
    };

    const precios = new Map();
    (resPrec.data || []).forEach(p => {
      const val = parseFloat(p.precio_final) || 0;
      if (p.codigo) precios.set(p.codigo.trim().toUpperCase(), val);
      if (p.descripcion) precios.set(normRep(p.descripcion), val);
    });

    // 1. Stock Histórico
    const { data: ultData } = await supabaseReportes
      .from('registro_stock')
      .select('fecha_registro')
      .lte('fecha_registro', dHasta)
      .order('fecha_registro', { ascending: false })
      .limit(1);

    let stockH = [];
    let fechaStockEncontrada = 'Sin foto de stock previa';
    
    if (ultData && ultData.length > 0) {
      fechaStockEncontrada = ultData[0].fecha_registro;
      const { data: stData } = await supabaseReportes
        .from('registro_stock')
        .select('*')
        .eq('fecha_registro', fechaStockEncontrada);
      
      stockH = (stData || []).filter(row => {
        if (sucActiva === 'TODAS') return true;
        const alm = row.almacen || '';
        return alm.includes(sucActiva) || (sucActiva === 'OBE' && alm.includes('OBE'));
      });
    }

    // 2. Extraer Recupero HISTÓRICO + ACTIVO (Desduplicado)
    let queryHist = supabaseReportes.from('recupero_historico_equipos').select('*');
    let queryOper = supabaseReportes.from('recupero_operativo').select('*');

    if (sucActiva !== 'TODAS') {
      queryHist = queryHist.eq('sucursal_id', sucActiva);
      queryOper = queryOper.eq('sucursal_id', sucActiva);
    }

    const [resHist, resOper] = await Promise.all([queryHist, queryOper]);

    const mapaUnicos = new Map();
    (resHist.data || []).forEach(r => {
      const key = (r.sn || '').toString().trim().toUpperCase();
      if (key) mapaUnicos.set(key, r);
      else mapaUnicos.set(`NO_SN_HIST_${r.id}`, r);
    });
    (resOper.data || []).forEach(r => {
      const key = (r.sn || '').toString().trim().toUpperCase();
      if (key) mapaUnicos.set(key, r);
      else mapaUnicos.set(`NO_SN_OPER_${r.id}`, r);
    });

    const recuperoUnificado = Array.from(mapaUnicos.values());

    // MATEMÁTICA DE STOCK
    let sDB=0, sCATV=0, sTotal=0, sUSD=0, sNuevos=0, sUsados=0;
    let sDev=0, sDevUsd=0, sDesc=0, sDescUsd=0, sDescVip=0, sDescVipUsd=0;

    stockH.forEach(r => {
      const dn = normRep(r.descripcion);
      if (!dn.includes('ONU')) return;
      
      const cant = parseInt(r.stock_total) || 0;
      const infoCat = resolverInfoRep(dn);
      const isVIP = infoCat ? (Boolean(infoCat.es_vip) && !infoCat.es_obsoleto) : false;
      const cat = infoCat ? infoCat.categoria : '';

      const usd = cant * (infoCat && infoCat.precio_usd > 0 ? infoCat.precio_usd : (precios.get(r.codigo) || precios.get(dn) || 0));
      
      if (r.almacen.includes('PRINCIPAL') && isVIP) {
        sTotal += cant; sUSD += usd;
        if (cat === 'DUAL_BAND') sDB += cant;
        if (cat === 'CATV') sCATV += cant;
        if (dn.includes('USAD')) sUsados += cant; else sNuevos += cant;
      }
      
      if (r.almacen === 'OBE_ALM_DEVOLUCIONES') { sDev += cant; sDevUsd += usd; }
      if (r.almacen === 'OBE_ALM_DESCARTE') { sDesc += cant; sDescUsd += usd; }
      if (r.almacen === 'OBE_ALM_DESCARTE_VIP' && isVIP) { sDescVip += cant; sDescVipUsd += usd; }
    });

    // ====================================================
    // ESTRUCTURAS DE AGRUPACIÓN MULTIDIMENSIONAL
    // ====================================================
    let ingTotal = 0, ingVIP = 0, ingObs = 0;
    let labProbadosVIP = 0, labCircVIP = 0, labDescVIP = 0, labCapitalUsd = 0;
    
    const SUCURSALES = ['OBE', 'ELDO', 'WND', 'SPD', 'ITU'];
    const CANALES = ['TÉCNICO RECLAMOS', 'PERSONAL RETIRO', 'SUCURSAL / MOSTRADOR', 'OTROS'];

    const matrizIngresos = {};
    CANALES.forEach(c => {
      matrizIngresos[c] = {};
      SUCURSALES.forEach(s => matrizIngresos[c][s] = 0);
      matrizIngresos[c]['TOTAL'] = 0;
    });

    const tecsLab = {};

    recuperoUnificado.forEach(r => {
      const cant = parseInt(r.cantidad || 1, 10) || 1;
      const dn = normRep(r.descripcion || r.modelo || '');
      const cond = normRep(r.condicion || r.estado || '');
      const suc = normRepSucursal(r.sucursal_id || 'OBE');
      
      const infoCat = resolverInfoRep(dn);
      const isVIP = infoCat ? (Boolean(infoCat.es_vip) && !infoCat.es_obsoleto) : false;
      const isOK = ['CIRCULACION','OK','BUENO','APROBADO'].some(e => cond.includes(e));
      const isRechazado = ['DESCARTE','FALLA','BAJA','DEFECTUOSO','ROTO','RECHAZADO'].some(e => cond.includes(e));
      const usd = cant * (infoCat && infoCat.precio_usd > 0 ? infoCat.precio_usd : (precios.get(r.codigo) || precios.get(dn) || 0));

      const fIng = r.fecha_ingreso ? r.fecha_ingreso.substring(0, 10) : (r.created_at ? r.created_at.substring(0, 10) : '');
      const fFin = r.fin_prueba ? r.fin_prueba.substring(0, 10) : '';

      // --- VECTOR 1: INGRESO LOGÍSTICO (Evalúa por fIng) ---
      if (fIng && fIng >= dDesde && fIng <= dHasta) {
        ingTotal += cant;
        if (isVIP) ingVIP += cant; else ingObs += cant;

        const origRaw = normRep(r.origen || r.almacen_origen || '');
        let canal = 'OTROS';
        if (origRaw.includes('RECLAMO') || origRaw.includes('TECNICO')) canal = 'TÉCNICO RECLAMOS';
        else if (origRaw.includes('RETIRO') || origRaw.includes('PERSONAL')) canal = 'PERSONAL RETIRO';
        else if (origRaw.includes('SUCURSAL') || origRaw.includes('MOSTRADOR')) canal = 'SUCURSAL / MOSTRADOR';

        if (matrizIngresos[canal]) {
          const sucKey = SUCURSALES.includes(suc) ? suc : 'OBE';
          matrizIngresos[canal][sucKey] += cant;
          matrizIngresos[canal]['TOTAL'] += cant;
        }
      }

      // --- VECTOR 2: PRODUCCIÓN LAB (Evalúa por fFin, solo VIP) ---
      if (isVIP && fFin && fFin >= dDesde && fFin <= dHasta) {
        const tecRaw = r.tecnico_prueba || r.tecnico || 'SIN REGISTRO';
        const tecNombre = tecRaw.trim().toUpperCase();

        if (!tecsLab[tecNombre]) {
          tecsLab[tecNombre] = { probados: 0, ok: 0, desc: 0 };
        }

        if (isOK) {
          labCircVIP += cant;
          labCapitalUsd += usd;
          labProbadosVIP += cant;
          tecsLab[tecNombre].probados += cant;
          tecsLab[tecNombre].ok += cant;
        } else if (isRechazado) {
          labDescVIP += cant;
          labProbadosVIP += cant;
          tecsLab[tecNombre].probados += cant;
          tecsLab[tecNombre].desc += cant;
        }
      }
    });

    const pctEfectividadVIP = labProbadosVIP > 0 ? ((labCircVIP / labProbadosVIP) * 100).toFixed(1) : "0.0";

    window.EstadoReporte.stock = {
      cargado: true,
      totalDualBand: sDB, totalCatv: sCATV, totalOperativo: sTotal, costoTotalUsd: sUSD,
      totalNuevos: sNuevos, totalUsados: sUsados,
      devolucionesCant: sDev, devolucionesValorUsd: sDevUsd,
      descarteCant: sDesc, descarteValorUsd: sDescUsd,
      descarteVipCant: sDescVip, descarteVipValorUsd: sDescVipUsd,
      fechaSincronizacion: fechaStockEncontrada
    };

    window.EstadoReporte.recupero = {
      cargado: true,
      ingresadosTotal: ingTotal,
      ingresadosVIP: ingVIP,
      ingresadosObs: ingObs,
      matrizIngresos: matrizIngresos,
      probadosVIPTotal: labProbadosVIP,
      enCirculacionVIP: labCircVIP,
      fueraCirculacionVIP: labDescVIP,
      pctReaprovechamiento: pctEfectividadVIP,
      capitalTotal: labCapitalUsd,
      tecnicosLab: tecsLab
    };

    window.EstadoReporte.usarHistorico = true;
    const dDesdeStr = dDesde.split('-').reverse().join('/');
    const dHastaStr = dHasta.split('-').reverse().join('/');
    window.EstadoReporte.rangoStr = `PERÍODO: ${dDesdeStr} al ${dHastaStr}`;
    
    compilarReporteLive();

    if (statusMsg) {
      statusMsg.textContent = '✅ Datos procesados correctamente';
      statusMsg.style.display = 'block';
    }
  } catch (error) {
    console.error(error);
    alert("Error al extraer historial. Revisa consola.");
  } finally {
    btn.textContent = '↻ Extraer Datos de Fecha';
    btn.disabled = false;
  }
}

// ====================================================
// 2. COMPILADOR A4 CON MATRIZ PIVOT Y RENDIMIENTO TÉCNICO
// ====================================================
function compilarReporteLive() {
  const hoja = document.getElementById('hoja-a4-preview');
  if (!hoja) return;

  const stkEst = document.getElementById('rep-chk-stock-est')?.checked || false;
  const stkTac = document.getElementById('rep-chk-stock-tac')?.checked || false;
  const recEst = document.getElementById('rep-chk-rec-est')?.checked || false;
  const recTac = document.getElementById('rep-chk-rec-tac')?.checked || false;

  const operador = document.getElementById('rep-txt-operador')?.value || 'Sin Especificar';
  const fechaHoyStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const horaHoyStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const estStock = window.EstadoReporte.usarHistorico ? window.EstadoReporte.stock : (window.EstadoStock || {});
  const estRec = window.EstadoReporte.usarHistorico ? window.EstadoReporte.recupero : (window.EstadoRecupero || {});
  const rangoAplicado = window.EstadoReporte.rangoStr || 'FECHA ACTUAL';
  
  let tituloSucursal = obtenerSucursalReporte();
  if (tituloSucursal === 'OBE') tituloSucursal = 'OBERÁ MATRIZ';
  if (tituloSucursal === 'SPD') tituloSucursal = 'SAN PEDRO';
  if (tituloSucursal === 'TODAS') tituloSucursal = 'GLOBAL SUCURSALES';

  let html = `
    <div style="font-family: 'Consolas', 'Courier New', monospace; font-size: 8pt; color: #000; line-height: 1.25; width: 100%;">
      
      <div style="border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="font-size: 11pt; font-weight: bold; letter-spacing: 0.5px;">[ REPORTE TÉCNICO CONSOLIDADO: ${tituloSucursal} ]</div>
          <div style="font-size: 7.5pt; color: #333;">SISTEMA DE CONTROL OPERATIVO DE SUMINISTROS | ${rangoAplicado}</div>
        </div>
        <div style="text-align: right; font-size: 7.5pt;">
          FECHA IMPRESIÓN: ${fechaHoyStr} ${horaHoyStr} HS<br>
          RESPONSABLE: ${operador.toUpperCase()}
        </div>
      </div>
  `;

  // ==================== 1. MÓDULO CONTROL DE STOCK ====================
  if (stkEst || stkTac) {
    html += `<div style="margin-bottom: 12px;"><div style="font-weight: bold; background: #000; color: #fff; padding: 2px 5px; font-size: 8.5pt;">=== 1. MÓDULO CONTROL DE STOCK ===</div>`;

    if (stkEst && estStock.cargado) {
      html += `
        <div style="margin-top: 4px; font-size: 7.5pt; font-weight: bold;">[🏛️ INDICADORES ESTRATÉGICOS DE STOCK]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7.5pt;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 2px;">Total Operativo en Red: <b>${(estStock.totalOperativo || 0).toLocaleString('es-AR')} un.</b></td>
            <td style="padding: 2px;">Dual Band: <b>${estStock.totalDualBand || 0}</b> | CATV: <b>${estStock.totalCatv || 0}</b></td>
            <td style="padding: 2px; text-align: right;">Valorización: <b>$ ${Math.round(estStock.costoTotalUsd || 0).toLocaleString('es-AR')} USD</b></td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td colspan="2" style="padding: 2px;">Condición de Equipos VIP: Nuevos (<b>${estStock.totalNuevos || 0}</b>) / Usados (<b>${estStock.totalUsados || 0}</b>)</td>
            <td style="padding: 2px; text-align: right;">Sincronizado: ${estStock.fechaSincronizacion || '--'}</td>
          </tr>
        </table>
      `;
    }

    if (stkTac && estStock.cargado) {
      html += `
        <div style="margin-top: 6px; font-size: 7.5pt; font-weight: bold;">[🎯 INDICADORES TÁCTICOS - INMOVILIZADOS Y A PROBAR]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7.5pt; border: 1px solid #000;">
          <thead>
            <tr style="background: #f0f0f0; font-weight: bold; border-bottom: 1px solid #000;">
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: left;">Depósito / Categoría</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">Cantidad</th>
              <th style="padding: 2px 4px; text-align: right;">Capital Inmovilizado USD</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc;">📥 Devoluciones (A Probar)</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center; font-weight: bold;">${estStock.devolucionesCant || 0} un.</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; text-align: right;">$ ${Math.round(estStock.devolucionesValorUsd || 0).toLocaleString('es-AR')} USD</td>
            </tr>
            <tr>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc;">🗑️ Descarte General (Obsoleto)</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${estStock.descarteCant || 0} un.</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; text-align: right;">$ ${Math.round(estStock.descarteValorUsd || 0).toLocaleString('es-AR')} USD</td>
            </tr>
            <tr>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc;">👑 Descarte VIP (Falla Lab)</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${estStock.descarteVipCant || 0} un.</td>
              <td style="padding: 2px 4px; text-align: right;">$ ${Math.round(estStock.descarteVipValorUsd || 0).toLocaleString('es-AR')} USD</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    html += `</div>`;
  }

  // ==================== 2. MÓDULO RECUPERO Y LABORATORIO ====================
  if (recEst || recTac) {
    html += `<div style="margin-bottom: 12px;"><div style="font-weight: bold; background: #000; color: #fff; padding: 2px 5px; font-size: 8.5pt;">=== 2. MÓDULO RECUPERO Y LABORATORIO ===</div>`;

    // 2.1 VISTA ESTRATÉGICA (MACRO TOTALES)
    if (recEst && estRec.cargado) {
      html += `
        <div style="margin-top: 4px; font-size: 7.5pt; font-weight: bold;">[🏛️ INDICADORES ESTRATÉGICOS DE RECUPERO]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7.5pt;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 2px;">Total Ingresado en Período: <b>${estRec.ingresadosTotal || 0} un.</b></td>
            <td style="padding: 2px;">Recuperados VIP (OK): <b>${estRec.enCirculacionVIP || 0} un.</b></td>
            <td style="padding: 2px; text-align: right;">Efectividad VIP: <b>${estRec.pctReaprovechamiento || "0.0"}%</b></td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 2px;">Descarte VIP (Falla Lab): <b>${estRec.fueraCirculacionVIP || 0} un.</b></td>
            <td style="padding: 2px;">Descarte Obsoleto Directo: <b>${estRec.ingresadosObs || 0} un.</b></td>
            <td style="padding: 2px; text-align: right;">Capital Recuperado: <b>$ ${Math.round(estRec.capitalTotal || 0).toLocaleString('es-AR')} USD</b></td>
          </tr>
        </table>
      `;
    }

    // 2.2 VISTA TÁCTICA (DESGLOSE POR SUCURSAL Y POR TÉCNICO)
    if (recTac && estRec.cargado) {
      const mat = estRec.matrizIngresos || {};
      const SUCURSALES = ['OBE', 'ELDO', 'WND', 'SPD', 'ITU'];
      
      const totSuc = { OBE: 0, ELDO: 0, WND: 0, SPD: 0, ITU: 0, TOTAL: 0 };
      Object.keys(mat).forEach(canal => {
        SUCURSALES.forEach(s => totSuc[s] += (mat[canal][s] || 0));
        totSuc['TOTAL'] += (mat[canal]['TOTAL'] || 0);
      });

      let filasMatriz = Object.keys(mat).map(canal => `
        <tr>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc;">${canal}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${mat[canal]['OBE'] || 0}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${mat[canal]['ELDO'] || 0}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${mat[canal]['WND'] || 0}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${mat[canal]['SPD'] || 0}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${mat[canal]['ITU'] || 0}</td>
          <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; text-align: center; font-weight: bold;">${mat[canal]['TOTAL'] || 0}</td>
        </tr>
      `).join('');

      html += `
        <div style="margin-top: 8px; font-size: 7.5pt; font-weight: bold;">[📥 2.1 INGRESO LOGÍSTICO POR CANAL Y SUCURSAL]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7pt; border: 1px solid #000;">
          <thead>
            <tr style="background: #f0f0f0; font-weight: bold; border-bottom: 1px solid #000;">
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: left;">Canal de Origen</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">OBERÁ</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">ELDORADO</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">WANDA</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">SAN PEDRO</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">ITUZAINGÓ</th>
              <th style="padding: 2px 4px; text-align: center; background: #e2e8f0;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${filasMatriz}
            <tr style="background: #f8fafc; font-weight: bold;">
              <td style="padding: 2px 4px; border-right: 1px solid #ccc;">TOTAL RECIBIDO (VIP: ${estRec.ingresadosVIP || 0} | OBS: ${estRec.ingresadosObs || 0})</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${totSuc['OBE']}</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${totSuc['ELDO']}</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${totSuc['WND']}</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${totSuc['SPD']}</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${totSuc['ITU']}</td>
              <td style="padding: 2px 4px; text-align: center; background: #e2e8f0;">${totSuc['TOTAL']} un.</td>
            </tr>
          </tbody>
        </table>
      `;

      const tecs = estRec.tecnicosLab || {};
      let filasTecnicos = Object.keys(tecs).map(t => {
        const p = tecs[t].probados;
        const ok = tecs[t].ok;
        const desc = tecs[t].desc;
        const pct = p > 0 ? ((ok / p) * 100).toFixed(1) : "0.0";
        return `
          <tr>
            <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; font-weight: bold;">${t}</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${p} un.</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${ok} un.</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; text-align: center;">${desc} un.</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #ccc; text-align: center; font-weight: bold;">${pct}%</td>
          </tr>
        `;
      }).join('');

      html += `
        <div style="margin-top: 8px; font-size: 7.5pt; font-weight: bold;">[🧪 2.2 PRODUCCIÓN Y RENDIMIENTO POR TÉCNICO DE PRUEBA]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7pt; border: 1px solid #000;">
          <thead>
            <tr style="background: #f0f0f0; font-weight: bold; border-bottom: 1px solid #000;">
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: left;">Técnico de Prueba</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">Total Testeado</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">🟢 VIP OK (Circulación)</th>
              <th style="padding: 2px 4px; border-right: 1px solid #000; text-align: center;">🔴 VIP Descarte (Falla)</th>
              <th style="padding: 2px 4px; text-align: center;">% Efectividad VIP</th>
            </tr>
          </thead>
          <tbody>
            ${filasTecnicos || '<tr><td colspan="5" style="padding: 4px; text-align: center;">Sin registros de laboratorio en el período.</td></tr>'}
            <tr style="background: #f8fafc; font-weight: bold; border-top: 1px solid #000;">
              <td style="padding: 2px 4px; border-right: 1px solid #ccc;">TOTAL RENDIMIENTO LAB</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${estRec.probadosVIPTotal || 0} un.</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${estRec.enCirculacionVIP || 0} un.</td>
              <td style="padding: 2px 4px; border-right: 1px solid #ccc; text-align: center;">${estRec.fueraCirculacionVIP || 0} un.</td>
              <td style="padding: 2px 4px; text-align: center;">${estRec.pctReaprovechamiento || "0.0"}%</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    html += `</div>`;
  }

  html += `
      <div style="margin-top: 15px; border-top: 1px dashed #000; padding-top: 4px; font-size: 7pt; text-align: center; color: #333;">
        =================== FIN DEL INFORME ===================
      </div>
    </div>
  `;

  hoja.innerHTML = html;
}

function descargarPDFReporte() {
  const el = document.getElementById('hoja-a4-preview');
  if (!el) return;
  const suc = obtenerSucursalReporte();
  const opt = {
    margin: 5,
    filename: `Reporte_Logistica_${suc}_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(el).save();
}

function imprimirReporteDirecto() {
  window.print();
}