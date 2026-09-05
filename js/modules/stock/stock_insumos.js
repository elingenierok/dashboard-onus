// ====================================================
// MOTOR DINÁMICO DE INSUMOS CON UMBRALES DESDE BD
// ====================================================

let instanciasGraficosB = [];

// ¡IMPORTANTE! Se recibe configUmbrales como 5to parámetro
window.procesarInsumosB = function(stockData, sucActiva, mapaPrecios, catalogoInsumos, configUmbrales) {
  const catalogo = catalogoInsumos || window.catalogoInsumosMemoria || [];
  const umbrales = configUmbrales || window.configUmbralesMemoria || [];
  const gruposGenerados = {}; 

  const cleanStr = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

  // 1. DIBUJAR TARJETAS Y VINCULAR UMBRALES DESDE config_stock_almacen
  (catalogo || []).forEach(c => {
    const catAbc = String(c.categoria_abc || '').toUpperCase().trim();
    const esGrafico = c.en_grafico === true || String(c.en_grafico).toLowerCase() === 'true' || c.en_grafico === 1;

    if (catAbc === 'B' && esGrafico) {
      const nombreGrupo = (c.grupo_grafico || 'GENERAL').toUpperCase().trim();
      
      if (!gruposGenerados[nombreGrupo]) {
        gruposGenerados[nombreGrupo] = { 
          cantidadTotal: 0, 
          costoTotalUsd: 0, 
          stockMinimoTotal: 0,
          puntoPedidoTotal: 0,
          desglose: {} 
        };
      }
      gruposGenerados[nombreGrupo].desglose[c.descripcion.trim()] = 0;

      // Buscar configuración de stock mínimo/punto de pedido en config_stock_almacen
      const codUpper = (c.codigo || '').trim().toUpperCase();
      
      const confItem = umbrales.find(u => {
        const uCod = (u.codigo || '').trim().toUpperCase();
        const matchCod = uCod === codUpper;
        
        // Match con el Almacén Activo (Ej: OBE coincide con OBE_ALM_PRINCIPAL)
        const matchSuc = typeof window.perteneceASucursal === 'function'
          ? window.perteneceASucursal(u.almacen_key, sucActiva)
          : u.almacen_key.includes(sucActiva || 'TODAS');
          
        return matchCod && matchSuc;
      });

      // Si existe configuración para esta sucursal, la sumamos al total del grupo gráfico
      if (confItem) {
        gruposGenerados[nombreGrupo].stockMinimoTotal += parseInt(confItem.stock_minimo, 10) || 0;
        gruposGenerados[nombreGrupo].puntoPedidoTotal += parseInt(confItem.punto_pedido, 10) || 0;
      }
    }
  });

  // 2. SUMAR STOCK REAL
  (stockData || []).forEach(row => {
    const almUpper = String(row.almacen || '').toUpperCase();
    
    if (almUpper.includes('MOV') || almUpper.includes('3RO') || almUpper.includes('VEHICULO') || almUpper.includes('DESCARTE')) return;
    if (!almUpper.includes('PRINCIPAL') && !almUpper.includes('CATRIEL') && !almUpper.includes('DEVOLUCION') && !almUpper.includes('TRIAGE')) return;

    if (typeof window.perteneceASucursal === 'function' && !window.perteneceASucursal(row.almacen, sucActiva)) return;

    const cantNum = Number(row.stock_total) || Number(row.stock) || Number(row.cantidad) || 0;
    if (cantNum <= 0) return;

    const descRowLimpia = cleanStr(row.descripcion);
    const itemCat = catalogo.find(c => cleanStr(c.descripcion) === descRowLimpia);

    if (itemCat) {
      const catAbc = String(itemCat.categoria_abc || '').toUpperCase().trim();
      const esGrafico = itemCat.en_grafico === true || String(itemCat.en_grafico).toLowerCase() === 'true' || itemCat.en_grafico === 1;

      if (catAbc === 'B' && esGrafico) {
        const nombreGrupo = (itemCat.grupo_grafico || 'GENERAL').toUpperCase().trim();
        const nombreModelo = itemCat.descripcion.trim();
        const costoUnit = parseFloat(itemCat.precio_final) || 0;
        
        if (gruposGenerados[nombreGrupo]) {
          gruposGenerados[nombreGrupo].cantidadTotal += cantNum;
          gruposGenerados[nombreGrupo].costoTotalUsd += (cantNum * costoUnit);

          if (gruposGenerados[nombreGrupo].desglose[nombreModelo] === undefined) {
            gruposGenerados[nombreGrupo].desglose[nombreModelo] = 0;
          }
          gruposGenerados[nombreGrupo].desglose[nombreModelo] += cantNum;
        }
      }
    }
  });

  renderizarCalculadoraDinamica(gruposGenerados);
};

// ====================================================
// RENDERIZADO VISUAL
// ====================================================
function renderizarCalculadoraDinamica(grupos) {
  const contenedor = document.getElementById('contenedor-graficos-b');
  if (!contenedor) return;

  instanciasGraficosB.forEach(chart => chart.destroy());
  instanciasGraficosB = [];
  contenedor.innerHTML = '';

  contenedor.style.display = 'grid';
  contenedor.style.gridTemplateColumns = 'repeat(auto-fill, minmax(360px, 1fr))';
  contenedor.style.gap = '14px';

  const nombresGrupos = Object.keys(grupos).sort();

  if (nombresGrupos.length === 0) {
    contenedor.style.display = 'block';
    contenedor.innerHTML = `<div style="text-align:center; padding:16px; color:#64748b; border:1px dashed #334155; border-radius:8px; font-size:0.85rem;">ℹ️ No hay insumos Categoría B configurados en gráficos.</div>`;
    return;
  }

  const paletaColores = ['#0284c7', '#22c55e', '#a855f7', '#ea580c', '#eab308', '#06b6d4', '#ec4899', '#84cc16'];

  nombresGrupos.forEach((nombreGrupo, index) => {
    const dataGrupo = grupos[nombreGrupo];
    const total = dataGrupo.cantidadTotal;
    const minStock = dataGrupo.stockMinimoTotal;
    const puntoPed = dataGrupo.puntoPedidoTotal;
    const unidad = (nombreGrupo.includes('CABLE') || nombreGrupo.includes('DROP')) ? 'mts' : 'un.';

    // Evaluación de estado
    let colorEstado = '#0284c7'; // Azul Normal
    let tagEstado = '<span style="color:#4ade80; background:#064e3b; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:bold;">🟢 OK</span>';

    if (minStock > 0 || puntoPed > 0) {
      if (minStock > 0 && total <= minStock) {
        colorEstado = '#ef4444'; // Rojo Mínimo
        tagEstado = '<span style="color:#fca5a5; background:#7f1d1d; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:bold;">🔴 STOCK MÍNIMO</span>';
      } else if (puntoPed > 0 && total <= puntoPed) {
        colorEstado = '#eab308'; // Amarillo Punto Pedido
        tagEstado = '<span style="color:#fef08a; background:#713f12; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:bold;">🟡 PUNTO DE PEDIDO</span>';
      }
    }

    const idCanvasGauge = `canvas-gauge-${index}`;
    const idCanvasPie = `canvas-pie-${index}`;

    const tarjetaHtml = `
      <div style="background:#1e293b; border:1px solid #334155; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:10px; height:100%; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:6px; gap:8px;">
          <h3 style="font-size:0.88rem; color:#38bdf8; margin:0; font-weight:700; display:flex; align-items:center; gap:6px;">
            📡 ${nombreGrupo} ${tagEstado}
          </h3>
          <span style="background:#0f172a; border:1px solid #334155; padding:2px 8px; border-radius:12px; font-size:0.75rem; color:#cbd5e1;">
            <strong style="color:#4ade80;">$ ${Math.round(dataGrupo.costoTotalUsd).toLocaleString('es-AR')} USD</strong>
          </span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:center;">
          <div style="background:#0f172a; border:1px solid #334155; border-radius:6px; padding:8px; display:flex; flex-direction:column; align-items:center; position:relative;">
            <div style="display:flex; justify-content:space-between; width:100%; font-size:0.62rem; color:#94a3b8; font-weight:bold; margin-bottom:2px;">
              <span>STOCK ACTUAL</span>
              <span style="color:${minStock > 0 ? '#f87171' : (puntoPed > 0 ? '#eab308' : '#64748b')};">MÍN: ${minStock.toLocaleString('es-AR')}</span>
            </div>
            <div style="position:relative; width:100%; height:95px; display:flex; justify-content:center;">
              <canvas id="${idCanvasGauge}"></canvas>
              <div style="position:absolute; bottom:2px; text-align:center;">
                <span style="font-size:1.05rem; font-weight:800; color:#f8fafc;">${total.toLocaleString('es-AR')}</span>
                <span style="font-size:0.62rem; color:#38bdf8; display:block; font-weight:bold; line-height:1;">${unidad}</span>
              </div>
            </div>
          </div>

          <div style="background:#0f172a; border:1px solid #334155; border-radius:6px; padding:8px; display:flex; flex-direction:column; align-items:center;">
            <span style="font-size:0.65rem; color:#94a3b8; font-weight:bold; margin-bottom:2px; text-transform:uppercase;">DESGLOSE</span>
            <div style="position:relative; width:100%; height:95px;">
              <canvas id="${idCanvasPie}"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    const divBlock = document.createElement('div');
    divBlock.style.height = '100%';
    divBlock.innerHTML = tarjetaHtml;
    contenedor.appendChild(divBlock);

    // Escala del velocímetro
    // El máximo visible se calcula con el Punto de Pedido o el Total (lo que sea mayor)
    const maxEscalaCalculado = Math.max(puntoPed * 1.5, minStock * 1.8);
    const maxCapacidad = Math.max(total, maxEscalaCalculado, 10);

    const chartGauge = new Chart(document.getElementById(idCanvasGauge).getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Stock Mínimo', 'Zona Segura', 'Nivel Actual', 'Restante'],
        datasets: [
          {
            // Anillo Exterior: Marca Roja Fina indicando hasta dónde es Stock Mínimo
            data: [minStock, Math.max(0, maxCapacidad - minStock)],
            backgroundColor: ['rgba(239, 68, 68, 0.75)', 'rgba(51, 65, 85, 0.25)'],
            borderWidth: 0,
            weight: 0.25
          },
          {
            // Anillo Interior: Nivel Real con color dinámico
            data: [total, Math.max(0, maxCapacidad - total)],
            backgroundColor: [colorEstado, '#0f172a'],
            borderWidth: 1,
            borderColor: '#0f172a',
            weight: 1
          }
        ]
      },
      options: {
        rotation: -90,
        circumference: 180,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });

    const chartPie = new Chart(document.getElementById(idCanvasPie).getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(dataGrupo.desglose),
        datasets: [{
          data: Object.values(dataGrupo.desglose),
          backgroundColor: paletaColores.slice(0, Object.keys(dataGrupo.desglose).length),
          borderWidth: 1,
          borderColor: '#0f172a'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 8 }, boxWidth: 8, padding: 4 } }
        }
      }
    });

    instanciasGraficosB.push(chartGauge, chartPie);
  });
}