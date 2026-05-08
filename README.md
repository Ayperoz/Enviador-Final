# Enviador WhatsApp

Plataforma base para administrar envíos masivos de WhatsApp utilizando una API en Node.js y una interfaz web en React. Esta versión integra autenticación, layout principal y administración de canales con sesiones reales gestionadas por Baileys, incluyendo generación y almacenamiento de códigos QR.

## Requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 13+

## Configuración del backend

1. Instala dependencias:

   ```bash
   cd backend
   npm install
   ```

2. Crea el archivo `.env` a partir del ejemplo:

   ```bash
   cp .env.example .env
   ```

   Ajusta `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` y `JWT_SECRET` según tu entorno. Si prefieres seguir usando una cadena de conexión, puedes definir `DATABASE_URL` y se utilizará en lugar de los parámetros individuales.

3. Inicializa la base de datos (crea tablas `users`, `channels` y `campains`):

   ```bash
   npm run init:db
   ```

4. Crea o actualiza un usuario para iniciar sesión:

   ```bash
   npm run seed:user
   ```

   El script solicitará usuario y contraseña y almacenará el hash en la tabla `users`.

5. Inicia la API:

   ```bash
   npm run dev
   ```

   El servidor expone los endpoints bajo `http://localhost:3001/api`.

## Configuración del frontend

1. Instala dependencias:

   ```bash
   cd frontend
   npm install
   ```

2. Crea el archivo `.env` a partir del ejemplo:

   ```bash
   cp .env.example .env
   ```

   Ajusta `VITE_API_BASE_URL` si tu backend corre en otra URL y utiliza `VITE_FRONTEND_URL`/`VITE_FRONTEND_PORT` para indicar host y puerto deseados (por ejemplo `http://192.168.1.60:3000`).

3. Inicia el entorno de desarrollo:

   ```bash
   npm run dev
   ```

   La aplicación estará disponible en `http://localhost:3000`.

## Funcionalidades actuales

- Login con usuario/contraseña almacenados en PostgreSQL y contraseña cifrada con scrypt.
- Layout con encabezado superior, menú lateral y paleta azul (#040040) y blanco (#FFFFFF).
- Gestión de canales con creación, edición, eliminación, desconexión y control de sesiones Baileys (QR dinámico, reconexiones y regeneración).
- Administración de campañas con formulario completo (canal activo, tiempos en segundos, base 1-9, horarios por día) y listado con edición, eliminación y activación/desactivación.
- Pestañas de Datos, Reportes y Monitor con mensaje "en construcción".
- Automatizar la orquestación de campañas masivas y envío segmentado.
- Completar los módulos de campañas, datos, reportes y monitor.

## Próximos pasos sugeridos

- Añadir control de roles y auditoría.
- Implementar pruebas automatizadas y despliegues.
