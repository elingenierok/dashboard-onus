# 🗺️ MAPA MAESTRO DEL SISTEMA (DASHBOARD ONUs)

Este documento registra la arquitectura, tablas de base de datos y reglas de negocio del sistema para garantizar la continuidad del proyecto a largo plazo.

---

## 🏛️ REGIONALIZACIÓN MULTISUCURSAL
- **Principio de Aislamiento:** Toda transacción de datos (carga, visualización, cierre semanal) se filtra por la variable activa `window.SUCURSAL_FILTRO_ACTIVA`.
- **Fallback Automático:** Si un registro histórico o perfil de usuario no posee sucursal declarada, el sistema asigna por defecto `'OBE'` (Oberá) para garantizar retrocompatibilidad.
- **Códigos de Sucursal Estandarizados:**
  - `OBE`: Oberá (Matriz)
  - `SPD`: San Pedro
  - `TODAS`: Vista Consolidada Global (Exclusivo SuperAdmin)

---

## 🗄️ ESTRUCTURA DE BASE DE DATOS (SUPABASE)

### 1. `usuarios_permisos`
- `id` (uuid, PK)
- `email` (text)
- `nombre_completo` (text)
- `es_superadmin` (bool)
- `sucursal_asignada` (text, default `'OBE'`)
- Booleans de Permisos: `ver_kpi_estrategicos`, `ver_costos_usd`, `acceso_auditoria`, `ver_recupero`, `acceso_reportes`.

### 2. `recupero_operativo` (Mesa Activa de Trabajo)
- `id` (uuid, PK)
- `fecha_ingreso` (timestamp)
- `sn` (text)
- `descripcion` (text)
- `condicion` (text - ej: 'PENDIENTE', 'CIRCULACIÓN', 'DESCARTE')
- `tecnico` (text)
- `almacen_origen` (text)
- `observaciones` (text)
- `inicio_prueba` / `fin_prueba` (timestamp)
- `tiempo_prueba_seg` / `tiempo_espera_hs` (numeric)
- `sucursal_id` (text, default `'OBE'`) ⚠️ **Filtro Clave**

### 3. `recupero_historico_equipos` (Archivo de Equipos Procesados)
- Contiene los mismos campos de `recupero_operativo` transferidos tras cada cierre semanal + `sucursal_id`.

### 4. `recupero_informes_semanales` (Consolidado de Cierre)
- `semana_label` (text)
- `total_recibidos`, `en_circulacion`, `descarte_vip`, `descarte_obsoleto` (int)
- `valor_recuperado_usd` (numeric)
- `desglose_operativo` (jsonb)
- `sucursal_id` (text)

### 5. `catalogo_equipos` (Maestro de Modelos)
- `modelo` (text), `modelo_norm` (text), `es_vip` (bool), `precio_usd` (numeric), `imagen_url` (text).

---

## 📁 ESTRUCTURA MODULAR EJECUTADA

```text
📁 js/
├── 📁 core/
│   ├── app.js             # Estado global, orquestación y eventos del DOM
│   └── auth.js            # Autenticación, sesión y restricciones por rol
├── 📁 services/
│   └── reportes.js        # Compilación de PDF y vista previa A4
└── 📁 modules/
    ├── 📁 recupero/       # recupero.js, recupero_ui.js, recupero_actions.js
    ├── 📁 stock/          # stock.js
    ├── 📁 tendencias/     # tendencias.js
    ├── 📁 ops/            # ops.js (Suite Operativa)
    └── 📁 admin/          # admin.js (Gestión de Usuarios y Lead Time)