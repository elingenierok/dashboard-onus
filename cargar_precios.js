require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function parsearCatalogo(filePath) {
  const contenido = fs.readFileSync(filePath, 'latin1');
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim() !== '');
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

async function cargar() {
  const archivos = fs.readdirSync(__dirname).filter(f => f.startsWith('catalogo_') && f.endsWith('.csv'));
  let todos = [];

  for (const archivo of archivos) {
    console.log(`🔍 Procesando ${archivo}...`);
    const datos = parsearCatalogo(path.join(__dirname, archivo));
    todos = todos.concat(datos);
  }

  console.log(`🚀 Subiendo ${todos.length} precios/insumos a Supabase...`);
  const { error } = await supabase.from('precios_catalogos').upsert(todos, { onConflict: 'codigo' });

  if (error) {
    console.error('❌ Error al subir:', error.message);
  } else {
    console.log('🎉 ¡Catálogo de precios cargado con éxito en Supabase!');
  }
}

cargar();