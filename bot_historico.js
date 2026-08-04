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

async function ejecutarBotHistorico() {
  console.log('🤖 [HISTÓRICO] Iniciando captura diaria...');
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
    await page.goto(process.env.ISP_URL, { waitUntil: 'networkidle2' });

    const inputPassword = await page.$('input[type="password"]');
    if (inputPassword) {
      await page.type('input[type="text"], input[name*="user"]', process.env.ISP_USER);
      await page.type('input[type="password"]', process.env.ISP_PASS);
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
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

    const tiempoInicioDownload = Date.now();
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
    
    const datos = parsearCSVStock(archivoDescargado);
    const fechaHoy = new Date().toISOString().split('T')[0];
    
    console.log(`🧹 [HISTÓRICO] Limpiando datos previos de hoy (${fechaHoy})...`);
    await supabase.from('stock_historico').delete().eq('fecha_registro', fechaHoy);
    
    console.log(`🚀 [HISTÓRICO] Guardando ${datos.length} filas en 'stock_historico'...`);
    const BATCH_SIZE = 500;
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      const lote = datos.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('stock_historico').insert(lote);
      if (error) throw error;
    }

    fs.unlinkSync(archivoDescargado);
    console.log('🎉 [HISTÓRICO] ¡Carga completada!');

  } catch (error) {
    console.error('❌ Error en Bot Histórico:', error.message);
    await browser.close();
  }
}

ejecutarBotHistorico();