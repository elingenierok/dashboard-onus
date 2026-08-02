const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());

// Ruta que recibe la orden desde la web y dispara el bot
app.get('/ejecutar-bot', (req, res) => {
  console.log('⚡ Orden recibida desde la web. Iniciando bot...');
  
  exec('node bot.js', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error ejecutando el bot:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
    console.log('✅ Bot finalizado con éxito.');
    res.json({ success: true, log: stdout });
  });
});

app.listen(3000, () => {
  console.log('🚀 Servidor del Bot escuchando en http://localhost:3000');
});