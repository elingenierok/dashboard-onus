// ====================================================
// MÓDULO 2: INTERFAZ DE USUARIO Y GRÁFICOS DE RECUPERO
// ====================================================

let recuperoChartInstance = null;
let matrizTemporalidad = 'HISTORICO';
let matrizMetrica = 'TOTAL_TODOS';
let matrizFiltroCelda = null;
let matrizColOrden = 'fecha';
let matrizOrdenAsc = false;
let matrizDatosCombinados = [];
let matrizCatalogoGlobal = [];

const MATRIZ_SUCURSALES = ['OBE', 'ELDO', 'WND', 'SPD', 'ITU'];
const MATRIZ_ORIGENES = ['Técnico Reclamos', 'Personal Retiro', 'Sucursal / Mostrador', 'Otros'];

window.renderizarModuloRecuperoUI = function() {
  const est = window.EstadoRecupero;
  if (!est || !est.cargado) return;
  renderRecuperoEstrategico(est.enCirculacionVIP, est.fueraCirculacionVIP, est.probadosVIP, est.capitalTotal, est.pctReaprovechamiento);
};

function renderRecuperoEstrategico(circ, descVIP, probados, capital, pct) {
  const elCirc = document.getElementById('rec-val-circ');
  const elPctCirc = document.getElementById('rec-pct-circ');
  const elDesc = document.getElementById('rec-val-desc');
  const elPctDesc = document.getElementById('rec-pct-desc');
  const elTotal = document.getElementById('rec-val-total-un');
  const elDinero = document.getElementById('rec-val-dinero');

  if (elCirc) elCirc.textContent = `${circ.toLocaleString('es-AR')} un.`;
  if (elPctCirc) elPctCirc.textContent = `(${pct}%)`;

  const pctDesc = probados > 0 ? (100 - parseFloat(pct)).toFixed(1) : "0.0";
  if (elDesc) elDesc.textContent = `${descVIP.toLocaleString('es-AR')} un.`;
  if (elPctDesc) elPctDesc.textContent = `(${pctDesc}%)`;

  if (elTotal) elTotal.textContent = `${probados.toLocaleString('es-AR')} un. VIP`;
  if (elDinero) elDinero.textContent = `$ ${Math.round(capital).toLocaleString('es-AR')} USD`;

  const canvas = document.getElementById('recuperoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const chartData = {
    labels: ['Laboratorio VIP'],
    datasets: [
      { label: '🟢 En Circulación (Recuperadas)', data: [circ], backgroundColor: '#4ade80', borderRadius: 4 },
      { label: '🔴 Fuera de Circulación (Descarte VIP)', data: [descVIP], backgroundColor: '#f87171', borderRadius: 4 }
    ]
  };

  if (recuperoChartInstance) {
    recuperoChartInstance.data = chartData;
    recuperoChartInstance.update();
  } else {
    recuperoChartInstance = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } }, y: { stacked: true, display: false } }, plugins: { legend: { position: 'top', labels: { color: '#f8fafc', font: { weight: 'bold' } } } } }
    });
  }
}

function normalizarSucursalMatriz(rawSuc) {
  const norm = (rawSuc || '').toUpperCase().trim();
  if (norm.includes('ELD')) return 'ELDO';
  if (norm.includes('WAN') || norm.includes('WND')) return 'WND';
  if (norm.includes('PEDRO') || norm.includes('SPD') || norm.includes('SAN')) return 'SPD';
  if (norm.includes('ITU')) return 'ITU';
  return 'OBE';
}

function normalizarOrigenMatriz(txt) {
  const norm = (txt || '').toUpperCase();
  if (norm.includes('RECLAMO') || norm.includes('TECNICO')) return 'Técnico Reclamos';
  if (norm.includes('RETIRO') || norm.includes('PERSONAL')) return 'Personal Retiro';
  if (norm.includes('SUCURSAL') || norm.includes('MOSTRADOR') || norm.includes('DEVOLUCION')) return 'Sucursal / Mostrador';
  return 'Otros';
}

function esVIPMatriz(desc) {
  if (typeof window.obtenerInfoCatalogo === 'function' && matrizCatalogoGlobal.length > 0) {
    const descNorm = window.normalizar ? window.normalizar(desc) : (desc || '').toUpperCase();
    const info = window.obtenerInfoCatalogo(descNorm, matrizCatalogoGlobal);
    return info ? Boolean(info.esVIP || info.es_vip) : false;
  }
  return false;
}

function esDeFechaMatriz(fechaIso, modo) {
  if (modo === 'HISTORICO') return true;
  if (!fechaIso) return false;
  const f = new Date(fechaIso);
  if (isNaN(f.getTime())) return false;
  const hoy = new Date();
  if (modo === 'DIARIO') return f.toDateString() === hoy.toDateString();
  if (modo === 'SEMANAL') { const diffDias = (hoy - f) / (1000 * 60 * 60 * 24); return diffDias >= 0 && diffDias <= 7; }
  if (modo === 'MENSUAL') return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
  return true;
}

function coincideMetricaMatriz(r) {
  const cond = (r.condicion || '').toUpperCase();
  const vip = esVIPMatriz(r.descripcion || r.modelo || '');

  if (matrizMetrica === 'TOTAL_TODOS') return true;
  if (matrizMetrica === 'VIP_TOTAL') return vip;
  if (matrizMetrica === 'PENDIENTES') return cond === 'PENDIENTE' || cond === '';
  
  // Estos filtros exigen VIP para que cuadre exacto con la barra superior de 1500
  if (matrizMetrica === 'CIRCULACION') return vip && (cond.includes('CIRCULACI') || cond.includes('OK') || cond.includes('RECUPERADO'));
  if (matrizMetrica === 'DESCARTE') return vip && (cond.includes('DESCARTE') || cond.includes('FALLA'));
  return true;
}

window.renderizarResumenGestionUI = function(dataUnificada, catalogo) {
  matrizDatosCombinados = dataUnificada || [];
  window.matrizDatosCombinados = matrizDatosCombinados; // Exponer para auditoría
  if (catalogo) matrizCatalogoGlobal = catalogo;
  actualizarMatrizYDetalleUI();
};

window.setTemporalidad = function(temp, btn) {
  if (btn) { btn.parentElement.querySelectorAll('.btn-pill').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  matrizTemporalidad = temp; actualizarMatrizYDetalleUI();
};

window.setMetrica = function(met, btn) {
  if (btn) { btn.parentElement.querySelectorAll('.btn-pill').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  matrizMetrica = met; actualizarMatrizYDetalleUI();
};

window.ordenarTablaMatriz = function(columna) {
  if (matrizColOrden === columna) matrizOrdenAsc = !matrizOrdenAsc; else { matrizColOrden = columna; matrizOrdenAsc = true; }
  ['fecha', 'sn', 'modelo', 'origen', 'sucursal', 'estado', 'tecnico'].forEach(c => {
    const span = document.getElementById(`sort-icon-${c}`);
    if (span) { span.textContent = c === matrizColOrden ? (matrizOrdenAsc ? '▲' : '▼') : '↕'; span.style.color = c === matrizColOrden ? '#38bdf8' : '#94a3b8'; }
  });
  actualizarMatrizYDetalleUI();
};

window.seleccionarCeldaMatriz = function(origen, sucursal) {
  if (matrizFiltroCelda && matrizFiltroCelda.origen === origen && matrizFiltroCelda.sucursal === sucursal) matrizFiltroCelda = null;
  else matrizFiltroCelda = { origen, sucursal };
  actualizarMatrizYDetalleUI();
};

window.limpiarFiltroCelda = function() { matrizFiltroCelda = null; actualizarMatrizYDetalleUI(); };

function actualizarMatrizYDetalleUI() {
  const tbodyMatriz = document.getElementById('tbody-matriz-pivot');
  if (!tbodyMatriz) return;

  const matriz = {};
  MATRIZ_ORIGENES.forEach(o => { matriz[o] = {}; MATRIZ_SUCURSALES.forEach(s => matriz[o][s] = 0); });
  const totalesCol = {};
  MATRIZ_SUCURSALES.forEach(s => totalesCol[s] = 0);
  let granTotal = 0;

  const filtrados = matrizDatosCombinados.filter(r => {
    const fecha = r.fin_prueba || r.fecha_ingreso || r.created_at || r.fecha_cierre || r.fecha;
    return esDeFechaMatriz(fecha, matrizTemporalidad) && coincideMetricaMatriz(r);
  });

  filtrados.forEach(r => {
    const suc = normalizarSucursalMatriz(r.sucursal_id);
    const orig = normalizarOrigenMatriz(r.almacen_origen || r.origen);
    if (matriz[orig] && matriz[orig][suc] !== undefined) matriz[orig][suc]++;
  });

  let htmlMatriz = '';
  MATRIZ_ORIGENES.forEach(orig => {
    let totalFila = 0;
    htmlMatriz += `<tr style="background: #0f172a !important;">`;
    htmlMatriz += `<td class="col-origen" style="text-align: left; padding: 12px; font-weight: 700; color: #38bdf8 !important; background: #0f172a !important; border: 1px solid #1e293b !important; width: 220px;">${orig}</td>`;
    
    MATRIZ_SUCURSALES.forEach(suc => {
      const val = matriz[orig][suc] || 0;
      totalFila += val; totalesCol[suc] += val;
      const esActiva = matrizFiltroCelda && matrizFiltroCelda.origen === orig && matrizFiltroCelda.sucursal === suc;
      const bg = esActiva ? '#0369a1 !important' : '#0f172a !important';
      const border = esActiva ? '2px solid #38bdf8 !important' : '1px solid #1e293b !important';
      const color = val > 0 ? '#ffffff !important' : '#64748b !important';
      htmlMatriz += `<td class="val-celda ${esActiva ? 'celda-activa' : ''}" style="padding: 12px; text-align: center; font-weight: 800; font-size: 1.05rem; background: ${bg}; color: ${color}; border: ${border}; cursor: pointer;" onclick="seleccionarCeldaMatriz('${orig}', '${suc}')">${val}</td>`;
    });

    granTotal += totalFila;
    htmlMatriz += `<td class="val-celda" style="padding: 12px; text-align: center; font-weight: 800; font-size: 1.05rem; background: #0f172a !important; color: #38bdf8 !important; border: 1px solid #1e293b !important;">${totalFila}</td></tr>`;
  });

  htmlMatriz += `<tr class="fila-total" style="background: #0f172a !important; font-weight: 800;">`;
  htmlMatriz += `<td style="text-align: left; padding: 12px; color: #4ade80 !important; font-size: 1.1rem; border: 1px solid #1e293b !important; border-top: 2px solid #0284c7 !important; background: #0f172a !important;">TOTALES</td>`;
  MATRIZ_SUCURSALES.forEach(suc => { htmlMatriz += `<td style="padding: 12px; text-align: center; color: #4ade80 !important; font-size: 1.1rem; border: 1px solid #1e293b !important; border-top: 2px solid #0284c7 !important; background: #0f172a !important;">${totalesCol[suc]}</td>`; });
  htmlMatriz += `<td style="padding: 12px; text-align: center; background: #0284c7 !important; color: #ffffff !important; font-size: 1.15rem; font-weight: 900; border: 1px solid #0284c7 !important;">${granTotal}</td></tr>`;
  
  tbodyMatriz.innerHTML = htmlMatriz;
  renderDetalleYTecnicosUI(filtrados);
}

function renderDetalleYTecnicosUI(itemsBase) {
  const tbodySN = document.getElementById('tbody-detalle-sn');
  const lblTitulo = document.getElementById('lbl-titulo-detalle');
  let listaVisual = [...itemsBase];

  if (matrizFiltroCelda) {
    lblTitulo.textContent = `📋 Detalle: ${matrizFiltroCelda.origen} ➔ [${matrizFiltroCelda.sucursal}]`;
    listaVisual = listaVisual.filter(r => normalizarSucursalMatriz(r.sucursal_id) === matrizFiltroCelda.sucursal && normalizarOrigenMatriz(r.almacen_origen || r.origen) === matrizFiltroCelda.origen);
  } else {
    lblTitulo.textContent = `📋 Listado Completo del Filtro (${listaVisual.length} equipos)`;
  }

  listaVisual.sort((a, b) => {
    let valA = '', valB = '';
    if (matrizColOrden === 'fecha') {
      valA = new Date(a.fin_prueba || a.fecha_ingreso || a.created_at || a.fecha_cierre || 0).getTime();
      valB = new Date(b.fin_prueba || b.fecha_ingreso || b.created_at || b.fecha_cierre || 0).getTime();
    } else if (matrizColOrden === 'sn') { valA = (a.sn || '').toUpperCase(); valB = (b.sn || '').toUpperCase(); }
    else if (matrizColOrden === 'modelo') { valA = (a.descripcion || a.modelo || '').toUpperCase(); valB = (b.descripcion || b.modelo || '').toUpperCase(); }
    else if (matrizColOrden === 'origen') { valA = normalizarOrigenMatriz(a.almacen_origen || a.origen); valB = normalizarOrigenMatriz(b.almacen_origen || b.origen); }
    else if (matrizColOrden === 'sucursal') { valA = normalizarSucursalMatriz(a.sucursal_id); valB = normalizarSucursalMatriz(b.sucursal_id); }
    else if (matrizColOrden === 'estado') { valA = (a.condicion || 'PENDIENTE').toUpperCase(); valB = (b.condicion || 'PENDIENTE').toUpperCase(); }
    else if (matrizColOrden === 'tecnico') { valA = (a.tecnico_prueba || '').toUpperCase(); valB = (b.tecnico_prueba || '').toUpperCase(); }

    if (valA < valB) return matrizOrdenAsc ? -1 : 1;
    if (valA > valB) return matrizOrdenAsc ? 1 : -1;
    return 0;
  });

  if (listaVisual.length === 0) {
    tbodySN.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 15px; background: #0f172a;">Sin equipos registrados para este filtro.</td></tr>`;
  } else {
    tbodySN.innerHTML = listaVisual.map(r => {
      const fechaRaw = r.fin_prueba || r.fecha_ingreso || r.created_at || r.fecha_cierre || '';
      const fecha = fechaRaw ? fechaRaw.split('T')[0] : '--/--/----';
      const cond = (r.condicion || 'PENDIENTE').toUpperCase();
      let colorCond = cond.includes('CIRCULACI') || cond.includes('OK') ? '#4ade80' : cond.includes('DESCARTE') || cond.includes('FALLA') ? '#f87171' : '#fde047';
      const tecPrueba = r.tecnico_prueba || 'Sin Registro (Histórico)';
      const sucFormateada = normalizarSucursalMatriz(r.sucursal_id);
      const origenFormateado = normalizarOrigenMatriz(r.almacen_origen || r.origen);

      // Etiqueta destacada azul para Sucursal
      return `<tr style="background: #0f172a;">
        <td style="color: #cbd5e1; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${fecha}</td>
        <td style="padding: 8px 6px; border-bottom: 1px solid #1e293b;"><span class="code-sn" style="font-size: 0.78rem; padding: 2px 6px;">${r.sn || 'SIN SN'}</span></td>
        <td style="color: #f8fafc; font-weight: 600; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${r.descripcion || r.modelo || '-'}</td>
        <td style="color: #38bdf8; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${origenFormateado}</td>
        <td style="padding: 8px 6px; border-bottom: 1px solid #1e293b; text-align: center;">
          <span style="color: #38bdf8; background: #1e293b; border: 1px solid #0284c7; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 0.75rem; display: inline-block;">${sucFormateada}</span>
        </td>
        <td style="padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;"><span style="color: ${colorCond}; font-weight: bold;">${cond}</span></td>
        <td style="color: #94a3b8; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${tecPrueba}</td>
      </tr>`;
    }).join('');
  }

  const tbodyTec = document.getElementById('tbody-tecnicos');
  const lblTituloTec = document.getElementById('lbl-titulo-tecnicos');
  if (!tbodyTec) return;

  lblTituloTec.textContent = matrizFiltroCelda 
    ? `👨‍🔧 Rendimiento: ${matrizFiltroCelda.origen} ➔ [${matrizFiltroCelda.sucursal}]`
    : `👨‍🔧 Rendimiento por Técnico de Prueba (Filtro Activo)`;

  const mapaTecnicos = {};
  listaVisual.forEach(r => {
    const cond = (r.condicion || 'PENDIENTE').toUpperCase();
    const esProbado = cond.includes('CIRCULACI') || cond.includes('OK') || cond.includes('RECUPERADO') || cond.includes('DESCARTE') || cond.includes('FALLA');
    let tecNombre = (r.tecnico_prueba && r.tecnico_prueba.trim() !== '') ? r.tecnico_prueba.trim() : (esProbado ? 'Histórico / Sin Registro de Prueba' : 'Pendientes de Prueba');
    if (!mapaTecnicos[tecNombre]) mapaTecnicos[tecNombre] = { total: 0, circ: 0, desc: 0, pend: 0 };
    mapaTecnicos[tecNombre].total++;
    if (cond.includes('CIRCULACI') || cond.includes('OK') || cond.includes('RECUPERADO')) mapaTecnicos[tecNombre].circ++;
    else if (cond.includes('DESCARTE') || cond.includes('FALLA')) mapaTecnicos[tecNombre].desc++;
    else mapaTecnicos[tecNombre].pend++;
  });

  const listaTecnicos = Object.entries(mapaTecnicos).sort((a, b) => b[1].total - a[1].total);

  if (listaTecnicos.length === 0) {
    tbodyTec.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 15px; background: #0f172a;">Sin registros para los técnicos en este filtro.</td></tr>`;
  } else {
    tbodyTec.innerHTML = listaTecnicos.map(([nombre, c]) => {
      const probados = c.circ + c.desc;
      const pctEfectividad = probados > 0 ? ((c.circ / probados) * 100).toFixed(1) : '0.0';
      return `<tr style="background: #0f172a;">
        <td style="color: #f8fafc; font-weight: 700; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">👤 ${nombre}</td>
        <td style="text-align: center; font-weight: bold; color: #38bdf8; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${c.total} un.</td>
        <td style="text-align: center; font-weight: bold; color: #4ade80; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${c.circ} un.</td>
        <td style="text-align: center; font-weight: bold; color: #f87171; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${c.desc} un.</td>
        <td style="text-align: center; font-weight: bold; color: #fde047; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${c.pend} un.</td>
        <td style="text-align: center; font-weight: bold; color: #38bdf8; padding: 8px 6px; border-bottom: 1px solid #1e293b; font-size: 0.78rem;">${pctEfectividad}%</td>
      </tr>`;
    }).join('');
  }
}