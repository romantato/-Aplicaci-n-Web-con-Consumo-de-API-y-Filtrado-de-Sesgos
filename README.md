# Buscador Pixabay con Filtro de Sesgos

Aplicación web (Node.js + Express + MongoDB) que consume la API de Pixabay, aplica un filtro
algorítmico antisesgos a las búsquedas y guarda el historial y las imágenes seleccionadas en MongoDB.

## Ejecución

```bash
npm install
cp .env.example .env   # en Windows: copy .env.example .env
npm start              # http://localhost:3000
npm test               # pruebas del filtro antisesgos
```

Variables de `.env`:

| Variable | Descripción |
|---|---|
| `PIXABAY_API_KEY` | Clave gratuita de <https://pixabay.com/api/docs/>. Vacía = **modo demo** (20 imágenes de relleno por búsqueda que no corresponden al término). |
| `MONGODB_URI` | MongoDB local o Atlas. Si no conecta, se usa MongoDB en memoria (`mongodb-memory-server`). |
| `PORT` | Puerto HTTP (3000 por defecto). |

## Estructura

```
server.js                 Servidor Express
shared/biasFilter.js      Filtro antisesgos (lo usan servidor y navegador)
src/pixabay.js            Cliente asíncrono de la API de Pixabay (+ modo demo)
src/routes/api.js         API REST
src/models/Search.js      Colección search_history
src/models/SavedImage.js  Colección saved_images
public/                   Interfaz (HTML, CSS, JS)
test/                     Pruebas unitarias del filtro
```

## Filtro antisesgos

La validación se hace en el **servidor** (obligatoria) y se replica en el **cliente** para avisar al
usuario mientras escribe. Cada consulta termina en uno de cuatro estados:

| Estado | Cuándo | Acción |
|---|---|---|
| `blocked` | Lenguaje ofensivo, o identidad + estereotipo (`black criminal`, `mujer cocina`) | No se consulta la API |
| `rewritten` | Término racial o socioeconómico (`black`, `poor`, `black people`) | Se neutraliza: `black` → color negro (`colors=black`, `category=backgrounds`); `poor` → `community solidarity`; `black people` → `people diversity` |
| `mitigated` | Género, religión o discapacidad sin estereotipo (`woman`) | Se permite, pero se descartan resultados con etiquetas estereotipadas/sexualizadas |
| `clean` | Sin términos sensibles, o colores aplicados a objetos (`black cat`) | Se busca tal cual |

El filtro se activa/desactiva con la insignia **"Filtro Antisesgo: ACTIVO/INACTIVO"** (parámetro
`filter=off` en `/api/search`). Desactivado, la consulta se envía sin cambios y se registra con estado
`disabled`, indicando qué habría hecho el filtro, para comparar ambos comportamientos.

Además: SafeSearch siempre activo, normalización de mayúsculas/acentos, y post-filtrado de los
resultados por sus etiquetas (se eliminan imágenes etiquetadas con estereotipos o pobreza cuando la
consulta tocó un tema sensible).

## API REST

Todas las rutas reciben el usuario en la cabecera `X-User-Id`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/search?q=&lang=es\|en` | Filtra, consulta Pixabay y registra la búsqueda |
| GET | `/api/history` | Historial del usuario + conteo por estado del filtro |
| DELETE | `/api/history` | Borra el historial del usuario |
| GET | `/api/images` | Imágenes guardadas por el usuario |
| POST | `/api/images` | Guarda una imagen (sin duplicados por usuario) |
| DELETE | `/api/images/:pixabayId` | Quita una imagen de la colección |

## Colecciones MongoDB

`search_history`: `userId`, `originalQuery`, `appliedQuery`, `filterStatus`, `detectedTerms`,
`reasons`, `apiParams`, `totalHits`, `removedByFilter`, `viewedImages` (imágenes visualizadas), `source`, `createdAt`.

`saved_images`: `userId`, `pixabayId`, `tags`, `author`, `likes`, `views`, `previewURL`,
`webformatURL`, `pageURL`, `query`, `searchId`, `createdAt` (índice único `userId + pixabayId`).
