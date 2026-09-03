// ====================================================
// CORE: AUTENTICACIÓN Y PERMISOS DE USUARIO
// ====================================================

const GLOBAL_SUPA_URL = 'https://ovluxdezwvuonlwnymna.supabase.co';
const GLOBAL_SUPA_KEY = 'sb_publishable_M2j4ddXtauXgPDqtOsNZow_-X0hLW-S';
const superbaseAuth = supabase.createClient(GLOBAL_SUPA_URL, GLOBAL_SUPA_KEY);

let permisosActuales = null;

window.revisarSesionActiva = async function() {
  const { data: { session } } = await superbaseAuth.auth.getSession();
  if (session && session.user) {
    cargarPerfilUsuario(session.user);
  } else {
    mostrarPantallaLogin();
  }
};

window.iniciarSesion = async function() {
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
};

window.cerrarSesion = async function() {
  try {
    if (typeof superbaseAuth !== 'undefined' && superbaseAuth.auth) {
      await superbaseAuth.auth.signOut();
    }
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
  } finally {
    window.location.reload();
  }
};

function mostrarPantallaLogin() {
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

async function cargarPerfilUsuario(usuario) {
  if (!usuario) return;

  const userEmail = (usuario.email || '').trim().toLowerCase();

  // 1. INTENTO DE BÚSQUEDA POR UUID (ID)
  let { data, error } = await superbaseAuth
    .from('usuarios_permisos')
    .select('*')
    .eq('id', usuario.id)
    .maybeSingle();

  // 2. FALLBACK: SI NO ENCONTRÓ POR ID, BUSCA POR EMAIL (CASE INSENSITIVE)
  if (!data && userEmail) {
    const { data: dataEmail } = await superbaseAuth
      .from('usuarios_permisos')
      .select('*')
      .ilike('email', userEmail)
      .maybeSingle();

    if (dataEmail) {
      data = dataEmail;
      error = null;
    }
  }

  const userBadge = document.getElementById('user-badge');

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

    window.SUCURSAL_USUARIO = 'OBE';
    window.SUCURSAL_FILTRO_ACTIVA = 'OBE';
    
    // Si no tiene registro en usuarios_permisos, guarda su email limpio
    window.USUARIO_NOMBRE_MOSTRAR = usuario.email;

    if (userBadge) {
      userBadge.textContent = `👤 ${usuario.email} (Sin Permisos)`;
    }
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

    // 🎯 NOMBRE LIMPIO Y ESTÁNDAR PARA TODO EL SISTEMA
    const nombreLimpio = data.nombre_completo || data.nombre || data.alias || usuario.email;
    window.USUARIO_NOMBRE_MOSTRAR = nombreLimpio;

    // CONTROL DEL DESPLEGABLE GLOBAL
    const puedeNavegarSucursales = permisosActuales.es_superadmin || 
                                   permisosActuales.puede_cambiar_sucursal || 
                                   permisosActuales.sucursal_asignada === 'TODAS';

    const selSuc = document.getElementById('sel-sucursal-global');
    if (selSuc) {
      selSuc.value = window.SUCURSAL_FILTRO_ACTIVA;
      selSuc.disabled = !puedeNavegarSucursales;
    }

    if (userBadge) {
      userBadge.textContent = `👤 ${nombreLimpio} (${window.SUCURSAL_USUARIO}) ${permisosActuales.es_superadmin ? '[SuperAdmin]' : ''}`;
    }
  }

  window.PERMISOS_ACTUALES = permisosActuales;

  aplicarRestriccionesVisuales();

  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  if (typeof arrancarCargaDeDatos === 'function') {
    arrancarCargaDeDatos();
  }
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