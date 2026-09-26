# Estado de la auditoría del dashboard-onus_test

> **Última actualización:** 2026-09-26  
> **Estado:** Activo. Sincronización de Módulo Recupero/Laboratorio finalizada con éxito.

---

## CÓMO RETOMAR EL TRABAJO

1. Leer este archivo completo antes de tocar nada.
2. Empezar por la sección "Próximos pasos sugeridos" al final.
3. Antes de cada cambio: abrir el archivo, leerlo entero, entender qué hace.
4. Después de cada cambio: recargar el dashboard con Ctrl + F5 y verificar.
5. Si algo se rompe: revisar la consola del navegador (F12 → Console) primero.

---

## HISTORIAL DE CAMBIOS (por sesión)

### Sesión 2026-09-21 — Auditoría inicial

- Lectura de archivos principales.
- Identificación de server.js roto, bot_precios.js roto, 3 bots duplicados.

### Sesión 2026-09-22 — Cambios grandes

- Unificación de bots en un solo bot_vivo.js.
- Reescritura completa de políticas RLS (50 nuevas).
- Limpieza de tablas huérfanas y columnas redundantes.
- Centralización de credenciales en js/core/config.js.
- Creación del radar multisucursal (recupero_radar.js).
- Fixes en recupero_ui.js, recupero_actions.js, referencias.js, tendencias.js.

### Sesión 2026-09-23 — Login del bot automático

- Se detectó que el bot automático fallaba a la mañana por sesión expirada del ISP.
- Se modificó bot_vivo.js para intentar login con timeout de 20 segundos.

### Sesión 2026-09-26 — Estandarización Dual Vector & Sincronización Dashboard/Reportes

- **Unificación Filosófica y Matemática:** Se migró todo el módulo de Recupero a una lógica de **Doble Vector**:
  - **Vector 1 (Ingreso Logístico):** Filtra estrictamente por fecha_ingreso / created_at e incluye equipos VIP y Obsoletos (descarte directo).
  - **Vector 2 (Producción de Laboratorio):** Filtra estrictamente por fin_prueba y evalúa únicamente el universo VIP.
- **Sincronización reportes.js:** 
  - Se adaptó cargarDatosHistoricosReporte y compilarReporteLive al doble vector.
  - Se incorporó el cálculo de calendario natural (Lunes a Domingo para semanas, 01 al fin de mes para meses).
  - Se restituyeron y estructuraron las matrices de **Ingreso por Canal vs Sucursal** y **Rendimiento por Técnico de Prueba**.
- **Refactorización recupero_ui.js:**
  - Se alineó la Matriz Pivot y la Tabla de Técnicos del tablero al calendario natural y al doble vector.
  - Se eliminó el hardcodeo/filtrado de nombres de técnicos; ahora lee de forma pura la base de datos (r.tecnico_prueba || r.tecnico).
  - Se aplicó capa defensiva de tipos (String(...)) para evitar TypeError en el DOM o congelación de scripts.

---

## ESTADO DEL BOT (IMPORTANTE)

### Situación actual

| Escenario | Comportamiento |
|---|---|
| Sesión viva | Bot corre invisible. Actualiza vivo + histórico |
| Sesión expirada, ISP responde | Bot se loguea solo. Actualiza vivo + histórico |
| Sesión expirada, ISP no responde | Popup "Sesión del ISP expirada" con instrucciones |
| Manual ejecutado | Abre Chrome visible. Te logueás. El bot hace su trabajo |

---

## PENDIENTES

| # | Tema | Prioridad | Notas |
|---|---|---|---|
| 1 | **Verificar exactitud de 🏛️ Indicadores Estratégicos** | Alta | Auditar que las métricas macro del módulo de reportes den valores 100% exactos con la BD. |
| 2 | **Estandarizar arquitectura de consulta/compilación unificada en los demás módulos** | Alta | Aplicar este mismo método en Módulo Stock, Tendencias, etc., para que Tablero y Reporte consulten a las mismas funciones sin lógica duplicada. |
| 3 | Verificar login automático del bot | Media | Ver sección "Estado del bot" |
| 4 | Leer auditoria.html | Baja | Solo lectura |
| 5 | sb_secret_ en .env | Baja | Riesgo latente. Ver "Notas de seguridad" |
| 6 | Cosmético: \n literal en popup del bot | Baja | Aparece "\n" en vez de salto de línea |
| 7 | package.json con "main": "index.js" | Baja | No existe ese archivo. Ignorable |
| 8 | test_recupero_radar.html | Baja | Prototipo viejo. Se puede borrar |
| 9 | Comentar los archivos .js con descripciones | Media | Ver sección "Tarea extra" abajo |

---

## TAREA EXTRA: COMENTAR CÓDIGO

**Objetivo:** que cada archivo .js tenga al principio un bloque de comentario que explique:

- Qué hace el archivo.
- Qué módulo del dashboard alimenta.
- Qué tablas de Supabase lee o escribe.
- Qué funciones expone a window (si corresponde).

**Ejemplo de bloque a agregar al inicio de cada archivo:**

// ====================================================
// MÓDULO: <nombre del módulo>
// DESCRIPCIÓN: <qué hace en 1 o 2 líneas>
// TABLAS QUE USA: <nombres>
// EXPONE EN WINDOW: <nombres de funciones globales>
// ====================================================

---

## HALLAZGOS ACTIVOS (sin arreglar)

| # | Hallazgo | Archivo | Gravedad |
|---|---|---|---|
| 1 | 4 copias de normalizar con distintos nombres | varios | Baja |
| 2 | renderAuditoriaTabla es código muerto | stock.js | Baja |
| 3 | window.EstadoStock.catrielCant nunca se asigna | stock.js | Baja |
| 4 | auditoria_control_activo.auditor y auditor_nombre duplicados | DB | Baja |
| 5 | upsert de clasificación manda todos los ítems visibles | referencias.js | Baja |

---

## HALLAZGOS CERRADOS

- ~~Llave faltante en recupero_ui.js~~
- ~~obtenerInfoCatalogo no está en window~~
- ~~Duplicados internos en recupero_historico_equipos~~
- ~~cargarDatosUmbralesAlmacen duplicada~~
- ~~renderizarTablaReferencias/renderizarTablaUmbrales código muerto~~
- ~~tendencias.js descargaba todo stock_historico cada vez~~
- ~~Detección de superadmin por CSS en referencias.js~~
- ~~5 copias de SUPABASE_URL + SUPABASE_KEY~~
- ~~Otra copia de credenciales en admin.js~~
- ~~Límites silenciosos en tendencias (3000/10000)~~
- ~~Descuadre de datos entre Tablero y Reporte PDF (490 vs 450 un.) — Resuelto con Doble Vector~~
- ~~Fechas de ventana deslizante restando días — Resuelto con Calendario Natural (Lunes-Domingo / Día 01)~~

---

## NOTAS DE SEGURIDAD

| Elemento | Estado |
|---|---|
| Frontend usa publishable key | OK. Es pública por diseño |
| Bots usan sb_secret_ en .env | OK. El .env está ignorado en Git |
| .env en .gitignore | OK |
| user_data/ en .gitignore | OK |
| RLS activo en todas las tablas | OK |
| Registro público de Supabase | Cerrado. Solo el admin crea usuarios |
| sb_secret_ en frontend | No está. Solo en .env de bots |

---

## ESTADO DE LA BASE DE DATOS

### Tablas en public (13 activas)

| Tabla | Rol |
|---|---|
| registro_stock | Foto actual del stock (bot vivo) |
| stock_historico | Foto diaria del stock (bot histórico) |
| catalogo_equipos | Catálogo de equipos ONUs |
| catalogo_insumos | Catálogo de insumos |
| config_stock_almacen | Umbrales (mín/PP/máx) por almacén |
| usuarios_permisos | Permisos de cada usuario |
| recupero_operativo | Equipos en mesa activa del laboratorio |
| recupero_historico_equipos | Equipos cerrados en cierres semanales |
| recupero_informes_semanales | Resúmenes semanales |
| auditoria_control_activo | Cabeceras de auditoría |
| auditoria_control_detalle | Detalle por modelo |
| auditoria_sucursales | Config de sucursales a auditar |

---

## MÓDULOS LEÍDOS

| Módulo | Estado | Hallazgos activos |
|---|---|---|
| stock.js | Leído | 2 |
| stock_insumos.js | Leído | 0 |
| recupero.js | Leído | 0 |
| recupero_ui.js | Refactorizado & Sincronizado | 0 |
| recupero_actions.js | Leído | 0 |
| recupero_radar.js | Nuevo | 0 |
| tendencias.js | Leído | 0 |
| referencias.js | Leído | 1 |
| admin.js | Leído | 0 |
| ops.js | Leído | 0 |
| app.js | Leído | 0 |
| auth.js | Leído | 0 |
| config.js | Nuevo | 0 |
| reportes.js | Refactorizado & Sincronizado | 0 |

---

## ARCHIVOS DEL PROYECTO

dashboard-onus_test/
│
├── index.html                          Dashboard principal
├── ops.html                            Suite operativa (laboratorio)
├── auditoria.html                      NO LEÍDO
├── test_recupero_radar.html            Prototipo viejo
│
├── bot_vivo.js                         Bot automático (vivo + histórico)
├── bot_vivo_manual.js                  Bot manual (desbloqueo)
├── ejecutar_manual.bat                 Lanzador del bot manual
│
├── package.json                        Dependencias
├── package-lock.json
├── .env                                Credenciales bots (NO en Git)
├── .gitignore
├── .nojekyll
├── stockactual.csv
├── AUDITORIA_ESTADO.md                 Este archivo
│
├── js/
│   ├── core/
│   │   ├── config.js                   Credenciales centralizadas
│   │   ├── auth.js
│   │   └── app.js
│   ├── modules/
│   │   ├── stock/
│   │   │   ├── stock.js
│   │   │   └── stock_insumos.js
│   │   ├── recupero/
│   │   │   ├── recupero.js
│   │   │   ├── recupero_ui.js
│   │   │   ├── recupero_actions.js
│   │   │   └── recupero_radar.js       Radar multisucursal
│   │   ├── tendencias/
│   │   │   └── tendencias.js
│   │   ├── auditoria/
│   │   │   ├── auditoria.js
│   │   │   └── visor.js
│   │   ├── referencias/
│   │   │   └── referencias.js
│   │   ├── admin/
│   │   │   └── admin.js
│   │   └── ops/
│   │       └── ops.js
│   └── services/
│       └── reportes.js                 Refactorizado & Sincronizado
│
├── descargas_bot/                      CSV del bot (ignorado en Git)
├── user_data/                          Perfil Chrome (ignorado en Git)
└── node_modules/                       Ignorado en Git

---

## PRÓXIMOS PASOS SUGERIDOS

### Prioridad Alta
1. **Auditoría de Indicadores Estratégicos:** Revisar y verificar que los cálculos macro en el módulo de reportes coincidan punto a punto con la BD.
2. **Réplica de Arquitectura Unificada:** Llevar el modelo de consultas/compiladores centralizados a Módulo Stock y Tendencias para lograr paridad total Tablero/PDF.

### Prioridad Media
1. Comentar los archivos .js con sus encabezados descriptivos.
2. Verificar el login automático del bot.

### Prioridad Baja
1. Leer auditoria.html.
2. Borrar prototipos obsoletos (test_recupero_radar.html).

---

## NOTAS PARA FUTURAS SESIONES

- No tocar reportes.js sin mantener sincronizado recupero_ui.js.
- Mantener la separación lógica del **Doble Vector**: Vector 1 (fecha_ingreso) para recepción/ingresos; Vector 2 (fin_prueba) para rendimiento de laboratorio.
- Antes de cambiar cualquier .js: verificar consola del navegador (F12).
- Credenciales viven SOLO en js/core/config.js.
- Antes de cambiar la base de datos: backup con select * from tabla.
- Antes de cambiar políticas RLS: guardar pg_policies en un .txt.

---

FIN DEL DOCUMENTO