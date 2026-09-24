require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const downloadPath = path.join(__dirname, 'descargas_bot');
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
}

// ====================================================
// POPUP DE WINDOWS CON CHECKBOX OBLIGATORIO
// ====================================================
function mostrarPopup(titulo, mensaje) {
  try {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "${titulo.replace(/"/g, '`"')}"
$form.Size = New-Object System.Drawing.Size(520, 260)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "${mensaje.replace(/"/g, '`"')}"
$label.Location = New-Object System.Drawing.Point(15, 15)
$label.Size = New-Object System.Drawing.Size(480, 150)
$label.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$check = New-Object System.Windows.Forms.CheckBox
$check.Text = 'He leido el mensaje'
$check.Location = New-Object System.Drawing.Point(15, 175)
$check.Size = New-Object System.Drawing.Size(300, 25)

$btn = New-Object System.Windows.Forms.Button
$btn.Text = 'Aceptar'
$btn.Location = New-Object System.Drawing.Point(400, 170)
$btn.Size = New-Object System.Drawing.Size(90, 30)
$btn.Enabled = $false

$check.Add_CheckedChanged({ $btn.Enabled = $check.Checked })
$btn.Add_Click({ $form.Close() })

$form.Controls.Add($label)
$form.Controls.Add($check)
$form.Controls.Add($btn)
$form.AcceptButton = $null

$form.ShowDialog() | Out-Null
`;
    execSync('powershell -NoProfile -Command -', { input: script, stdio: ['pipe', 'ignore', 'ignore'] });
  } catch (e) {
    // Si el popup falla, no rompemos el bot. Solo lo logueamos.
    console.error('No se pudo mostrar el popup:', e.message);
  }
}

// ====================================================
// PARSEO DEL CSV
// ====================================================
function parsearCSVStock(filePath) {
  const contenido = fs.readFileSync(filePath, 'latin1');
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lineas.length < 2) return [];

  const registros = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(';').map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 8) continue;

    const stockTotalRaw = cols[5]?.replace(/\./g, '').replace(',', '.') || '0';
    const stockReservadoRaw = cols[6]?.replace(/\./g, '').replace(',', '.') || '0';

    if (!cols[2] || !cols[7]) continue;

    registros.push({
      codigo: cols[1],
      descripcion: cols[2],
      catalogo: cols[4],
      stock_total: Math.round(parseFloat(stockTotalRaw)) || 0,
      stock_reservado: Math.round(parseFloat(stockReservadoRaw)) || 0,
      almacen: cols[7],
      fecha_registro: new Date().toISOString().split('T')[0]
    });
  }
  return registros;
}

function limpiarDirectorioDescargas() {
  const archivos = fs.readdirSync(downloadPath);
  for (const f of archivos) {
    if (f.toLowerCase().endsWith('.csv') || f.endsWith('.crdownload')) {
      try { fs.unlinkSync(path.join(downloadPath, f)); } catch (e) {}
    }
  }
}

function fechaHoraLocal() {
  const d = new Date();
  const fecha = d.toLocaleDateString('es-AR');
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} ${hora}`;
}

// ====================================================
// DESCARGA DEL CSV
// ====================================================
async function descargarCSV() {
  limpiarDirectorioDescargas();

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    userDataDir: path.join(__dirname, 'user_data')
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath
  });

  for (let i = 1; i < pages.length; i++) {
    await pages[i].close().catch(() => {});
  }

  page.on('dialog', async dialog => { await dialog.accept(); });

  try {
    await page.goto(process.env.ISP_URL, { waitUntil: 'networkidle2' });

    // El bot intenta loguearse con timeout corto.
    // Si el ISP responde, sigue normal (vivo + histórico).
    // Si tarda demasiado, corta con aviso.
    const inputPassword = await page.$('input[type="password"]');
    if (inputPassword) {
      try {
        await page.type('input[type="text"], input[name*="user"]', process.env.ISP_USER);
        await page.type('input[type="password"]', process.env.ISP_PASS);

        await Promise.race([
          page.click('button[type="submit"], input[type="submit"]').then(() =>
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), 20000)
          )
        ]);

        // Verificar que el login funcionó (que no siga el input de password)
        const sigueLogin = await page.$('input[type="password"]');
        if (sigueLogin) {
          throw new Error('LOGIN_FALLIDO');
        }
      } catch (err) {
        if (err.message === 'LOGIN_TIMEOUT' || err.message === 'LOGIN_FALLIDO') {
          throw new Error('SESION_EXPIRADA');
        }
        throw err;
      }
    }

    await page.evaluate(() => {
      const admin = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().includes('Administracion'));
      if (admin) admin.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
      const stock = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Stock');
      if (stock) stock.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
      const stockActual = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().includes('Stock Actual'));
      if (stockActual) stockActual.click();
    });
    await new Promise(r => setTimeout(r, 4000));

    await page.evaluate(() => {
      const imgCSV = document.querySelector('img[src*="fil_csv.png"]') || document.querySelector('img[src*="csv"]');
      if (imgCSV) {
        const enlacePadre = imgCSV.closest('a');
        if (enlacePadre) enlacePadre.click();
        else imgCSV.click();
      }
    });

    let archivoDescargado = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const archivos = fs.readdirSync(downloadPath);
      const validos = archivos.filter(f => f.toLowerCase().endsWith('.csv') && !f.endsWith('.crdownload'));
      if (validos.length > 0) {
        archivoDescargado = path.join(downloadPath, validos[0]);
        break;
      }
    }

    if (!archivoDescargado) throw new Error('No se detectó el archivo CSV.');

    await browser.close();
    return archivoDescargado;

  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

// ====================================================
// CHEQUEO DE HISTORICO
// ====================================================
async function hayHistoricoDeHoy(fechaHoy) {
  const { data, error } = await supabase
    .from('stock_historico')
    .select('id')
    .eq('fecha_registro', fechaHoy)
    .limit(1);

  if (error) throw new Error('Error al consultar stock_historico: ' + error.message);
  return data && data.length > 0;
}

// ====================================================
// PROCESO PRINCIPAL
// ====================================================
async function ejecutarBot() {
  const fechaHoy = new Date().toISOString().split('T')[0];

  let stockVivoOk = false;
  let historicoOk = false;
  let historicoYaExistia = false;
  let errorMensaje = null;

  try {
    // 1. Descargar CSV
    const archivoDescargado = await descargarCSV();

    // 2. Parsear
    const datos = parsearCSVStock(archivoDescargado);
    if (datos.length === 0) throw new Error('El CSV no tenía filas válidas.');

    // 3. Actualizar registro_stock (siempre)
    await supabase.from('registro_stock').delete().neq('id', 0);

    const BATCH_SIZE = 500;
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      const lote = datos.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('registro_stock').insert(lote);
      if (error) throw new Error('Error insertando en registro_stock: ' + error.message);
    }
    stockVivoOk = true;

    // 4. Chequear histórico
    historicoYaExistia = await hayHistoricoDeHoy(fechaHoy);

    if (!historicoYaExistia) {
      // 5. Insertar histórico (solo la primera del día)
      for (let i = 0; i < datos.length; i += BATCH_SIZE) {
        const lote = datos.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('stock_historico').insert(lote);
        if (error) throw new Error('Error insertando en stock_historico: ' + error.message);
      }
      historicoOk = true;
    }

    // 6. Limpiar CSV descargado
    try { fs.unlinkSync(archivoDescargado); } catch (e) {}

    // 7. Popup solo si insertó histórico
    if (historicoOk) {
      mostrarPopup(
        'Stock actualizado correctamente',
        `Stock vivo actualizado: ${fechaHoraLocal()}\\n\\nHistorico del dia: ${fechaHoraLocal()}\\n\\nFilas cargadas: ${datos.length}`
      );
    }

  } catch (error) {
    errorMensaje = error.message;
  }

   // 8. Popup de error, si hubo
  if (errorMensaje) {
    if (errorMensaje === 'SESION_EXPIRADA') {
      mostrarPopup(
        'Sesion del ISP expirada',
        `La sesion del ISP se cerro (probablemente durante la noche).\n\nPara renovarla:\n1. Ejecuta "ejecutar_manual.bat" con doble clic\n2. Logueate cuando se abra la ventana de Chrome\n3. Espera a que el bot manual termine\n\nDespues, el bot automatico va a volver a funcionar solo cada 15 minutos.`
      );
    } else {
      mostrarPopup(
        'Error en el bot de stock',
        `Detalle: ${errorMensaje}\n\nStock vivo actualizado: ${stockVivoOk ? 'SI' : 'NO'}\nHistorico del dia: ${historicoYaExistia ? 'YA EXISTIA' : (historicoOk ? 'SI' : 'NO')}\n\nRevisar cuando puedas.`
      );
    }
  }
}

ejecutarBot();