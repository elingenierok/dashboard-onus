# Estado de la auditoría del dashboard-onus_test

> **Última actualización:** 2026-09-23
> **Estado:** Pausado. Proyecto estable. Pendiente: verificar si el bot automático
> logra loguearse solo (probar mañana a la mañana).

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
- Identificación de `server.js` roto, `bot_precios.js` roto, 3 bots duplicados.

### Sesión 2026-09-22 — Cambios grandes

- Unificación de bots en un solo `bot_vivo.js`.
- Reescritura completa de políticas RLS (50 nuevas).
- Limpieza de tablas huérfanas y columnas redundantes.
- Centralización de credenciales en `js/core/config.js`.
- Creación del radar multisucursal (`recupero_radar.js`).
- Fixes en `recupero_ui.js`, `recupero_actions.js`, `referencias.js`, `tendencias.js`.

### Sesión 2026-09-23 — Login del bot automático

- Se detectó que el bot automático fallaba a la mañana por sesión expirada del ISP.
- Se modificó `bot_vivo.js` para intentar login con timeout de 20 segundos.
- Pendiente: verificar mañana si el login automático funciona de verdad.

---

## ESTADO DEL BOT (IMPORTANTE)

### Situación actual

| Escenario | Comportamiento |
|---|---|
| Sesión viva | Bot corre invisible. Actualiza vivo + histórico |
| Sesión expirada, ISP responde | Bot se loguea solo. Actualiza vivo + histórico |
| Sesión expirada, ISP no responde | Popup "Sesión del ISP expirada" con instrucciones |
| Manual ejecutado | Abre Chrome visible. Te logueás. El bot hace su trabajo |

### Qué probar mañana (2026-09-24)

1. Encender la notebook y NO ejecutar el manual.
2. Esperar a la corrida automática (cada 15 min).
3. Ver si aparece popup de "Sesión expirada" o si actualiza normal.
4. Anotar el resultado acá abajo.

### Resultado de la prueba

- **Fecha:**
- **¿Actualizó solo?:** SI / NO
- **¿Apareció popup?:** SI / NO
- **Observaciones:**

---

## PENDIENTES

| # | Tema | Prioridad | Notas |
|---|---|---|---|
| 1 | Verificar login automático del bot mañana | Alta | Ver sección "Estado del bot" |
| 2 | Leer `auditoria.html` | Baja | Solo lectura |
| 3 | `sb_secret_` en `.env` | Baja | Riesgo latente. Ver "Notas de seguridad" |
| 4 | Cosmético: `\n` literal en popup del bot | Baja | Aparece "\n" en vez de salto de línea |
| 5 | `package.json` con `"main": "index.js"` | Baja | No existe ese archivo. Ignorable |
| 6 | `reportes.js` congelado | Baja | No tocar sin pedido explícito |
| 7 | `test_recupero_radar.html` | Baja | Prototipo viejo. Se puede borrar |
| 8 | **Comentar los archivos `.js` con descripciones** | Media | Ver sección "Tarea extra" abajo |

---

## TAREA EXTRA: COMENTAR CÓDIGO

**Objetivo:** que cada archivo `.js` tenga al principio un bloque de comentario que explique:

- Qué hace el archivo.
- Qué módulo del dashboard alimenta.
- Qué tablas de Supabase lee o escribe.
- Qué funciones expone a `window` (si corresponde).

**Ejemplo de bloque a agregar al inicio de cada archivo:**

```js
// ====================================================
// MÓDULO: <nombre del módulo>
// DESCRIPCIÓN: <qué hace en 1 o 2 líneas>
// TABLAS QUE USA: <nombres>
// EXPONE EN WINDOW: <nombres de funciones globales>
// ====================================================

Archivos a comentar:

Archivo	Tiene encabezado?
js/core/config.js	SI (parcial)
js/core/auth.js	SI (parcial)
js/core/app.js	SI
js/modules/stock/stock.js	SI (parcial)
js/modules/stock/stock_insumos.js	SI (parcial)
js/modules/recupero/recupero.js	SI
js/modules/recupero/recupero_ui.js	SI
js/modules/recupero/recupero_actions.js	SI
js/modules/recupero/recupero_radar.js	SI
js/modules/tendencias/tendencias.js	SI
js/modules/auditoria/auditoria.js	SI
js/modules/auditoria/visor.js	SI
js/modules/referencias/referencias.js	SI
js/modules/admin/admin.js	SI
js/modules/ops/ops.js	SI
js/services/reportes.js	SI
Tarea concreta: completar el encabezado de cada archivo con las 4 líneas indicadas arriba (MÓDULO, DESCRIPCIÓN, TABLAS, EXPONE).

RESULTADO DE LA ÚLTIMA AUDITORÍA (2026-09-22)
Lo que se hizo
Área	Cambio
Seguridad	RLS activo en 13 tablas. 50 políticas por rol. Cero acceso anónimo
Credenciales	Centralizadas en js/core/config.js (antes en 10 archivos)
Bots	De 4 bots (2 roto, 1 duplicado) a 2 (1 automático, 1 manual)
Código muerto	Limpiado en stock.js, referencias.js, recupero_ui.js
Radar multisucursal	Módulo nuevo integrado en pestaña RECUPERO
Tablas huérfanas	4 tablas de prueba borradas
Duplicados en histórico	991 filas duplicadas limpiadas + UNIQUE agregado
Lo que quedó pendiente
7 hallazgos chicos (todos Baja salvo uno Medio).

Login automático del bot (en verificación).

HALLAZGOS ACTIVOS (sin arreglar)
#	Hallazgo	Archivo	Gravedad
1	4 copias de normalizar con distintos nombres	varios	Baja
2	renderAuditoriaTabla es código muerto	stock.js	Baja
3	window.EstadoStock.catrielCant nunca se asigna	stock.js	Baja
4	renderTablaRecuperoDiario recalcula lo mismo que recupero.js	recupero_ui.js	Media
5	itemsOrigenHoy y itemsTesteadosHoy nunca se asignan	recupero.js	Baja
6	auditoria_control_activo.auditor y auditor_nombre duplicados	DB	Baja
7	upsert de clasificación manda todos los ítems visibles	referencias.js	Baja
HALLAZGOS CERRADOS
~~Llave faltante en recupero_ui.js (window.toggle*)~~

~~obtenerInfoCatalogo no está en window~~

~~Duplicados internos en recupero_historico_equipos~~

~~cargarDatosUmbralesAlmacen duplicada~~

~~renderizarTablaReferencias/renderizarTablaUmbrales código muerto~~

~~tendencias.js descargaba todo stock_historico cada vez~~

~~Detección de superadmin por CSS en referencias.js~~

~~5 copias de SUPABASE_URL + SUPABASE_KEY~~

~~Otra copia de credenciales en admin.js~~

~~Límites silenciosos en tendencias (3000/10000)~~

NOTAS DE SEGURIDAD
Elemento	Estado
Frontend usa publishable key	OK. Es pública por diseño
Bots usan sb_secret_ en .env	OK. Es más poder del necesario, pero el .env está ignorado en Git
.env en .gitignore	OK
user_data/ en .gitignore	OK
RLS activo en todas las tablas	OK
Registro público de Supabase	Cerrado. Solo el admin crea usuarios
sb_secret_ en frontend	No está. Solo en .env de bots
Si alguna vez sospechás que la clave se filtró: Supabase → Settings → API → Rotate Secret Keys. Después actualizar .env.

ESTADO DE LA BASE DE DATOS
Tablas en public (13 activas)
Tabla	Rol
registro_stock	Foto actual del stock (bot vivo)
stock_historico	Foto diaria del stock (bot histórico)
catalogo_equipos	Catálogo de equipos ONUs
catalogo_insumos	Catálogo de insumos
config_stock_almacen	Umbrales (mín/PP/máx) por almacén
usuarios_permisos	Permisos de cada usuario
recupero_operativo	Equipos en mesa activa del laboratorio
recupero_historico_equipos	Equipos cerrados en cierres semanales
recupero_informes_semanales	Resúmenes semanales
auditoria_control_activo	Cabeceras de auditoría
auditoria_control_detalle	Detalle por modelo
auditoria_sucursales	Config de sucursales a auditar
Funciones y triggers
Objeto	Tipo	Detalle
es_superadmin()	Función	Usada por las políticas RLS
auto_clasificar_stock_historico()	Función	Deduce sucursal_id y tipo_almacen
trg_auto_clasificar_registro_stock	Trigger	Aplica a registro_stock
trg_auto_clasificar_stock_historico	Trigger	Aplica a stock_historico
Sucursales operativas
Código	Nombre
OBE	Oberá (Matriz)
SPD	San Pedro
WND	Wanda
ITU	Ituzaingó
ELDO	Eldorado
MÓDULOS LEÍDOS
Módulo	Estado	Hallazgos activos
stock.js	Leído	2
stock_insumos.js	Leído	1
recupero.js	Leído	2
recupero_ui.js	Leído	1
recupero_actions.js	Leído	0
recupero_radar.js	Nuevo	0
tendencias.js	Leído	1
referencias.js	Leído	1
admin.js	Leído	0
ops.js	Leído	0
app.js	Leído	0
auth.js	Leído	0
config.js	Nuevo	0
reportes.js	Congelado	No se audita
ops.html	Leído	0
index.html	Leído	0
auditoria.html	NO LEÍDO	Pendiente
test_recupero_radar.html	Prototipo viejo	Reemplazado
ARCHIVOS DEL PROYECTO
text
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
│       └── reportes.js                 Congelado
│
├── descargas_bot/                      CSV del bot (ignorado en Git)
├── user_data/                          Perfil Chrome (ignorado en Git)
└── node_modules/                       Ignorado en Git
PRÓXIMOS PASOS SUGERIDOS
Prioridad Alta
Verificar mañana si el bot automático logra loguearse solo (ver sección "Estado del bot").

Prioridad Media
Comentar los archivos .js con descripciones (ver sección "Tarea extra").

Arreglar hallazgo #4 (duplicación en recupero_ui.js). Requiere cuidado.

Prioridad Baja
Leer auditoria.html.

Decidir si borrar test_recupero_radar.html.

Revisar hallazgos chicos (#2, #3, #5, #6, #7).

NOTAS PARA FUTURAS SESIONES
No tocar reportes.js sin pedido explícito.

No tocar recupero_ui.js sin leerlo entero primero.

Antes de cambiar cualquier .js: verificar consola del navegador (F12).

Credenciales viven SOLO en js/core/config.js.

Antes de cambiar la base de datos: backup con select * from tabla.

Antes de cambiar políticas RLS: guardar pg_policies en un .txt.

FIN DEL DOCUMENTO