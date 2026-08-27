// ====================================================
// MOTOR COMPILADOR DE INFORMES MONOCARÁCTER A4
// MULTISUCURSAL Y ADAPTATIVO
// ====================================================

const SUPABASE_URL_REP = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REP = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseReportes = supabase.createClient(SUPABASE_URL_REP, SUPABASE_KEY_REP);

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

function abrirModalReportes() {
  const modal = document.getElementById('modal-reportes');
  if (modal) {
    modal.style.display = 'flex';
    const usr = document.getElementById('user-badge')?.textContent || 'Operador';
    const inputOp = document.getElementById('rep-txt-operador');
    if (inputOp) inputOp.value = usr.replace('👤', '').trim();
    
    document.getElementById('rep-rango-rapido').value = 'HOY';
    cambiarRangoReporte();
    compilarReporteLive();
  }
}

function cerrarModalReportes() {
  const modal = document.getElementById('modal-reportes');
  if (modal) modal.style.display = 'none';
}

function cambiarRangoReporte() {
  const rango = document.getElementById('rep-rango-rapido').value;
  const customDiv = document.getElementById('rep-custom-dates');
  const btnAplicar = document.getElementById('btn-aplicar-fecha-rep');
  const statusMsg = document.getElementById('rep-status-fechas');

  statusMsg.style.display = 'none';

  if (rango === 'CUSTOM') {
    customDiv.style.display = 'flex';
    btnAplicar.style.display = 'block';
  } else if (rango === 'HOY') {
    customDiv.style.display = 'none';
    btnAplicar.style.display = 'none';
    window.EstadoReporte.usarHistorico = false;
    window.EstadoReporte.rangoStr = 'MESA ACTIVA (HOY)';
    compilarReporteLive();
  } else {
    customDiv.style.display = 'flex';
    btnAplicar.style.display = 'block';
    
    const hoy = new Date();
    const desde = new Date();
    if (rango === 'SEMANA') desde.setDate(hoy.getDate() - 7);
    if (rango === 'MES') desde.setDate(hoy.getDate() - 30);

    document.getElementById('rep-hasta').value = hoy.toISOString().split('T')[0];
    document.getElementById('rep-desde').value = desde.toISOString().split('T')[0];
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
    // 1. Obtener Catálogos Dinámicos (Clave para VIP por sucursal)
    const [resCat, resPrec] = await Promise.all([
      supabaseReportes.from('catalogo_equipos').select('*'),
      supabaseReportes.from('precios_catalogos').select('*')
    ]);
    
    const catalogo = resCat.data || [];
    
    // Función auxiliar para resolver jerarquía del catálogo
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

    // 2. Extraer Stock Histórico
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
      
      // Filtrar el stock a nivel nacional o por sucursal activa
      stockH = (stData || []).filter(row => {
        if (sucActiva === 'TODAS') return true;
        const alm = row.almacen || '';
        return alm.includes(sucActiva) || (sucActiva === 'OBE' && alm.includes('OBE'));
      });
    }

    // 3. Extraer Recupero HISTÓRICO + ACTIVO
    let queryHist = supabaseReportes.from('recupero_historico_equipos').select('*');
    let queryOper = supabaseReportes.from('recupero_operativo').select('*');

    if (sucActiva !== 'TODAS') {
      queryHist = queryHist.eq('sucursal_id', sucActiva);
      queryOper = queryOper.eq('sucursal_id', sucActiva);
    }

    const [resHist, resOper] = await Promise.all([queryHist, queryOper]);
    const recuperoCrudo = [...(resHist.data || []), ...(resOper.data || [])];

    const recuperoH = recuperoCrudo.filter(row => {
      const fIng = row.fecha_ingreso ? row.fecha_ingreso.substring(0, 10) : '1970-01-01';
      const fFin = row.fin_prueba ? row.fin_prueba.substring(0, 10) : '1970-01-01';
      const cAt = row.created_at ? row.created_at.substring(0, 10) : '1970-01-01';
      
      const entraEnRango = (fIng >= dDesde && fIng <= dHasta) || (cAt >= dDesde && cAt <= dHasta);
      const probadoEnRango = (fFin >= dDesde && fFin <= dHasta);
      return entraEnRango || probadoEnRango;
    });

    // --- MATEMÁTICA DE STOCK HISTÓRICO ---
    let sDB=0, sCATV=0, sTotal=0, sUSD=0, sNuevos=0, sUsados=0;
    let sDev=0, sDevUsd=0, sDesc=0, sDescUsd=0, sDescVip=0, sDescVipUsd=0;

    stockH.forEach(r => {
      const dn = normRep(r.descripcion);
      if (!dn.includes('ONU')) return;
      
      const cant = parseInt(r.stock_total) || 0;
      const infoCat = resolverInfoRep(dn);
      const isVIP = infoCat ? (infoCat.es_vip && !infoCat.es_obsoleto) : false;
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

    // --- MATEMÁTICA DE RECUPERO EN EL PERÍODO ---
    let rTotal=0, rDescObs=0, rCirc=0, rDescVip=0, rUSD=0;
    let itemsVipH = [];

    recuperoH.forEach(r => {
      const cant = parseInt(r.cantidad || 1) || 1;
      const dn = normRep(r.descripcion);
      const cond = normRep(r.condicion || r.estado || '');
      
      const infoCat = resolverInfoRep(dn);
      const isVIP = infoCat ? (infoCat.es_vip && !infoCat.es_obsoleto) : false;
      const isOK = ['CIRCULACION','OK','BUENO','APROBADO'].some(e => cond.includes(e));
      const usd = cant * (infoCat && infoCat.precio_usd > 0 ? infoCat.precio_usd : (precios.get(r.codigo) || precios.get(dn) || 0));

      const fIng = r.fecha_ingreso ? r.fecha_ingreso.substring(0,10) : (r.created_at ? r.created_at.substring(0,10) : '1970-01-01');
      if (fIng >= dDesde && fIng <= dHasta) rTotal += cant;
      
      const fFin = r.fin_prueba ? r.fin_prueba.substring(0, 10) : '1970-01-01';
      if (fFin >= dDesde && fFin <= dHasta) {
        if (!isVIP) {
          rDescObs += cant;
        } else if (isOK) {
          rCirc += cant; rUSD += usd;
        } else {
          rDescVip += cant;
        }

        if (isVIP && r.fin_prueba) {
          const fh = new Date(r.fin_prueba);
          itemsVipH.push({
            hora: fh.toLocaleDateString('es-AR') + ' ' + fh.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}),
            sn: r.sn || 'S/N',
            modelo: r.descripcion,
            esAprobado: isOK
          });
        }
      }
    });

    const probadosH = rCirc + rDescVip;
    const rPct = probadosH > 0 ? ((rCirc / probadosH)*100).toFixed(1) : 0;

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
      totalRecibidos: rTotal, directoDescarteObs: rDescObs,
      enCirculacionVIP: rCirc, fueraCirculacionVIP: rDescVip,
      pctReaprovechamiento: rPct, capitalTotal: rUSD,
      itemsVipTesteadosHoy: itemsVipH, recuperadosHoy: rCirc
    };

    window.EstadoReporte.usarHistorico = true;
    const dDesdeStr = dDesde.split('-').reverse().join('/');
    const dHastaStr = dHasta.split('-').reverse().join('/');
    window.EstadoReporte.rangoStr = `PERÍODO: ${dDesdeStr} al ${dHastaStr}`;
    
    compilarReporteLive();

    statusMsg.textContent = '✅ Datos procesados correctamente';
    statusMsg.style.display = 'block';
  } catch (error) {
    console.error(error);
    alert("Error al extraer historial. Revisa consola.");
  } finally {
    btn.textContent = '↻ Extraer Datos de Fecha';
    btn.disabled = false;
  }
}

// ====================================================
// RENDERIZADO DEL PDF
// ====================================================
function compilarReporteLive() {
  const hoja = document.getElementById('hoja-a4-preview');
  if (!hoja) return;

  const stkEst = document.getElementById('rep-chk-stock-est')?.checked || false;
  const stkTac = document.getElementById('rep-chk-stock-tac')?.checked || false;
  const stkOpe = document.getElementById('rep-chk-stock-ope')?.checked || false;
  const recEst = document.getElementById('rep-chk-rec-est')?.checked || false;
  const recTac = document.getElementById('rep-chk-rec-tac')?.checked || false;
  const recOpe = document.getElementById('rep-chk-rec-ope')?.checked || false;

  const operador = document.getElementById('rep-txt-operador')?.value || 'Sin Especificar';
  const fechaHoyStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const horaHoyStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const estStock = window.EstadoReporte.usarHistorico ? window.EstadoReporte.stock : (window.EstadoStock || {});
  const estRec = window.EstadoReporte.usarHistorico ? window.EstadoReporte.recupero : (window.EstadoRecupero || {});
  const rangoAplicado = window.EstadoReporte.rangoStr;
  
  // Detección para el encabezado del documento
  let tituloSucursal = obtenerSucursalReporte();
  if (tituloSucursal === 'OBE') tituloSucursal = 'OBERÁ MATRIZ';
  if (tituloSucursal === 'SPD') tituloSucursal = 'SAN PEDRO';
  if (tituloSucursal === 'TODAS') tituloSucursal = 'GLOBAL SUCURSALES';

  let html = `
    <div style="font-family: 'Consolas', 'Courier New', monospace; font-size: 8pt; color: #000; line-height: 1.2; width: 100%;">
      
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

  if (stkEst || stkTac || stkOpe) {
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
          <tr style="background: #f0f0f0; font-weight: bold;">
            <td style="padding: 2px; border: 1px solid #000;">Depósito / Categoría</td>
            <td style="padding: 2px; border: 1px solid #000; text-align: center;">Cantidad</td>
            <td style="padding: 2px; border: 1px solid #000; text-align: right;">Capital Inmovilizado USD</td>
          </tr>
          <tr>
            <td style="padding: 2px; border: 1px solid #ccc;">📥 Devoluciones (A Probar)</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: center; font-weight: bold;">${estStock.devolucionesCant || 0} un.</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: right;">$ ${Math.round(estStock.devolucionesValorUsd || 0).toLocaleString('es-AR')} USD</td>
          </tr>
          <tr>
            <td style="padding: 2px; border: 1px solid #ccc;">🗑️ Descarte General (Obsoleto)</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: center;">${estStock.descarteCant || 0} un.</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: right;">$ ${Math.round(estStock.descarteValorUsd || 0).toLocaleString('es-AR')} USD</td>
          </tr>
          <tr>
            <td style="padding: 2px; border: 1px solid #ccc;">👑 Descarte VIP (Falla Lab)</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: center;">${estStock.descarteVipCant || 0} un.</td>
            <td style="padding: 2px; border: 1px solid #ccc; text-align: right;">$ ${Math.round(estStock.descarteVipValorUsd || 0).toLocaleString('es-AR')} USD</td>
          </tr>
        </table>
      `;
    }
    
    if (stkOpe && estStock.cargado) {
      html += `
        <div style="margin-top: 6px; font-size: 7.5pt; font-weight: bold;">[⚙️ INDICADORES OPERATIVOS - MATRIZ DE SUCURSAL]</div>
        <div style="font-size: 7pt; color: #444; margin-top: 2px;">• La vista operativa se encuentra resumida en los KPI estratégicos superiores por limitación de formato.</div>
      `;
    }

    html += `</div>`;
  }

  if (recEst || recTac || recOpe) {
    html += `<div style="margin-bottom: 12px;"><div style="font-weight: bold; background: #000; color: #fff; padding: 2px 5px; font-size: 8.5pt;">=== 2. MÓDULO RECUPERO Y LABORATORIO ===</div>`;

    if (recEst && estRec.cargado) {
      html += `
        <div style="margin-top: 4px; font-size: 7.5pt; font-weight: bold;">[🏛️ INDICADORES ESTRATÉGICOS DE RECUPERO]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7.5pt;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 2px;">Total Ingresado en Período: <b>${estRec.totalRecibidos || 0} un.</b></td>
            <td style="padding: 2px;">Recuperados VIP (OK): <b>${estRec.enCirculacionVIP || 0} un.</b></td>
            <td style="padding: 2px; text-align: right;">Efectividad VIP: <b>${estRec.pctReaprovechamiento || 0}%</b></td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 2px;">Descarte VIP (Falla Lab): <b>${estRec.fueraCirculacionVIP || 0} un.</b></td>
            <td style="padding: 2px;">Descarte Obsoleto Directo: <b>${estRec.directoDescarteObs || 0} un.</b></td>
            <td style="padding: 2px; text-align: right;">Capital Recuperado: <b>$ ${Math.round(estRec.capitalTotal || 0).toLocaleString('es-AR')} USD</b></td>
          </tr>
        </table>
      `;
    }

    if (recTac && estRec.cargado) {
      let limitados = (estRec.itemsVipTesteadosHoy || []).slice(0, 30);
      let masEquipos = (estRec.itemsVipTesteadosHoy || []).length > 30 ? `<tr><td colspan="4" style="padding:3px; text-align:center; font-style:italic;">... Y ${(estRec.itemsVipTesteadosHoy.length - 30)} registros adicionales omitidos por formato ...</td></tr>` : '';

      let filasHistoricas = limitados.map(i => `
        <tr>
          <td style="padding: 2px; border: 1px solid #ccc;">${i.hora || '--:--'}</td>
          <td style="padding: 2px; border: 1px solid #ccc; font-weight: bold;">${i.sn}</td>
          <td style="padding: 2px; border: 1px solid #ccc;">${i.modelo}</td>
          <td style="padding: 2px; border: 1px solid #ccc; text-align: center;">${i.esAprobado ? 'CIRCULACIÓN' : 'DESCARTE'}</td>
        </tr>
      `).join('');

      html += `
        <div style="margin-top: 6px; font-size: 7.5pt; font-weight: bold;">[🎯 INDICADORES TÁCTICOS - DETALLE DE SERIES (${(estRec.itemsVipTesteadosHoy || []).length} un.)]</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 7pt; border: 1px solid #000;">
          <thead>
            <tr style="background: #f0f0f0; font-weight: bold;">
              <th style="padding: 2px; border: 1px solid #000; text-align: left;">FECHA/HORA</th>
              <th style="padding: 2px; border: 1px solid #000; text-align: left;">Nº SERIE (SN)</th>
              <th style="padding: 2px; border: 1px solid #000; text-align: left;">MODELO</th>
              <th style="padding: 2px; border: 1px solid #000; text-align: center;">VEREDICTO</th>
            </tr>
          </thead>
          <tbody>${filasHistoricas || '<tr><td colspan="4" style="padding: 3px; text-align: center;">Sin registros de laboratorio en este período.</td></tr>'}${masEquipos}</tbody>
        </table>
      `;
    }

    if (recOpe && estRec.cargado && !window.EstadoReporte.usarHistorico) {
       html += `
        <div style="margin-top: 6px; font-size: 7.5pt; font-weight: bold;">[⚙️ INDICADORES OPERATIVOS - DESGLOSE POR MODELOS]</div>
        <div style="font-size: 7pt; color: #444; margin-top: 2px;">• La vista de modelos se omite en reportes por rangos amplios por cuestiones de espacio.</div>
      `;
    }

    html += `</div>`;
  }

  html += `
      <div style="margin-top: 20px; border-top: 1px dashed #000; padding-top: 6px; font-size: 7pt; text-align: center; color: #333;">
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