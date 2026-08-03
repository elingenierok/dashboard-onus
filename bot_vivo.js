require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

function limpiarCSVsAntiguos() {
  const carpetas = [__dirname, path.join(os.homedir(), 'Downloads')];
  for (const carpeta of carpetas) {
    if (!fs.existsSync(carpeta)) continue;
    const archivos = fs.readdirSync(carpeta);
    for (const f of archivos) {
      if (f.toLowerCase().endsWith('.csv') && f !== 'stockactual.csv') {
        try { fs.unlinkSync(path.join(carpeta, f)); } catch (e) {}
      }
    }
  }
}

async function buscarYObtenerRutaCSV(timeoutMs = 25000) {
  const inicio = Date.now();
  const downloadsWindows = path.join(os.homedir(), 'Downloads');
  const carpetas = [__dirname, downloadsWindows];

  while (Date.now() - inicio < timeoutMs) {
    for (const carpeta of carpetas) {
      if (!fs.existsSync(carpeta)) continue;
      const archivos = fs.readdirSync(carpeta);
      const csvEncontrado = archivos.find(f => 
        f.endsWith('.csv') && f !== 'stockactual.csv' && !f.endsWith('.crdownload')
      );
      if (csvEncontrado) return path.join(carpeta, csvEncontrado);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

async function ejecutarBotVivo() {
  console.log('🤖 Iniciando bot: [STOCK EN VIVO]');
  limpiarCSVsAntiguos();

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
    downloadPath: path.join(os.homedir(), 'Downloads')
  });

  for (let i = 1; i < pages.length; i++) {
    await pages[i].close().catch(() => {});
  }

  page.on('dialog', async dialog => {
    await dialog.accept();
  });

  try {
    console.log('🌐 Conectando al ISP...');
    await page.goto(process.env.ISP_URL, { waitUntil: 'networkidle2' });

    const inputPassword = await page.$('input[type="password"]');
    if (inputPassword) {
      console.log('🔑 Autenticando...');
      await page.type('input[type="text"], input[name*="user"]', process.env.ISP_USER);
      await page.type('input[type="password"]', process.env.ISP_PASS);
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    }

    console.log('🧭 Navegando a Administracion -> Stock -> Stock Actual...');
    await page.evaluate(() => {
      const enlaces = Array.from(document.querySelectorAll('a'));
      const admin = enlaces.find(a => a.textContent.trim().includes('Administracion'));
      if (admin) admin.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
      const enlaces = Array.from(document.querySelectorAll('a'));
      const stock = enlaces.find(a => a.textContent.trim() === 'Stock');
      if (stock) stock.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
      const enlaces = Array.from(document.querySelectorAll('a'));
      const stockActual = enlaces.find(a => a.textContent.trim().includes('Stock Actual'));
      if (stockActual) stockActual.click();
    });
    await new Promise(r => setTimeout(r, 4000));

    console.log('⬇️ Descargando CSV de stock...');
    await page.evaluate(() => {
      const imgCSV = document.querySelector('img[src*="fil_csv.png"]') || document.querySelector('img[src*="csv"]');
      if (imgCSV) {
        const enlacePadre = imgCSV.closest('a');
        if (enlacePadre) enlacePadre.click();
        else imgCSV.click();
      }
    });

    const rutaCSV = await buscarYObtenerRutaCSV(25000);
    if (!rutaCSV) throw new Error('No se detectó la descarga del archivo CSV.');

    await browser.close();
    
    const datos = parsearCSVStock(rutaCSV);
    const fechaHoy = new Date().toISOString().split('T')[0];
    
    console.log(`🧹 Limpiando registros del día (${fechaHoy}) en 'registro_stock'...`);
    await supabase.from('registro_stock').delete().eq('fecha_registro', fechaHoy);
    
    console.log(`🚀 Subiendo ${datos.length} filas a Supabase (registro_stock)...`);
    const BATCH_SIZE = 500;
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      const lote = datos.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('registro_stock').insert(lote);
      if (error) throw error;
    }

    fs.unlinkSync(rutaCSV);
    console.log('🎉 ¡Sincronización de STOCK EN VIVO completada con éxito!');

  } catch (error) {
    console.error('❌ Error durante la ejecución:', error.message);
    await browser.close();
  }
}

ejecutarBotVivo();