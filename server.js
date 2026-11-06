require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./src/db');
const apiRouter = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(502).json({ error: err.message || 'Error interno' });
});

db.connect(process.env.MONGODB_URI)
  .then((mode) => {
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
      console.log(`Pixabay: ${process.env.PIXABAY_API_KEY ? 'API real' : 'MODO DEMO (sin PIXABAY_API_KEY)'} | BD: ${mode}`);
    });
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

const shutdown = () => db.disconnect().finally(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
