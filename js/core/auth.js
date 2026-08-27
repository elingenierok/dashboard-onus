// ====================================================
// CORE: AUTENTICACIÓN Y PERMISOS DE USUARIO
// ====================================================

const GLOBAL_SUPA_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const GLOBAL_SUPA_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const superbaseAuth = supabase.createClient(GLOBAL_SUPA_URL, GLOBAL_SUPA_KEY);

let permisosActuales = null;

async function revisarSesionActiva() {
  const { data: { session } } = await superbaseAuth.auth.getSession();
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

  if (!email || !pass) {
    errBox.textContent = 'Ingrese correo y contraseña.';
    return;
  }

  errBox.textContent = '⏳ Verificando credenciales...';

  const { data, error } = await superbaseAuth.auth.signInWithPassword({ email: email, password: pass });

  if (error) {
    errBox.textContent = '❌ Credenciales inválidas. Intente nuevamente.';
  } else {
    errBox.textContent = '';
    cargarPerfilUsuario(data.user);
  }
}

async function cerrarSesion() {
  await superbaseAuth.auth.signOut();
  window.location.reload();
}

function mostrarPantallaLogin() {
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

async function cargarPerfilUsuario(usuario) {
  const { data, error } = await superbaseAuth
    .from('usuarios_permisos')
    .select('*')
    .eq('id', usuario.id)
    .single();

  if (error || !data) {
    permisosActuales = { 
      es_superadmin: false, 
      puede_cambiar_sucursal: false,
      ver_kpi_estrategicos: false, 
      ver_costos_usd: false, 
      acceso_auditoria: false, 
      ver_recupero: false,
      acceso_reportes: false,
      sucursal_asignada: 'OBE'
    };
    document.getElementById('user-badge').textContent = `👤 ${usuario.email} (Sin Permisos)`;
  } else {
    permisosActuales = data;

    // EL SUPERADMIN TIENE ACCESO TOTAL AUTOMÁTICO
    if (permisosActuales.es_superadmin) {
      permisosActuales.puede_cambiar_sucursal = true;
      permisosActuales.ver_kpi_estrategicos = true;
      permisosActuales.ver_costos_usd = true;
      permisosActuales.acceso_auditoria = true;
      permisosActuales.ver_recupero = true;
      permisosActuales.acceso_reportes = true;
    }

    // ASIGNACIÓN MULTISUCURSAL
    window.SUCURSAL_USUARIO = permisosActuales.sucursal_asignada || 'OBE';
    window.SUCURSAL_FILTRO_ACTIVA = window.SUCURSAL_USUARIO;

    // CONTROL DEL DESPLEGABLE GLOBAL (SUPERADMIN O PERMISO ESPECIAL)
    const puedeNavegarSucursales = permisosActuales.es_superadmin || 
                                   permisosActuales.puede_cambiar_sucursal || 
                                   permisosActuales.sucursal_asignada === 'TODAS';

    const selSuc = document.getElementById('sel-sucursal-global');
    if (selSuc) {
      selSuc.value = window.SUCURSAL_FILTRO_ACTIVA;
      selSuc.disabled = !puedeNavegarSucursales;
    }

    document.getElementById('user-badge').textContent = `👤 ${data.nombre_completo || usuario.email} (${window.SUCURSAL_USUARIO}) ${permisosActuales.es_superadmin ? '[SuperAdmin]' : ''}`;
  }

  aplicarRestriccionesVisuales();

  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  arrancarCargaDeDatos();
}

function aplicarRestriccionesVisuales() {
  if (!permisosActuales) return;

  document.querySelectorAll('.hidden-by-role').forEach(el => el.classList.remove('hidden-by-role'));

  if (!permisosActuales.es_superadmin) {
    document.querySelectorAll('.req-superadmin').forEach(el => el.classList.add('hidden-by-role'));
  }
  if (!permisosActuales.ver_costos_usd) {
    document.querySelectorAll('.req-costos').forEach(el => el.classList.add('hidden-by-role'));
  }
  if (!permisosActuales.ver_kpi_estrategicos) {
    document.querySelectorAll('.req-estrategico').forEach(el => el.classList.add('hidden-by-role'));
    if (document.getElementById('tab-tendencias')?.classList.contains('active')) switchTab('tab-stock');
  }
  if (!permisosActuales.acceso_auditoria) {
    document.querySelectorAll('.req-auditoria').forEach(el => el.classList.add('hidden-by-role'));
  }
  if (!permisosActuales.acceso_reportes) {
    document.querySelectorAll('.req-reportes').forEach(el => el.classList.add('hidden-by-role'));
  }
  if (permisosActuales.ver_recupero === false) {
    document.querySelectorAll('.req-recupero').forEach(el => el.classList.add('hidden-by-role'));
    if (document.getElementById('tab-recupero')?.classList.contains('active')) switchTab('tab-stock');
  }
}