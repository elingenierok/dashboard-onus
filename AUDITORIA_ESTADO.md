# Estado de la auditoría del dashboard-onus_test

## Cerrado (ya hecho)

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
| 2026-09-22 | Unificado `bot_vivo.js` | Stock vivo + histórico + popup con check |
| 2026-09-22 | Creado `bot_vivo_manual.js` + `.bat` | Bot manual para desbloquear |
| 2026-09-22 | RLS activo en 3 tablas | Antes sin RLS |
| 2026-09-22 | Políticas RLS reescritas | 50 políticas nuevas por comando y rol |
| 2026-09-22 | Función `es_superadmin()` creada | Para las políticas |
| 2026-09-22 | Índices agregados a `stock_historico` | fecha, codigo, unique |
| 2026-09-22 | `registro_stock` con sucursal_id + tipo_almacen | + trigger |
| 2026-09-22 | Fix del default `OBE` | Ahora el trigger deduce bien |
| 2026-09-22 | Borradas columnas redundantes de `auditoria_control_detalle` | cantidad_sistema, cantidad_fisica, auditoria_id |
| 2026-09-22 | `.gitignore` actualizado | descargas_bot, *.csv, *.zip |
| 2026-09-22 | Fix `recupero_ui.js` | Llave `}` faltante en `actualizarGraficoRecuperoDiario` |
| 2026-09-22 | Fix `recupero.js` | `obtenerInfoCatalogo` expuesto en `window` |
| 2026-09-22 | Leído HTML del laboratorio (`ops.html`) y `ops.js` | Análisis completo del flujo de carga y prueba |
| 2026-09-22 | Limpieza de `recupero_historico_equipos` | 991 duplicados borrados, quedan 1397 únicos |
| 2026-09-22 | UNIQUE en `recupero_historico_equipos.sn` | Previene duplicados futuros |
| 2026-09-22 | Fix `recupero_actions.js` | Anti-doble-click + borrar del histórico antes de reinsertar (opción A) |
| 2026-09-22 | Leído `tendencias.js` | Sin bugs críticos. Performance futura anotada |
| 2026-09-22 | Leído `referencias.js` | Detectada función duplicada, filtros de UMBRALES rotos |
| 2026-09-22 | Fix `referencias.js` | Borrada función duplicada y código muerto. Filtros de UMBRALES funcionan |
| 2026-09-22 | Leído `admin.js` | Sin bugs. Módulo sano |
| 2026-09-22 | Fix `tendencias.js` | Filtrar últimos 3 meses en `descargarHistorialCompleto` |
| 2026-09-22 | Fix `referencias.js` | Detección de superadmin por `window.PERMISOS_ACTUALES` en vez de CSS |

## Resumen de lectura de módulos

| Módulo | Estado | Hallazgos |
|---|---|---|
| `stock.js` | ✅ Leído | 2 activos (código muerto, var sin asignar) |
| `stock_insumos.js` | ✅ Leído | 1 (duplicación menor) |
| `recupero.js` | ✅ Leído | 2 (items huérfanos, reasignación) |
| `recupero_ui.js` | ✅ Leído | 2 (uno cerrado, uno de duplicación) |
| `recupero_actions.js` | ✅ Leído | 0 |
| `tendencias.js` | ✅ Leído | 1 activo (límites silenciosos) |
| `referencias.js` | ✅ Leído | 1 activo (upsert masivo) |
| `admin.js` | ✅ Leído | 1 activo (copia de credenciales) |
| `ops.js` | ✅ Leído | 0 |
| `reportes.js` | ⏸️ Congelado | No se audita |
| `app.js` | ✅ Leído | 0 |
| `auth.js` | ✅ Leído | 0 |

## Pendientes

| # | Tema | Prioridad |
|---|---|---|
| 1 | Leer HTMLs (`index.html`, `auditoria.html`) | Baja |
| 2 | `sb_secret_` en `.env` | Baja (riesgo latente) |
| 3 | Cosmético: `\n` en popup, `package.json` | Baja |
| 4 | `reportes.js` congelado | Baja |

## Hallazgos detectados (sin arreglar)

| # | Hallazgo | Archivo | Gravedad |
|---|---|---|---|
| 1 | 5 copias de SUPABASE_URL + SUPABASE_KEY en el proyecto | varios | Media |
| 2 | 4 copias de la función `normalizar` con distintos nombres | varios | Baja |
| 3 | `renderAuditoriaTabla` es código muerto | stock.js | Baja |
| 4 | `window.EstadoStock.catrielCant` nunca se asigna | stock.js | Baja |
| 5 | `renderTablaRecuperoDiario` recalcula lo mismo que recupero.js | recupero_ui.js | Media |
| 6 | `itemsOrigenHoy` y `itemsTesteadosHoy` nunca se asignan | recupero.js | Baja |
| 7 | `auditoria_control_activo.auditor` y `auditor_nombre` duplicados | DB | Baja |
| 8 | `cargarListaInsumosUnicos` (3000) y `popularAlmacenesEspecificos` (10000) limitan sin avisar | tendencias.js | Media |
| 9 | `upsert` de clasificación manda todos los ítems visibles, no solo los modificados | referencias.js | Baja |

## Cerrados en la sección de hallazgos

- ~~Llave faltante → `window.toggle*` no se definen~~ (resuelto 2026-09-22)
- ~~`obtenerInfoCatalogo` no está en `window`~~ (resuelto 2026-09-22)
- ~~Duplicados internos en `recupero_historico_equipos`~~ (resuelto 2026-09-22)
- ~~`cargarDatosUmbralesAlmacen` duplicada → filtros de UMBRALES no funcionan~~ (resuelto 2026-09-22)
- ~~`renderizarTablaReferencias`/`renderizarTablaUmbrales` es código muerto~~ (resuelto 2026-09-22)
- ~~`tendencias.js` descarga todo `stock_historico` cada vez~~ (resuelto 2026-09-22)
- ~~Detección de superadmin por CSS en referencias.js~~ (resuelto 2026-09-22)

## Próximos pasos sugeridos

1. Atacar hallazgos de prioridad Media.
2. Leer HTMLs (`index.html`, `auditoria.html`) — pendiente #1.
3. Revisar hallazgos menores cuando haya tiempo.