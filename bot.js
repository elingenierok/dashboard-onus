require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function parsearCSV(filePath) {
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

// Borra cualquier CSV previo para asegurar que el siguiente sea el nuevo
function limpiarCSVsAntiguos() {
  const carpetas = [__dirname, path.join(os.homedir(), 'Downloads')];
  for (const carpeta of carpetas) {
    if (!fs.existsSync(carpeta)) continue;
    const archivos = fs.readdirSync(carpeta);
    for (const f of archivos) {
      if ((f.toLowerCase().includes('stockactual') || f.toLowerCase().endsWith('.csv')) && f !== 'stockactual.csv') {
        try {
          fs.unlinkSync(path.join(carpeta, f));
        } catch (e) {
          // Si el archivo está abierto o bloqueado por el sistema, se omite
        }
      }
    }
  }
}

// Busca el nuevo archivo descargado
async function buscarYObtenerRutaCSV(timeoutMs = 25000) {
  const inicio = Date.now();
  const downloadsWindows = path.join(os.homedir(), 'Downloads');
  const carpetas = [__dirname, downloadsWindows];

  while (Date.now() - inicio < timeoutMs) {
    for (const carpeta of carpetas) {
      if (!fs.existsSync(carpeta)) continue;
      const archivos = fs.readdirSync(carpeta);
      const csvEncontrado = archivos.find(f => 
        f.endsWith('.csv') && 
        f !== 'stockactual.csv' && 
        !f.endsWith('.crdownload')
      );
      if (csvEncontrado) {
        return path.join(carpeta, csvEncontrado);
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

async function ejecutarBot() {
  console.log('🤖 Iniciando automatización...');
  
  // Limpiar basura anterior
  limpiarCSVsAntiguos();

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    userDataDir: path.join(__dirname, 'user_data')
  });
  
  // Gestor de pestañas: Cierra pestañas viejas acumuladas
  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  for (let i = 1; i < pages.length; i++) {
    await pages[i].close().catch(() => {});
  }

  // 💬 FIX 1: Interceptar y aceptar automáticamente alertas nativas del navegador (alert / confirm / prompt)
  page.on('dialog', async dialog => {
    console.log(`💬 Popup detectado: "${dialog.message()}". Aceptando automáticamente...`);
    await dialog.accept();
  });

  try {
    console.log('🌐 Conectando al ISP...');
    await page.goto(process.env.ISP_URL, { waitUntil: 'networkidle2' });

    const inputPassword = await page.$('input[type="password"]');
    if (inputPassword) {
      console.log('🔑 Pantalla de login detectada. Autenticando...');
      await page.type('input[type="text"], input[name*="user"]', process.env.ISP_USER);
      await page.type('input[type="password"]', process.env.ISP_PASS);
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    } else {
      console.log('⚡ Sesión activa detectada.');
    }

    const solicitaCodigo = await page.evaluate(() => {
      return document.body.innerText.includes('código que recibiciste por mail') || 
             document.body.innerText.includes('nuevo dispositivo');
    });

    if (solicitaCodigo) {
      console.log('⚠️ Se requiere autenticación por código.');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log('🔕 Verificando emergente...');
    await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
      const btnAceptar = botones.find(b => b.textContent.trim().toLowerCase().includes('aceptar'));
      if (btnAceptar) btnAceptar.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('🧭 Navegando menú hacia Stock Actual...');
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
    console.log('📄 Esperando carga de la tabla de Stock Actual...');
    await new Promise(r => setTimeout(r, 4000));

    console.log('⬇️ Descargando CSV...');
    await page.evaluate(() => {
      const imgCSV = document.querySelector('img[src*="fil_csv.png"]') || document.querySelector('img[src*="csv"]');
      if (imgCSV) {
        const enlacePadre = imgCSV.closest('a');
        if (enlacePadre) enlacePadre.click();
        else imgCSV.click();
      }
    });

    console.log('⏳ Esperando la llegada del nuevo archivo CSV...');
    const rutaCSV = await buscarYObtenerRutaCSV(25000);

    if (!rutaCSV) {
      throw new Error('No se detectó la descarga del archivo CSV.');
    }

    await browser.close();
    console.log(`📂 Archivo detectado en: ${rutaCSV}`);
    
    const datos = parsearCSV(rutaCSV);

    // 🧹 FIX 2: Borrar datos previos con la fecha de hoy para evitar duplicados en Supabase
    const fechaHoy = new Date().toISOString().split('T')[0];
    console.log(`🧹 Limpiando registros anteriores con fecha ${fechaHoy} en Supabase...`);
    
    const { error: deleteError } = await supabase
      .from('registro_stock')
      .delete()
      .eq('fecha_registro', fechaHoy);

    if (deleteError) {
      console.warn('⚠️ Advertencia al limpiar registros previos:', deleteError.message);
    }
    
    console.log(`🚀 Subiendo ${datos.length} filas a Supabase...`);
    const BATCH_SIZE = 500;
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      const lote = datos.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('registro_stock').insert(lote);
      if (error) throw error;
    }

    fs.unlinkSync(rutaCSV);
    console.log('🎉 ¡Proceso diario completado con éxito!');

  } catch (error) {
    console.error('❌ Error durante la ejecución:', error.message);
    await browser.close();
  }
}

ejecutarBot();