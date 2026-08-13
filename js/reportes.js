// ====================================================
// MÓDULO AUTÓNOMO: GENERACIÓN DE INFORMES Y PDF (KPIs)
// ====================================================

const SUPABASE_URL_REP = 'https://ovluxdezwvuonlwnymna.supabase.co';
const SUPABASE_KEY_REP = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const supabaseReportes = supabase.createClient(SUPABASE_URL_REP, SUPABASE_KEY_REP);

function normalizarTextoRep(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function descargarReporteKPIPDF() {
  const btnPdf = document.querySelector('.btn-pdf');
  const txtOriginal = btnPdf ? btnPdf.textContent : '';
  if (btnPdf) {
    btnPdf.disabled = true;
    btnPdf.textContent = '⏳ Generando PDF...';
  }

  try {
    const usuario = document.getElementById('user-badge')?.textContent || 'Operador';
    const fechaHora = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // 1. Obtener valores generales de Stock (de los contadores del header)
    const valDbStr = document.getElementById('val-db')?.textContent || '0';
    const valCatvStr = document.getElementById('val-catv')?.textContent || '0';
    const valTotal = document.getElementById('val-total')?.textContent || '0 un.';
    const valCosto = document.getElementById('val-costo')?.textContent || '$0 USD';

    const numDb = parseInt(valDbStr.replace(/[^0-9]/g, ''), 10) || 0;
    const numCatv = parseInt(valCatvStr.replace(/[^0-9]/g, ''), 10) || 0;

    let numNuevos = 0;
    let numUsados = 0;
    document.querySelectorAll('.kpi-card-dark, .kpi-card').forEach(card => {
      const txt = card.textContent.toUpperCase();
      if (txt.includes('NUEVO')) {
        const match = card.querySelector('.value')?.textContent.replace(/[^0-9]/g, '');
        if (match) numNuevos = parseInt(match, 10) || numNuevos;
      }
      if (txt.includes('USADO')) {
        const match = card.querySelector('.value')?.textContent.replace(/[^0-9]/g, '');
        if (match) numUsados = parseInt(match, 10) || numUsados;
      }
    });

    // 2. CONSULTA PURA Y DIRECTA A SUPABASE (IGUAL A JS/STOCK.JS)
    // A. Buscar última fecha en registro_stock
    const { data: ultData } = await supabaseReportes
      .from('registro_stock')
      .select('fecha_registro')
      .order('fecha_registro', { ascending: false })
      .limit(1);

    let dataStockDev = [];
    let dataCatalogo = [];

    if (ultData && ultData.length > 0) {
      const ultimaFecha = ultData[0].fecha_registro;

      // B. Consultar el stock real de OBE_ALM_DEVOLUCIONES para esa fecha + catalogo
      const [resDev, resCat] = await Promise.all([
        supabaseReportes
          .from('registro_stock')
          .select('descripcion, stock_total')
          .eq('fecha_registro', ultimaFecha)
          .eq('almacen', 'OBE_ALM_DEVOLUCIONES'),
        supabaseReportes
          .from('catalogo_equipos')
          .select('*')
      ]);

      dataStockDev = resDev.data || [];
      dataCatalogo = resCat.data || [];
    }

    // C. Agrupar por modelo exactamente igual que stock.js
    const itemsDevMap = {};
    dataStockDev.forEach(row => {
      const desc = (row.descripcion || '').trim();
      const descNorm = normalizarTextoRep(desc);
      const stock = parseInt(row.stock_total, 10) || 0;

      if (descNorm.includes('ONU') && stock > 0) {
        itemsDevMap[desc] = (itemsDevMap[desc] || 0) + stock;
      }
    });

    // D. Clasificar VIP u Obsoleto leyendo catalogo_equipos
    const listaEquiposTriage = Object.keys(itemsDevMap).map(modelo => {
      const normMod = normalizarTextoRep(modelo);
      const matchCat = dataCatalogo.find(c => {
        const normCat = c.modelo_norm || normalizarTextoRep(c.modelo);
        return normMod.includes(normCat) || normCat.includes(normMod);
      });

      return {
        modelo: modelo,
        cantidad: itemsDevMap[modelo],
        esVip: matchCat ? Boolean(matchCat.es_vip) : false
      };
    });

    // E. Ordenar: Todos los VIP arriba
    listaEquiposTriage.sort((a, b) => (b.esVip === a.esVip ? 0 : b.esVip ? 1 : -1));

    let filasDevolucionesHtml = '';
    if (listaEquiposTriage.length === 0) {
      filasDevolucionesHtml = `
        <tr>
          <td colspan="3" style="border: 1px solid #ccc; padding: 4px; text-align: center; color: #666;">
            Sin equipos registrados en el depósito de devoluciones.
          </td>
        </tr>`;
    } else {
      listaEquiposTriage.forEach(item => {
        filasDevolucionesHtml += `
          <tr>
            <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: left;">${item.modelo}</td>
            <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: center; font-weight: bold;">${item.esVip ? '🔵 VIP' : '⚙️ Obsoleto'}</td>
            <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${item.cantidad} un.</td>
          </tr>
        `;
      });
    }

    // 3. Extraer filas de Exactitud de Registro (Auditoría de Stock de almacenes)
    let filasAuditoriaHtml = '';
    const filasAuditoriaDOM = document.querySelectorAll('#tablaAuditoriaWrapper table tbody tr');

    if (filasAuditoriaDOM && filasAuditoriaDOM.length > 0) {
      filasAuditoriaDOM.forEach(tr => {
        const cols = tr.querySelectorAll('td');
        if (cols.length >= 5) {
          const alm = cols[0]?.textContent.trim() || '-';
          const sis = cols[1]?.textContent.trim() || '0 un.';
          const fis = cols[2]?.textContent.trim() || '0 un.';
          const des = cols[3]?.textContent.trim() || 'Exacto (0)';
          const pct = cols[4]?.textContent.trim() || '0.0%';
          const ult = cols[5]?.textContent.trim() || 'Al día';

          filasAuditoriaHtml += `
            <tr>
              <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: left;">${alm}</td>
              <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right;">${sis}</td>
              <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${fis}</td>
              <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: center;">${des} (${pct})</td>
              <td style="border: 1px solid #ccc; padding: 2px 5px; text-align: center; color: #333;">${ult}</td>
            </tr>
          `;
        }
      });
    }

    // 4. Métricas de Recupero
    const recCirc = document.getElementById('rec-val-circ')?.textContent || '0 un.';
    const recDesc = document.getElementById('rec-val-desc')?.textContent || '0 un.';
    const recTotal = document.getElementById('rec-val-total-un')?.textContent || '0 un.';
    const recDinero = document.getElementById('rec-val-dinero')?.textContent || '$0 USD';

    // Helper vectorial SVG para gráficos de dona
    function generarSvgDona(v1, v2, color1, color2, label1, label2) {
      const tot = (v1 + v2) || 1;
      const p1 = v1 / tot;
      const p2 = v2 / tot;
      const r = 16;
      const c = 2 * Math.PI * r;
      const dash1 = (p1 * c).toFixed(1);
      const dash2 = (p2 * c).toFixed(1);
      const offset2 = (-p1 * c).toFixed(1);
      const pct1 = Math.round(p1 * 100);
      const pct2 = Math.round(p2 * 100);

      return `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Consolas', monospace; font-size: 6.5pt;">
          <svg width="55" height="55" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="${r}" fill="none" stroke="#eee" stroke-width="8" />
            <circle cx="25" cy="25" r="${r}" fill="none" stroke="${color1}" stroke-width="8"
                    stroke-dasharray="${dash1} ${c.toFixed(1)}" stroke-dashoffset="0"
                    transform="rotate(-90 25 25)" />
            <circle cx="25" cy="25" r="${r}" fill="none" stroke="${color2}" stroke-width="8"
                    stroke-dasharray="${dash2} ${c.toFixed(1)}" stroke-dashoffset="${offset2}"
                    transform="rotate(-90 25 25)" />
          </svg>
          <div style="margin-top: 2px; text-align: left; line-height: 1.2;">
            <div><span style="display:inline-block; width:6px; height:6px; background:${color1}; margin-right:3px;"></span>${label1}: <b>${pct1}%</b></div>
            <div><span style="display:inline-block; width:6px; height:6px; background:${color2}; margin-right:3px;"></span>${label2}: <b>${pct2}%</b></div>
          </div>
        </div>
      `;
    }

    const donaTecno = generarSvgDona(numDb, numCatv, '#000000', '#888888', 'DB', 'CATV');
    const donaCondi = generarSvgDona(numNuevos, numUsados, '#111111', '#aaaaaa', 'NUEVO', 'USADO');

    const pdfTemplate = `
      <div style="font-family: 'Consolas', 'Courier New', monospace; padding: 16px; color: #000; background: #fff; width: 100%; box-sizing: border-box; line-height: 1.25;">
        
        <!-- ENCABEZADO MONOESPACIADO -->
        <div style="border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">[ INFORME RESUMEN KPI - LOGISTICA ISP ]</div>
            <div style="font-size: 7.5pt; color: #333;">SISTEMA DE CONTROL DE SUMINISTROS Y LABORATORIO</div>
          </div>
          <div style="text-align: right; font-size: 7pt;">
            FECHA: ${fechaHora}<br>
            EMISOR: ${usuario.replace('👤', '').trim()}
          </div>
        </div>

        <!-- SECCIÓN 1: STOCK OPERATIVO -->
        <div style="margin-bottom: 12px;">
          <div style="font-size: 8.5pt; font-weight: bold; background: #eee; padding: 3px 6px; border: 1px solid #000; margin-bottom: 6px;">
            1. ESTADO GENERAL DE STOCK OPERATIVO
          </div>

          <div style="font-size: 7pt; font-weight: bold; margin-bottom: 3px; text-transform: uppercase;">
            📊 RESUMEN GENERAL Y DISTRIBUCIÓN POR TECNOLOGÍA:
          </div>

          <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <!-- TABLA RESUMEN -->
            <table style="flex: 1.2; border-collapse: collapse; font-size: 7pt;">
              <thead>
                <tr style="background: #f0f0f0;">
                  <th style="border: 1px solid #000; padding: 3px 5px; text-align: left;">CONCEPTO</th>
                  <th style="border: 1px solid #000; padding: 3px 5px; text-align: right;">CANTIDAD / VALOR</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style="border: 1px solid #ccc; padding: 2px 5px;">ONUs Dual Band (Wi-Fi 6)</td><td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${valDbStr}</td></tr>
                <tr><td style="border: 1px solid #ccc; padding: 2px 5px;">ONUs CATV (EG8147X6 / F6600R)</td><td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${valCatvStr}</td></tr>
                <tr><td style="border: 1px solid #ccc; padding: 2px 5px;">Total Stock Operativo en Red</td><td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${valTotal}</td></tr>
                <tr><td style="border: 1px solid #ccc; padding: 2px 5px;">Valorización Real Total (USD)</td><td style="border: 1px solid #ccc; padding: 2px 5px; text-align: right; font-weight: bold;">${valCosto}</td></tr>
              </tbody>
            </table>

            <!-- DONAS VECTORIALES -->
            <div style="flex: 0.8; display: flex; justify-style: space-around; align-items: center; border: 1px solid #000; padding: 4px; background: #fafafa;">
              <div style="text-align: center;">
                <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2px; text-transform: uppercase;">TECNOLOGÍA VIP</div>
                ${donaTecno}
              </div>
              <div style="border-left: 1px dashed #ccc; height: 60px; margin: 0 4px;"></div>
              <div style="text-align: center;">
                <div style="font-size: 6pt; font-weight: bold; margin-bottom: 2px; text-transform: uppercase;">CONDICIÓN</div>
                ${donaCondi}
              </div>
            </div>
          </div>

          <!-- TABLA DEVOLUCIONES / A PROBAR -->
          <div style="font-size: 7pt; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; color: #111;">
            📥 DETALLE DE EQUIPOS EN DEPÓSITO DEVOLUCIONES (A PROBAR / TRIAGE):
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 6.5pt; margin-bottom: 8px;">
            <thead>
              <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: left;">MODELO DE EQUIPO</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: center;">CLASIFICACIÓN</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: right;">CANTIDAD PENDIENTE</th>
              </tr>
            </thead>
            <tbody>
              ${filasDevolucionesHtml}
            </tbody>
          </table>

          <!-- TABLA AUDITORÍA -->
          <div style="font-size: 7pt; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; color: #111;">
            📋 CONTROL DE EXACTITUD DE REGISTRO (SISTEMA VS. FÍSICO REAL):
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 6.5pt;">
            <thead>
              <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: left;">ALMACÉN / DEPÓSITO</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: right;">SISTEMA</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: right;">FÍSICO REAL</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: center;">DETALLE DESVIACIÓN</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: center;">ÚLTIMA INSPECCIÓN</th>
              </tr>
            </thead>
            <tbody>
              ${filasAuditoriaHtml}
            </tbody>
          </table>
        </div>

        <!-- SECCIÓN 2: RECUPERO -->
        <div style="margin-bottom: 10px;">
          <div style="font-size: 8.5pt; font-weight: bold; background: #eee; padding: 3px 6px; border: 1px solid #000; margin-bottom: 6px;">
            2. EFICIENCIA DE RECUPERO Y LABORATORIO
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 7pt;">
            <thead>
              <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: left;">METRICA DE LABORATORIO</th>
                <th style="border: 1px solid #000; padding: 2px 4px; text-align: right;">VALOR REGISTRADO</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="border: 1px solid #ccc; padding: 2px 4px;">Total Equipos Recibidos en Mesa</td><td style="border: 1px solid #ccc; padding: 2px 4px; text-align: right; font-weight: bold;">${recTotal}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 2px 4px;">Equipos VIP Recuperados (Circulación)</td><td style="border: 1px solid #ccc; padding: 2px 4px; text-align: right; font-weight: bold;">${recCirc}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 2px 4px;">Equipos Descartados (Fuera de Circulación)</td><td style="border: 1px solid #ccc; padding: 2px 4px; text-align: right; font-weight: bold;">${recDesc}</td></tr>
              <tr><td style="border: 1px solid #ccc; padding: 2px 4px;">Capital Revalorizado Recuperado</td><td style="border: 1px solid #ccc; padding: 2px 4px; text-align: right; font-weight: bold;">${recDinero}</td></tr>
            </tbody>
          </table>
        </div>

        <!-- PIE DE PÁGINA LIMPIO -->
        <div style="font-size: 6.5pt; color: #444; border-top: 1px dashed #000; padding-top: 4px; text-align: center; margin-top: 12px;">
          === REGISTRO SISTÉMICO GENERADO AUTOMÁTICAMENTE - FIN DEL INFORME ===
        </div>
      </div>
    `;

    const contenedorTemp = document.createElement('div');
    contenedorTemp.innerHTML = pdfTemplate;
    document.body.appendChild(contenedorTemp);

    const opciones = {
      margin:       5,
      filename:     `Informe_KPI_ISP_${new Date().toISOString().split('T')[0]}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opciones).from(contenedorTemp).save();
    document.body.removeChild(contenedorTemp);

  } catch (err) {
    console.error('Error al generar PDF de KPI:', err);
    alert('❌ Ocurrió un error al generar el PDF. Revisa la consola.');
  } finally {
    if (btnPdf) {
      btnPdf.disabled = false;
      btnPdf.textContent = txtOriginal;
    }
  }
}