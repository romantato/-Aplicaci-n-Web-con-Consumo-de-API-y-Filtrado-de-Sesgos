const mongoose = require('mongoose');

let memoryServer = null;
let mode = 'disconnected';

async function connect(uri) {
  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      mode = 'mongodb';
      console.log(`[db] Conectado a MongoDB: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
      return mode;
    } catch (err) {
      console.warn(`[db] No se pudo conectar a ${uri}: ${err.message}`);
    }
  }

  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = require('mongodb-memory-server'));
  } catch {
    throw new Error('No hay MongoDB disponible: configure MONGODB_URI o instale mongodb-memory-server.');
  }
  console.log('[db] Iniciando MongoDB en memoria (los datos se pierden al reiniciar)...');
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri('pixabay_sesgos'));
  mode = 'memory';
  console.log('[db] MongoDB en memoria listo.');
  return mode;
}

async function disconnect() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, disconnect, getMode: () => mode };
