require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const downloadPath = path.join(__dirname, 'descargas_bot');
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
}

// ====================================================
// PARSEO DEL CSV CON DETECCIÓN AUTOMÁTICA DE SEPARADOR
// ====================================================
function parsearCSVStock(filePath) {
  const contenido = fs.readFileSync(filePath, 'latin1');
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lineas.length < 2) return [];

  // Detección automática del delimitador (\t, ;, ,)
  const primeraLinea = lineas[0];
  let delimitador = ';';
  if (primeraLinea.includes('\t')) delimitador = '\t';
  else if (primeraLinea.includes(';') && !primeraLinea.includes('\t')) delimitador = ';';
  else if (primeraLinea.includes(',')) delimitador = ',';

  console.log(`📑 [PARSER] Delimitador detectado: "${delimitador === '\t' ? '\\t (Tab)' : delimitador}"`);

  const registros = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(delimitador).map(c => c.replace(/^"|"$/g, '').trim());
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

// ====================================================
// EJECUCIÓN MANUAL PASO A PASO (HEADLESS: FALSE)
// ====================================================
async function ejecutarBotRealtime() {
  console.log('⚡ [REALTIME MANUAL] Iniciando navegador en modo visible...');
  limpiarDirectorioDescargas();

  const browser = await puppeteer.launch({ 
    headless: false, 
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
    console.log(`🌐 Navegando a: ${process.env.ISP_URL}`);
    await page.goto(process.env.ISP_URL, { waitUntil: 'networkidle2' });

    // 1. Verificación de login
    const inputPassword = await page.$('input[type="password"]');
    if (inputPassword) {
      console.log('🔑 Formulario de login detectado. Ingresando credenciales...');
      await page.type('input[type="text"], input[name*="user"]', process.env.ISP_USER);
      await page.type('input[type="password"]', process.env.ISP_PASS);
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      console.log('🔓 Login enviado.');
    } else {
      console.log('✅ Sesión activa (no requirió login).');
    }

    // 2. Navegación en el menú
    console.log('📂 Accediendo a "Administracion"...');
    await page.evaluate(() => {
      const admin = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().includes('Administracion'));
      if (admin) admin.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('📂 Accediendo a "Stock"...');
    await page.evaluate(() => {
      const stock = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Stock');
      if (stock) stock.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('📂 Accediendo a "Stock Actual"...');
    await page.evaluate(() => {
      const stockActual = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().includes('Stock Actual'));
      if (stockActual) stockActual.click();
    });
    await new Promise(r => setTimeout(r, 4000));

    // 3. Clic en el nuevo botón del CSV
    console.log('🔍 Esperando botón de descarga CSV...');
    await page.waitForSelector('i.fa-file-csv, [title*="CSV"], [title*="Descargar CSV"]', { timeout: 10000 });

    console.log('🖱️ Clickeando ícono de descarga CSV...');
    await page.evaluate(() => {
      const iconoCSV = document.querySelector('i.fa-file-csv') || 
                       document.querySelector('[title="Descargar CSV"]') ||
                       document.querySelector('i[class*="fa-file-csv"]');

      if (iconoCSV) {
        const padreClickeable = iconoCSV.closest('a, button');
        if (padreClickeable) padreClickeable.click();
        else iconoCSV.click();
      }
    });

    // 4. Esperar a que el archivo caiga en el directorio
    console.log('⏳ Esperando que finalice la descarga del archivo en disco...');
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

    if (!archivoDescargado) throw new Error('No se detectó el archivo CSV en la carpeta descargas_bot.');
    console.log(`📥 Archivo descargado exitosamente: ${path.basename(archivoDescargado)}`);

    await browser.close();
    
    // 5. Parsear y actualizar Supabase
    const datos = parsearCSVStock(archivoDescargado);
    console.log(`📊 Total de filas procesadas: ${datos.length}`);
    
    console.log(`🧹 [REALTIME] Limpiando tabla 'registro_stock'...`);
    await supabase.from('registro_stock').delete().neq('id', 0);
    
    console.log(`🚀 [REALTIME] Subiendo ${datos.length} filas a 'registro_stock'...`);
    const BATCH_SIZE = 500;
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      const lote = datos.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('registro_stock').insert(lote);
      if (error) throw error;
      console.log(`   -> Lote subido (${Math.min(i + BATCH_SIZE, datos.length)}/${datos.length})`);
    }

    try { fs.unlinkSync(archivoDescargado); } catch (e) {}
    console.log('🎉 [REALTIME] ¡Stock en vivo actualizado correctamente en Supabase!');

  } catch (error) {
    console.error('❌ Error en Bot Realtime:', error.message);
    await browser.close().catch(() => {});
  }
}

ejecutarBotRealtime();