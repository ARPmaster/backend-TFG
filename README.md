# SmartCollect — Backend (Cloud Functions)

Backend serverless de SmartCollect sobre Firebase Cloud Functions. El cliente Android vive en
[SmartCollect-trabajo-de-final-de-carrera](https://github.com/ARPmaster/SmartCollect-trabajo-de-final-de-carrera).
Se usa solo para dos cosas que el cliente no puede resolver por sí solo:

- **`recognizeItem`** — identifica un objeto a partir de una foto para autorrellenar una
  publicación nueva.
- **`searchValuation`** / **`refreshValuation`** — calculan una valoración de mercado orientativa
  a partir de una búsqueda web real hecha por Gemini (no de una API de terceros como eBay).

El resto de la aplicación (colección, perfil, autenticación) usa directamente los SDK de
Firebase (Auth/Firestore/Storage) desde el cliente, sin pasar por este backend.

## Cómo funciona cada función

**`recognizeItem`** (Retrieval + Augmented Generation):
1. Envía la foto a Google Cloud Vision (Web Detection) y recupera entidades y páginas con
   coincidencia visual — como mucho 8 entidades y 6 páginas.
2. Si no se recupera ninguna señal, devuelve `candidates: []` directamente (no gasta una llamada
   a Gemini para nada).
3. Pasa esas señales a Gemini con un prompt que primero filtra si el objeto es deportivo (fuera
   de ámbito → `candidates: []`) y luego consolida hasta 5 candidatos con nombre/marca/modelo/
   confianza/número de fuentes que lo respaldan.
4. Calcula un ranking propio por candidato (no la confianza bruta de Gemini):
   `score = 0.4·fiabilidad_media_de_vision + 0.35·consenso_de_fuentes + 0.25·confianza_de_gemini`.
   Esta fórmula vive en `ranking.ts`, separada de Firebase/Vision/Gemini para poder testearla
   (ver `ranking.test.ts`).

**`searchValuation`** / **`refreshValuation`** (misma lógica de valoración, dos puntos de
entrada distintos):
1. Construyen una clave de caché normalizada a partir de marca+modelo+edición (o el nombre libre
   si no hay esos campos) — `buildSearchKey`/`normalizeKey` en `valuation.ts`, así "Nike Air
   Jordan 1" y "Air Jordan 1 Nike" caen en la misma entrada de caché.
2. Miran `products_cache` en Firestore; si hay algo de menos de 30 días, lo reutilizan sin llamar
   a Gemini.
3. Si no, piden a Gemini (con su herramienta de búsqueda web `googleSearch`, sin forzar JSON
   porque no es compatible con grounding) un precio oficial o, en su defecto, una media de
   segunda mano, con rango mínimo/máximo. La respuesta se parsea de forma tolerante
   (`parseValuationJson`, quita fences de markdown si Gemini las añade; precio/min/max ausentes
   → `null`, moneda ausente → `"EUR"`).
4. `searchValuation` solo lee/escribe `products_cache` (se llama antes de que el ítem exista).
   `refreshValuation` además actualiza el ítem en Firestore: `valoracionActual` y añade una
   entrada a `historialPrecios` (nunca se inventa un número si Gemini no encontró nada fiable).

**Resiliencia y logging**: cada función registra su entrada, éxito y error con
`logger.info`/`logger.error` de `firebase-functions` (uid, ids relevantes, mensaje de error —
nunca la imagen ni el contenido íntegro de la respuesta de Gemini salvo cuando ya falló el
parseo), visible en Cloud Functions → Logs.

## Requisitos

- Node.js 24.
- npm.
- Firebase CLI, autenticada contra una cuenta de Google con acceso al proyecto Firebase.

## Estructura

```
functions/
  src/
    index.ts               # exporta recognizeItem, searchValuation, refreshValuation
    recognizeItem.ts
    refreshValuation.ts     # searchValuation y refreshValuation
    ranking.ts              # lógica pura del ranking de recognizeItem (sin Firebase)
    ranking.test.ts
    valuation.ts            # lógica pura de clave de caché y parseo (sin Firebase)
    valuation.test.ts
```

## Tests

```sh
cd functions
npm install
npm test
```

24 tests (vitest) sobre `ranking.ts` y `valuation.ts`: candidatos vacíos, empates de score,
consenso acotado a 1, confianza ausente, JSON inválido, precio/moneda por defecto ante campos
ausentes, HTML de grounding malformado, etc. No cubren `recognizeItem.ts`/`refreshValuation.ts`
directamente (esos sí inicializan Firebase/Vision/Gemini de verdad) — de ahí la separación.

## Despliegue

1. Da de alta el secreto `GEMINI_API_KEY` en Secret Manager y concede acceso a la cuenta de
   servicio de Cloud Functions
   (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) mediante el rol
   `roles/secretmanager.secretAccessor`. El propio flujo de `firebase deploy` detecta si el
   secreto existe y solicita este permiso automáticamente si aún no se ha concedido.
2. Despliega, desde la raíz de este repositorio:

   ```sh
   cd functions && npm install && npm run build
   cd .. && firebase deploy --only functions:recognizeItem
   ```

   sustituyendo el nombre de la función según corresponda para el resto
   (`searchValuation`, `refreshValuation`). Todas se despliegan en la región `europe-west1`.

El primer despliegue de una función activa automáticamente, si no lo están ya, varias APIs de
Google Cloud necesarias: `run.googleapis.com`, `eventarc.googleapis.com`,
`pubsub.googleapis.com`, `storage.googleapis.com`, `secretmanager.googleapis.com` y
`artifactregistry.googleapis.com`. El asistente de línea de comandos de Firebase las habilita de
forma interactiva la primera vez que se detectan como necesarias y ausentes.

En el primer despliegue, Firebase preguntará si se desea configurar una política de limpieza de
las imágenes de contenedor generadas en Artifact Registry (para evitar acumulación de facturación
por builds antiguos); en este proyecto se usa borrado automático de imágenes con más de un día de
antigüedad.

**Verificación:** una vez completado, la consola de Firebase confirma el estado *Deploy
complete!* y permite consultar los registros de ejecución de cada función desde *Functions*.

## Scripts disponibles (`functions/package.json`)

| Script | Descripción |
| --- | --- |
| `npm run build` | Compila TypeScript a `lib/`. |
| `npm run build:watch` | Compila en modo watch. |
| `npm run serve` | Compila y arranca el emulador local de Functions. |
| `npm run shell` | Compila y abre el shell interactivo de Firebase Functions. |
| `npm run deploy` | Compila y despliega todas las funciones. |
| `npm run logs` | Muestra los logs de ejecución en producción. |
| `npm test` | Ejecuta los tests unitarios (vitest). |

## Variables y secretos sensibles no incluidos en el repositorio

El valor del secreto `GEMINI_API_KEY` se gestiona en Secret Manager y no forma parte del
repositorio. Quien desee reproducir el proyecto desde cero deberá generarlo con sus propias
credenciales de la API de Gemini.
