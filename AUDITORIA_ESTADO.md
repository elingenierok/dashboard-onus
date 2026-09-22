# Estado de la auditoría del dashboard-onus_test

> **Última actualización:** 2026-09-22
> **Estado:** Pausado. Proyecto estable y auditado. Sin bugs críticos pendientes.

---

## CÓMO RETOMAR EL TRABAJO

1. **Leer este archivo completo** antes de tocar nada.
2. **Empezar por la sección "Próximos pasos sugeridos"** al final.
3. **Antes de cada cambio:** abrir el archivo, leerlo entero, entender qué hace, después modificar.
4. **Después de cada cambio:** recargar el dashboard con `Ctrl + F5`, verificar la pestaña correspondiente, y actualizar este `.md`.
5. **Si algo se rompe:** revisar la consola del navegador (F12 → Console) primero. Casi siempre dice qué archivo y qué línea falló.

---

## Cerrado (ya hecho)

### Eliminaciones y limpieza

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-21 | Borrado `bot_precios.js` | Apuntaba a tabla inexistente |
| 2026-09-21 | Borrado `cargar_precios.js` | Duplicado manual del anterior |
| 2026-09-21 | Borrado `server.js` | Llamaba a `bot.js` inexistente |
| 2026-09-21 | Borrado `bot_historico.js` | Unificado en `bot_vivo.js` |
| 2026-09-21 | Borrado `bot_vivo.js.old` | Ya no hacía falta |
| 2026-09-21 | Tarea del Programador del histórico | Borrada |
| 2026-09-22 | Borrada tabla `stock_historico_test` | 16 filas de prueba |
| 2026-09-22 | Borrada tabla `stock_moviles` | 2 filas de prueba |
| 2026-09-22 | Borrada tabla `comunicaciones` | 0 filas, huérfana |
| 2026-09-22 | Borrada tabla `registro_recupero` | 22 filas huérfanas |

### Bots y automatización

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-22 | Unificado `bot_vivo.js` | Stock vivo + histórico + popup con check |
| 2026-09-22 | Creado `bot_vivo_manual.js` + `.bat` | Bot manual para desbloquear sesión del ISP |

### Base de datos (seguridad y estructura)

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-22 | RLS activo en 3 tablas | Antes sin RLS |
| 2026-09-22 | Políticas RLS reescritas | 50 políticas nuevas por comando y rol |
| 2026-09-22 | Función `es_superadmin()` creada | Para las políticas |
| 2026-09-22 | Índices agregados a `stock_historico` | fecha, codigo, unique |
| 2026-09-22 | `registro_stock` con `sucursal_id` + `tipo_almacen` | + trigger |
| 2026-09-22 | Fix del default `OBE` | Ahora el trigger deduce bien |
| 2026-09-22 | Borradas columnas redundantes de `auditoria_control_detalle` | cantidad_sistema, cantidad_fisica, auditoria_id |
| 2026-09-22 | Limpieza de `recupero_historico_equipos` | 991 duplicados borrados, quedan 1397 únicos |
| 2026-09-22 | UNIQUE en `recupero_historico_equipos.sn` | Previene duplicados futuros |

### Código del frontend

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-22 | Fix `recupero_ui.js` | Llave `}` faltante en `actualizarGraficoRecuperoDiario` |
| 2026-09-22 | Fix `recupero.js` | `obtenerInfoCatalogo` expuesto en `window` |
| 2026-09-22 | Fix `recupero_actions.js` | Anti-doble-click + borrar del histórico antes de reinsertar |
| 2026-09-22 | Fix `referencias.js` | Borrada función duplicada y código muerto |
| 2026-09-22 | Fix `referencias.js` | Detección de superadmin por `window.PERMISOS_ACTUALES` |
| 2026-09-22 | Fix `tendencias.js` | Filtrar últimos 3 meses en `descargarHistorialCompleto` |
| 2026-09-22 | Fix `tendencias.js` | Subir límites de autocompletado (3000→10000, 10000→20000) + avisos |
| 2026-09-22 | `.gitignore` actualizado | descargas_bot, *.csv, *.zip |

### Centralización de credenciales

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-22 | Creado `js/core/config.js` | Credenciales centralizadas en `window.APP_CONFIG` |
| 2026-09-22 | Unificadas credenciales en 10 archivos | URL y KEY solo viven en `config.js` |
| 2026-09-22 | `index.html` y `ops.html` cargan `config.js` antes de `auth.js` | — |

### Radar Multisucursal (nuevo módulo)

| Fecha | Acción | Detalle |
|---|---|---|
| 2026-09-22 | Creado `js/modules/recupero/recupero_radar.js` | Comparativo multisucursal con 4 gráficos radar |
| 2026-09-22 | `index.html` con sección radar | Botón desplegable dentro de pestaña RECUPERO |

---

## Resumen de lectura de módulos

| Módulo | Estado | Hallazgos activos |
|---|---|---|
| `stock.js` | ✅ Leído | 2 (código muerto, var sin asignar) |
| `stock_insumos.js` | ✅ Leído | 1 (duplicación menor) |
| `recupero.js` | ✅ Leído | 2 (items huérfanos, reasignación) |
| `recupero_ui.js` | ✅ Leído | 1 (duplicación de cálculo) |
| `recupero_actions.js` | ✅ Leído | 0 |
| `recupero_radar.js` | ✅ Nuevo | 0 |
| `tendencias.js` | ✅ Leído | 1 (upsert masivo de referencias) |
| `referencias.js` | ✅ Leído | 1 (upsert masivo) |
| `admin.js` | ✅ Leído | 0 |
| `ops.js` | ✅ Leído | 0 |
| `app.js` | ✅ Leído | 0 |
| `auth.js` | ✅ Leído | 0 |
| `config.js` | ✅ Nuevo | 0 |
| `reportes.js` | ⏸️ Congelado | No se audita |
| `ops.html` | ✅ Leído | 0 |
| `index.html` | ✅ Leído | 0 |
| `auditoria.html` | ❌ No leído | Pendiente |
| `test_recupero_radar.html` | ⏸️ Prototipo viejo | Reemplazado por `recupero_radar.js` |

---

## Pendientes

| # | Tema | Prioridad | Notas para retomar |
|---|---|---|---|
| 1 | Leer `auditoria.html` | Baja | Solo lectura. Verificar qué carga y si está alineado con `auditoria.js` |
| 2 | `sb_secret_` en `.env` de bots | Baja | Riesgo latente. No urgente. Ver "Notas de seguridad" abajo |
| 3 | Cosmético: `\n` en popup del bot | Baja | Los `\n` aparecen como texto literal en vez de saltos de línea |
| 4 | `package.json` con `"main": "index.js"` | Baja | No existe ese archivo. Ignorable |
| 5 | `reportes.js` congelado | Baja | Módulo parado por el usuario. No tocar sin pedido explícito |
| 6 | `test_recupero_radar.html` | Baja | Prototipo viejo. Se puede borrar o dejar |

---

## Hallazgos detectados (sin arreglar)

| # | Hallazgo | Archivo | Gravedad | Notas para retomar |
|---|---|---|---|---|
| 1 | 4 copias de `normalizar` con distintos nombres | varios | Baja | `window.normalizar`, `normalizar` local, `normalizarTextoAud`, `normalizarTexto` |
| 2 | `renderAuditoriaTabla` es código muerto | stock.js | Baja | Solo se define, nadie la llama. Se puede borrar |
| 3 | `window.EstadoStock.catrielCant` nunca se asigna | stock.js | Baja | Variable muerta |
| 4 | `renderTablaRecuperoDiario` recalcula lo mismo | recupero_ui.js | Media | **Ojo:** `recupero_ui.js` es el archivo más grande. Cambiar con cuidado |
| 5 | `itemsOrigenHoy` y `itemsTesteadosHoy` nunca se asignan | recupero.js | Baja | Los fallbacks a otros arrays hacen que funcione igual |
| 6 | `auditoria_control_activo.auditor`/`auditor_nombre` duplicados | DB | Baja | Tienen el mismo valor. Unificar requiere cambio de código |
| 7 | `upsert` de clasificación manda todos los ítems visibles | referencias.js | Baja | Ineficiente pero funcional |

---

## Cerrados en la sección de hallazgos

- ~~Llave faltante → `window.toggle*` no se definen~~
- ~~`obtenerInfoCatalogo` no está en `window`~~
- ~~Duplicados internos en `recupero_historico_equipos`~~
- ~~`cargarDatosUmbralesAlmacen` duplicada~~
- ~~`renderizarTablaReferencias`/`renderizarTablaUmbrales` es código muerto~~
- ~~`tendencias.js` descarga todo `stock_historico` cada vez~~
- ~~Detección de superadmin por CSS en referencias.js~~
- ~~5 copias de SUPABASE_URL + SUPABASE_KEY~~
- ~~Otra copia de credenciales en admin.js~~
- ~~Límites silenciosos en tendencias (3000/10000)~~

---

## Notas de seguridad

### Estado actual (2026-09-22)

| Elemento | Estado |
|---|---|
| Frontend usa `publishable key` | ✅ Correcto. Es pública por diseño |
| Bots usan `sb_secret_` en `.env` | ⚠️ Funciona, pero es más poder del necesario |
| `.env` en `.gitignore` | ✅ Nunca se subió a Git |
| `user_data/` en `.gitignore` | ✅ |
| RLS activo en todas las tablas | ✅ |
| Políticas RLS por rol | ✅ 50 políticas |
| Registro público de Supabase | ✅ Cerrado. Solo el admin puede crear usuarios |
| `service_role` / `sb_secret_` en frontend | ✅ No está. Solo en `.env` de bots |

### Sobre el `sb_secret_` de los bots (pendiente #2)

**Riesgo:** bajo (el `.env` está ignorado en Git y no se sirve al navegador).
**Recomendación:** dejarlo como está por ahora. Si algún día migrás a otra base de datos o compartís el proyecto con más gente, evaluar crear un "usuario bot" en Supabase Auth con permisos limitados a `registro_stock` y `stock_historico`.
**Si alguna vez sospechás que se filtró:** Supabase → Settings → API → Rotate Secret Keys. Después actualizar `.env`.

---

## Estado de la base de datos

### Tablas en `public` (13 activas)

| Tabla | Rol |
|---|---|
| `registro_stock` | Foto actual del stock (bot vivo) |
| `stock_historico` | Foto diaria del stock (bot histórico) |
| `catalogo_equipos` | Catálogo de equipos ONUs |
| `catalogo_insumos` | Catálogo de insumos |
| `config_stock_almacen` | Umbrales (mín/PP/máx) por almacén |
| `usuarios_permisos` | Permisos de cada usuario |
| `recupero_operativo` | Equipos en mesa activa del laboratorio |
| `recupero_historico_equipos` | Equipos cerrados en cierres semanales |
| `recupero_informes_semanales` | Resúmenes semanales |
| `auditoria_control_activo` | Cabeceras de auditoría |
| `auditoria_control_detalle` | Detalle por modelo |
| `auditoria_sucursales` | Config de sucursales a auditar |

### Funciones y triggers

| Objeto | Tipo | Detalle |
|---|---|---|
| `es_superadmin()` | Función | Usada por las políticas RLS |
| `auto_clasificar_stock_historico()` | Función | Deduce `sucursal_id` y `tipo_almacen` |
| `trg_auto_clasificar_registro_stock` | Trigger | Aplica a `registro_stock` |
| `trg_auto_clasificar_stock_historico` | Trigger | Aplica a `stock_historico` |

### Sucursales operativas

| Código | Nombre |
|---|---|
| OBE | Oberá (Matriz) |
| SPD | San Pedro |
| WND | Wanda |
| ITU | Ituzaingó |
| ELDO | Eldorado |

---

## Próximos pasos sugeridos

### Si querés seguir mejorando el proyecto

1. **Leer `auditoria.html`** (pendiente #1). Solo lectura. Verificar que no tenga credenciales hardcodeadas ni código muerto.
2. **Decidir qué hacer con `test_recupero_radar.html`** (pendiente #6). Es un prototipo viejo. Se puede borrar.
3. **Revisar los hallazgos chicos** (#2, #3, #5, #6, #7). Son cosméticos. Ninguno rompe nada.

### Si querés arreglar algo más profundo

4. **Hallazgo #4** (duplicación en `recupero_ui.js`). Es el último de prioridad Media. Requiere refactor cuidadoso.

### Si querés cerrar la auditoría

5. Hacer un informe final consolidado con todo lo hecho y lo pendiente. Este `.md` ya sirve como base.

---

## Notas importantes para futuras sesiones

- **No tocar `reportes.js`** sin pedido explícito. Está congelado por el usuario.
- **No tocar `recupero_ui.js`** sin leerlo entero primero. Es el archivo más grande y delicado.
- **Antes de cambiar cualquier `.js`:** verificar la consola del navegador (F12) al recargar.
- **Cada cambio de credenciales:** recordar que ahora viven SOLO en `js/core/config.js`.
- **Cada cambio de base de datos:** hacer backup con `select * from tabla` antes de tocar.
- **Cada cambio de políticas RLS:** guardar el resultado de `pg_policies` en un `.txt` antes de tocar.

---

## Archivos del proyecto (estado actual)
dashboard-onus_test/
├── index.html ← dashboard principal
├── ops.html ← suite operativa (laboratorio)
├── auditoria.html ← ❌ no leído
├── test_recupero_radar.html ← prototipo viejo (reemplazado por recupero_radar.js)
├── bot_vivo.js ← bot automático (stock + histórico)
├── bot_vivo_manual.js ← bot manual (desbloqueo)
├── ejecutar_manual.bat ← lanzador del bot manual
├── package.json ← dependencias
├── package-lock.json
├── .env ← credenciales de bots (NO en Git)
├── .gitignore ← user_data, node_modules, .env, descargas_bot, *.csv
├── .nojekyll
├── stockactual.csv ← excluido del .gitignore
├── AUDITORIA_ESTADO.md ← este archivo
├── js/
│ ├── core/
│ │ ├── config.js ← NUEVO: credenciales centralizadas
│ │ ├── auth.js
│ │ └── app.js
│ ├── modules/
│ │ ├── stock/
│ │ │ ├── stock.js
│ │ │ └── stock_insumos.js
│ │ ├── recupero/
│ │ │ ├── recupero.js
│ │ │ ├── recupero_ui.js
│ │ │ ├── recupero_actions.js
│ │ │ └── recupero_radar.js ← NUEVO: radar multisucursal
│ │ ├── tendencias/
│ │ │ └── tendencias.js
│ │ ├── auditoria/
│ │ │ ├── auditoria.js
│ │ │ └── visor.js
│ │ ├── referencias/
│ │ │ └── referencias.js
│ │ ├── admin/
│ │ │ └── admin.js
│ │ └── ops/
│ │ └── ops.js
│ └── services/
│ └── reportes.js ← congelado
├── descargas_bot/ ← CSV del bot (ignorado en Git)
├── user_data/ ← perfil de Chrome del bot (ignorado en Git)
└── node_modules/ ← ignorado en Git


---

## Changelog de sesiones

### Sesión 2026-09-21 (inicio)
- Auditoría inicial. Lectura de archivos principales.
- Identificación de problemas: `server.js` roto, `bot_precios.js` roto, 3 bots duplicados.

### Sesión 2026-09-22 (principal)
- Unificación de bots.
- Reescritura de políticas RLS.
- Limpieza de tablas huérfanas.
- Centralización de credenciales en `config.js`.
- Creación del radar multisucursal.
- Arreglo de múltiples bugs en `recupero_ui.js`, `referencias.js`, `tendencias.js`, `recupero_actions.js`.

---

**FIN DEL DOCUMENTO**