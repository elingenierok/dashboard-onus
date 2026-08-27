// ====================================================
// CORE: NAVEGACIÓN, ORQUESTACIÓN DE DATOS Y EVENTOS
// ====================================================

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const targetContent = document.getElementById(tabId);
  const targetBtn = document.getElementById(`btn-${tabId}`);

  if (targetContent) targetContent.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');
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
    // ⬇️ RECARGA AUTOMÁTICA DEL DESPLEGABLE EN CADA CAMBIO DE SUCURSAL ⬇️
    typeof cargarCatalogoEquipos === 'function' ? cargarCatalogoEquipos() : Promise.resolve()
  ]);

  if (btn) { btn.textContent = '⚡ Actualizar Datos'; btn.disabled = false; }
}

// ESCUCHA DE EVENTOS GLOBAL
window.addEventListener('DOMContentLoaded', () => {
  // 1. Botón de actualización manual
  const btnReload = document.getElementById('btnReloadSupabase');
  if (btnReload) {
    btnReload.addEventListener('click', arrancarCargaDeDatos);
  }

  // 2. Formulario de Login
  const formLogin = document.getElementById('login-form') || document.querySelector('#login-container form');
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      if (typeof window.iniciarSesion === 'function') window.iniciarSesion();
    });
  }

  // 3. Botón de Login por ID
  const btnLogin = document.getElementById('btn-login') || document.getElementById('btn-ingresar');
  if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.iniciarSesion === 'function') window.iniciarSesion();
    });
  }

  // 4. Verificar sesión
  if (typeof window.revisarSesionActiva === 'function') {
    window.revisarSesionActiva();
  }
});