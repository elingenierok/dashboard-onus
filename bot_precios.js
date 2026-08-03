require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function parsearCSVCatalogoPrecios(filePath) {
  const contenido = fs.readFileSync(filePath, 'latin1');
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lineas.length < 2) return [];

  const registros = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(';').map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 11) continue;

    const codigo = cols[1];
    const descripcion = cols[2];
    const precioRaw = cols[10] || '0';

    const moneda = precioRaw.toLowerCase().includes('u$s') ? 'USD' : 'ARS';
    const numClean = precioRaw.replace(/[^0-9,-]/g, '').replace(',', '.');
    const precioFinal = parseFloat(numClean) || 0;

    if (codigo && descripcion) {
      registros.push({
        codigo: codigo,
        descripcion: descripcion,
        precio_final: precioFinal,
        moneda: moneda,
        updated_at: new Date().toISOString()
      });
    }
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

async function descargarCategoria(page, cat) {
  console.log(`\n🔄 --- Iniciando ciclo para categoría: [${cat.id}] (${cat.texto}) ---`);

  // 1. Navegar a Catálogos y Productos
  await page.evaluate(() => {
    const enlaces = Array.from(document.querySelectorAll('a'));
    const enlaceCat = enlaces.find(a => a.getAttribute('href')?.includes('bm_catalogos.php') || a.textContent.includes('Catalogos y Productos'));
    if (enlaceCat) enlaceCat.click();
  });

  // Esperar activamente a que el formulario cargue en el DOM
  await page.waitForSelector('img[src*="ico_paso_proximo.png"], #cod_chosen, select', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // 2. Seleccionar la opción en el selector nativo y sincronizar con Chosen JS
  const seleccionada = await page.evaluate((busqueda) => {
    const selects = Array.from(document.querySelectorAll('select'));
    let targetOption = null;
    let parentSelect = null;

    for (const sel of selects) {
      const opt = Array.from(sel.options).find(o => 
        o.text.trim().startsWith(busqueda.id) || 
        o.text.toLowerCase().includes(busqueda.texto.toLowerCase())
      );
      if (opt) {
        targetOption = opt;
        parentSelect = sel;
        break;
      }
    }

    if (targetOption && parentSelect) {
      parentSelect.value = targetOption.value;
      parentSelect.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.$) {
        try { window.$(parentSelect).trigger('chosen:updated').trigger('change'); } catch(e) {}
      }
      return targetOption.text.replace(/\s+/g, ' ').trim();
    }

    // Alternativa visual si el select nativo no responde
    const chosenSingle = document.querySelector('#cod_chosen a.chosen-single') || document.querySelector('.chosen-single');
    if (chosenSingle) chosenSingle.click();

    const opciones = Array.from(document.querySelectorAll('#cod_chosen ul.chosen-results li, li.active-result'));
    const targetLi = opciones.find(el => 
      el.textContent.trim().startsWith(busqueda.id) || 
      el.textContent.toLowerCase().includes(busqueda.texto.toLowerCase())
    );

    if (targetLi) {
      const texto = targetLi.textContent.replace(/\s+/g, ' ').trim();
      targetLi.click();
      return texto;
    }

    return null;
  }, cat);

  if (!seleccionada) {
    console.log(`❌ No se pudo seleccionar la opción '${cat.id}' en el formulario.`);
    return [];
  }

  console.log(`✅ Opción seleccionada con éxito: "${seleccionada}"`);
  await new Promise(r => setTimeout(r, 1500));

  // 3. Aplicar filtro con la flecha azul
  await page.evaluate(() => {
    const img = document.querySelector('img[src*="ico_paso_proximo.png"]');
    if (img) img.click();
  });
  await new Promise(r => setTimeout(r, 4000));

  // 4. Descargar archivo CSV
  await page.evaluate(() => {
    const imgCSV = document.querySelector('img[src*="fil_csv.png"]') || document.querySelector('img[src*="csv"]');
    if (imgCSV) {
      const enlacePadre = imgCSV.closest('a');
      if (enlacePadre) enlacePadre.click();
      else imgCSV.click();
    }
  });

  const rutaCSV = await buscarYObtenerRutaCSV(25000);
  if (rutaCSV) {
    console.log(`📄 CSV descargado: ${path.basename(rutaCSV)}`);
    const datos = parsearCSVCatalogoPrecios(rutaCSV);
    console.log(`📊 Registros extraídos: ${datos.length}`);
    try { fs.unlinkSync(rutaCSV); } catch (e) {}
    return datos;
  } else {
    console.log(`❌ No se detectó la descarga para ${cat.id}`);
    return [];
  }
}

async function ejecutarBotPrecios() {
  console.log('🤖 Iniciando bot: [CATÁLOGO DE PRECIOS]');
  limpiarCSVsAntiguos();

  let browser = null;

  try {
    browser = await puppeteer.launch({ 
      headless: false, 
      defaultViewport: null,
      userDataDir: path.join(__dirname, 'user_data')
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    for (let i = 1; i < pages.length; i++) {
      await pages[i].close().catch(() => {});
    }

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.join(os.homedir(), 'Downloads')
    });

    page.on('dialog', async dialog => { await dialog.accept(); });

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

    // Navegar a Administracion -> Stock
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

    const categorias = [
      { id: 'EC', texto: 'Equipamientos para clientes' },
      { id: 'MR', texto: 'Materiales consumibles de Redes' }
    ];

    let todosLosPrecios = [];

    for (const cat of categorias) {
      const datosCat = await descargarCategoria(page, cat);
      todosLosPrecios = todosLosPrecios.concat(datosCat);
    }

    // Filtrar duplicados antes de actualizar Supabase
    const mapaPrecios = new Map();
    for (const item of todosLosPrecios) {
      mapaPrecios.set(item.codigo, item);
    }
    const preciosUnicos = Array.from(mapaPrecios.values());

    if (preciosUnicos.length > 0) {
      console.log(`\n🚀 Subiendo ${preciosUnicos.length} precios (EC + MR) a Supabase...`);
      const { error } = await supabase.from('precios_catalogos').upsert(preciosUnicos, { onConflict: 'codigo' });
      if (error) throw error;
      console.log('🎉 ¡Catálogo de precios cargado con éxito!');
    }

  } catch (error) {
    console.error('❌ Error durante la ejecución:', error.message);
  } finally {
    if (browser) {
      console.log('🔒 Cerrando navegador...');
      await browser.close().catch(() => {});
    }
  }
}

ejecutarBotPrecios();