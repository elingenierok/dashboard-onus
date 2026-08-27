// ====================================================
// CORE: NAVEGACIÓN Y EVENTOS DEL SISTEMA
// ====================================================

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const targetContent = document.getElementById(tabId);
  const targetBtn = document.getElementById(`btn-${tabId}`);

  if (targetContent) targetContent.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');

  setTimeout(() => {
    if ((tabId === 'tab-tendencias' || tabId === 'tendencias') && typeof cargarModuloTendencias === 'function') {
      cargarModuloTendencias();
    }
    if (tabId === 'tab-stock' && window.kpiChart && typeof window.kpiChart.resize === 'function') {
      window.kpiChart.resize();
    }
    if (tabId === 'tab-recupero' && window.recuperoChart && typeof window.recuperoChart.resize === 'function') {
      window.recuperoChart.resize();
    }
  }, 50);
}

function cambiarSucursalGlobal() {
  const selSuc = document.getElementById('sel-sucursal-global');
  if (selSuc) {
    window.SUCURSAL_FILTRO_ACTIVA = selSuc.value;
    arrancarCargaDeDatos();
  }
}

async function arrancarCargaDeDatos() {
  const btn = document.getElementById('btnReloadSupabase');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando...'; }

  await Promise.allSettled([
    typeof cargarStockModulo === 'function' ? cargarStockModulo() : Promise.resolve(),
    typeof cargarModuloRecupero === 'function' ? cargarModuloRecupero() : Promise.resolve(),
    typeof cargarModuloTendencias === 'function' ? cargarModuloTendencias() : Promise.resolve(),
    typeof cargarModuloAdmin === 'function' ? cargarModuloAdmin() : Promise.resolve(),
    typeof cargarCatalogoEquipos === 'function' ? cargarCatalogoEquipos() : Promise.resolve()
  ]);

  if (btn) { btn.textContent = '⚡ Actualizar Datos'; btn.disabled = false; }
}

window.addEventListener('DOMContentLoaded', () => {
  const btnReload = document.getElementById('btnReloadSupabase');
  if (btnReload) {
    btnReload.addEventListener('click', arrancarCargaDeDatos);
  }

  const formLogin = document.getElementById('login-form') || document.querySelector('#login-container form');
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      if (typeof window.iniciarSesion === 'function') window.iniciarSesion();
    });
  }

  const btnLogin = document.getElementById('btn-login') || document.getElementById('btn-ingresar');
  if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.iniciarSesion === 'function') window.iniciarSesion();
    });
  }

  if (typeof window.revisarSesionActiva === 'function') {
    window.revisarSesionActiva();
  }
});