// ====================================================
// MÓDULO 3: AUDITORÍA Y VALIDACIÓN DE LOTES DE TÉCNICOS
// ====================================================

let auditTemporalidad = 'HISTORICO';
let auditMetrica = 'TOTAL_TODOS';

function normalizarTextoAudit(txt) {
  return (txt || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

window.setAuditTemporalidad = function(temp, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  auditTemporalidad = temp;
};

window.setAuditMetrica = function(met, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  auditMetrica = met;
};

window.ejecutarAuditoriaLote = function() {
  const inputTecnico = document.getElementById('txt-tecnico-audit');
  const inputSNs = document.getElementById('txt-sns-audit');
  const panelResultados = document.getElementById('panel-resultados-audit');

  if (!inputSNs || !panelResultados) return;

  const rawTecnico = inputTecnico ? inputTecnico.value.trim() : '';
  const normTecnico = normalizarTextoAudit(rawTecnico);
  const rawText = inputSNs.value || '';

  // 1. Extraer SNs limpiando comas, espacios y saltos de línea
  const listaSNs = rawText
    .split(/[\n\r,;\s]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);

  if (listaSNs.length === 0) {
    alert('Por favor, pegá al menos un Número de Serie (SN) para auditar.');
    return;
  }

  // 2. Obtener la base unificada de la memoria
  const baseDatos = window.matrizDatosCombinados || [];

  // Mapa rápido de búsqueda por SN
  const mapaBD = new Map();
  baseDatos.forEach(r => {
    const key = (r.sn || '').toString().trim().toUpperCase();
    if (key) mapaBD.set(key, r);
  });

  let countVerificados = 0;
  let countAnomalias = 0;
  const listaAnomalias = [];

  // 3. Cruzar cada SN ingresado
  listaSNs.forEach(sn => {
    const registro = mapaBD.get(sn);

    if (!registro) {
      // 👻 CASO 1: No existe en la base de datos
      countAnomalias++;
      listaAnomalias.push({
        sn,
        diagnostico: '👻 FANTASMA (No existe en la BD)',
        badgeBg: '#7f1d1d', badgeColor: '#fca5a5',
        tecReal: '--',
        estadoReal: '--'
      });
      return;
    }

    const cond = (registro.condicion || 'PENDIENTE').toUpperCase();
    const tecPruebaReal = registro.tecnico_prueba || registro.tecnico || '';
    const normTecReal = normalizarTextoAudit(tecPruebaReal);

    const esPendiente = cond === 'PENDIENTE' || cond === '';
    const esAprobado = cond.includes('CIRCULACI') || cond.includes('OK') || cond.includes('RECUPERADO');
    const esDescarte = cond.includes('DESCARTE') || cond.includes('FALLA');

    if (esPendiente) {
      // ⏳ CASO 2: Está en la base pero no fue probado
      countAnomalias++;
      listaAnomalias.push({
        sn,
        diagnostico: '⏳ FALSO RECUPERO (Sigue Pendiente)',
        badgeBg: '#713f12', badgeColor: '#fde047',
        tecReal: 'Sin probar',
        estadoReal: cond
      });
    } else if (normTecnico !== '' && normTecReal !== '' && !normTecReal.includes(normTecnico) && !normTecnico.includes(normTecReal)) {
      // ⚠️ CASO 3: Lo probó otro técnico
      countAnomalias++;
      listaAnomalias.push({
        sn,
        diagnostico: '⚠️ AUTORÍA FALSA (Probado por otro)',
        badgeBg: '#9a3412', badgeColor: '#fdba74',
        tecReal: tecPruebaReal || 'Otro Operador',
        estadoReal: cond
      });
    } else {
      // 🟢 CASO 4: Coincidencia Exitosa
      countVerificados++;
    }
  });

  // 4. Renderizar Métricas y Tabla de Resultados
  document.getElementById('kpi-audit-total').textContent = `${listaSNs.length} un.`;
  document.getElementById('kpi-audit-ok').textContent = `${countVerificados} un.`;
  document.getElementById('kpi-audit-err').textContent = `${countAnomalias} un.`;

  const tbody = document.getElementById('tbody-audit-anomalias');
  if (tbody) {
    if (listaAnomalias.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #4ade80; padding: 15px; background: #0f172a; font-weight: bold;">
        ✅ ¡Lote 100% Verificado! No se detectaron inconsistencias ni registros falsos.
      </td></tr>`;
    } else {
      tbody.innerHTML = listaAnomalias.map(item => `
        <tr style="background: #0f172a;">
          <td style="color: #38bdf8; font-family: monospace; font-weight: bold; padding: 10px; border-bottom: 1px solid #1e293b;">${item.sn}</td>
          <td style="padding: 10px; border-bottom: 1px solid #1e293b;">
            <span style="background: ${item.badgeBg}; color: ${item.badgeColor}; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; display: inline-block;">
              ${item.diagnostico}
            </span>
          </td>
          <td style="color: #cbd5e1; padding: 10px; border-bottom: 1px solid #1e293b;">${item.tecReal}</td>
          <td style="color: #f8fafc; font-weight: bold; padding: 10px; border-bottom: 1px solid #1e293b;">${item.estadoReal}</td>
        </tr>
      `).join('');
    }
  }

  panelResultados.style.display = 'block';
  panelResultados.scrollIntoView({ behavior: 'smooth' });
};