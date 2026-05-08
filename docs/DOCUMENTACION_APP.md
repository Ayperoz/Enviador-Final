# Documentación funcional - Enviador Web

## 1. Arquitectura general

La aplicación está dividida en dos módulos principales:

- **Frontend (React + Vite):** interfaz de operación para canales, campañas, monitoreo, reportes y configuración.
- **Backend (Node.js + Express + PostgreSQL):** API REST, autenticación, reglas de negocio y persistencia.

## 2. Módulos backend

### 2.1 Autenticación y sesión
- `authController.login`: valida credenciales, genera JWT y registra `active_session_id` para permitir una sola sesión por usuario.
- `authMiddleware`: valida token y compara `sessionId` del token contra la sesión activa en base.

### 2.2 Usuarios y roles
- `userController`: perfil propio, administración de usuarios, control de roles (`admin`, `user`) y preferencias de notificación.
- Solo usuarios `admin` pueden acceder a endpoints de administración.

### 2.3 Canales
- `channelController`: alta, edición, baja, desconexión, regeneración de QR y arranque de calentador.
- Integra con `whatsappService` para levantar sesiones de WhatsApp por canal.

### 2.4 Configuración central
- `settingsController`: gestiona límites operativos en `.env`:
  - `CANT_CHANNELS`
  - `CANT_CALENTADORES`
  - `CANT_CAMPAINS`
  - `NORMALIZER_VISIBLE`

### 2.5 Campañas, reportes y datos
- `campaignController`, `reportController`, `dataController` exponen la lógica de ejecución y consulta histórica.

## 3. Módulos frontend

### 3.1 Flujo de autenticación
- `AuthContext` mantiene el estado del usuario, token, sesión y timeouts.
- `axios` centraliza llamadas y emite evento ante `401` para cierre de sesión forzado.

### 3.2 Navegación por permisos
- Sidebar y rutas muestran contenido según rol.
- Pestaña **Configuración** visible solo para `admin`.

### 3.3 Pantalla Configuración
- Ajuste de límites del sistema.
- Gestión de usuarios: crear, editar, eliminar.
- Control de visibilidad de la pestaña normalizador.

## 4. Variables de entorno

### 4.1 Backend (`backend/.env`)
- Base principal: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- API: `PORT`, `BACKEND_URL`
- Calentador: `CAL_HOST`, `CAL_PORT`, `CAL_USER`, `CAL_PASS`, `CAL_NAME`
- Tiempos: `CAL_TINICIAL`, `CAL_TMIN`, `CAL_TMAX`
- Límites: `CANT_CHANNELS`, `CANT_CAMPAINS`, `CANT_CALENTADORES`
- Seguridad: `JWT_SECRET`

### 4.2 Frontend (`frontend/.env`)
- `VITE_FRONTEND_URL`
- `VITE_FRONTEND_PORT`
- `VITE_API_BASE_URL`
- `BACKEND_URL`

## 5. Scripts de build y ejecución

### Backend
- `npm run build`: empaqueta `src` en `dist`.
- `npm start`: ejecuta en modo producción usando `dist/index.js`.

### Frontend
- `npm run build`: genera estáticos en `build`.
- `npm start`: sirve la build con `serve -s build -p 3000`.

## 6. Recomendaciones operativas

1. Mantener `JWT_SECRET` robusto por entorno.
2. Versionar `.env` solo como ejemplos (`.env.example`).
3. Validar límites (`canales`, `calentadores`, `campañas`) antes de cada despliegue.
4. Ejecutar build de frontend/backend en CI antes de publicar.

## 7. Inventario de funciones clave (resumen)

- **Autenticación:** `login`
- **Canales:** `listChannels`, `createChannel`, `updateChannel`, `deleteChannel`, `disconnectChannel`, `regenerateQr`, `startWarmup`, `getQr`
- **Configuración:** `getSettings`, `updateSettings`
- **Usuarios:** `getCurrentUser`, `updateCurrentUser`, `listUsers`, `createUser`, `updateUser`, `deleteUser`

---
Documento generado para soporte operativo y traspaso técnico.
