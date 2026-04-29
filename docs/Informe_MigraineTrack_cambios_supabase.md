# Cambios sugeridos en Word: `Informe MigraineTrack.docx`

Este documento resume el texto y la estructura propuestos en el plan `c:\Users\adfec\.cursor\plans\guía_backend_supabase_3d614b44.plan.md` para incorporarlos **manualmente** en `docs/Informe MigraineTrack.docx`.

**Nota sobre el plan original:** el plan describe cambios pensados para la guía generada por `scripts/generate-medical-doc.js` (`MigraineTrack_Guia_Medica.docx`). Si el informe usa otra numeración de apartados, adapta los números (p. ej. “2.3”) al lugar equivalente bajo **arquitectura funcional** o **backend / datos**, manteniendo el contenido.

---

## 1. Mensaje clínico a mantener coherente en el documento

Donde el informe hable de algoritmos y backend, alinear con esta idea (añadir o ajustar frases si hace falta):

- Los algoritmos (ICHD-3 B–D, CL, umbral, informe PDF) se ejecutan **en la app**.
- El backend **persiste** respuestas y parámetros derivados; **no** “calcula el diagnóstico” en servidor.

---

## 2. Nueva sección recomendada: infraestructura de datos y Supabase

**Ubicación:** justo después del bloque que corresponda a **módulos principales** de la arquitectura (en el plan: después de “§2.2 Módulos principales”). En el informe, colócala donde encaje el índice sin romper la lectura (idealmente dentro del capítulo de arquitectura que ya cite Supabase o persistencia).

**Título sugerido (Heading 2):**

`2.3 Infraestructura de datos y Supabase`  
*(Renumerar si en el informe el “2” no es arquitectura; lo importante es el título y el nivel de encabezado.)*

### 2.1 Párrafo introductorio

MigraineTrack utiliza [Supabase](https://supabase.com) como backend gestionado: PostgreSQL expuesto mediante API REST/Realtime, autenticación integrada (correo y contraseña, recuperación de contraseña) y políticas de seguridad a nivel de fila (RLS). La aplicación móvil se comunica con el proyecto Supabase mediante el cliente oficial y una clave pública “anon”; la sesión del usuario se conserva de forma cifrada en el almacenamiento local del dispositivo.

### 2.2 Subapartado — Qué corre en el dispositivo y qué en el servidor

**Título de subapartado sugerido:** *Qué corre en el dispositivo y qué en el servidor* (o equivalente breve).

**Texto:**

Los cuestionarios, la evaluación de migraña (score y `mayHaveMigraine`), el cálculo de carga de tensión, el umbral personalizado y la generación del PDF se ejecutan en el cliente. El servidor almacena las respuestas estructuradas, el historial diario de carga acumulada (CL), los puntos de entrenamiento del umbral y la configuración del usuario, de modo que los datos sobrevivan al cambio de dispositivo y queden acotados por identidad de usuario.

### 2.3 Subapartado — Tablas principales (alineadas al esquema)

**Título sugerido:** *Tablas principales* (o *Tablas principales (esquema)*).

Sustituir o completar listas genéricas por esta lista (tabla en Word o viñetas numeradas):

| Tabla | Descripción breve |
|--------|-------------------|
| `check_ins` | Episodios tipo `checkin` o `crisis`; campos `answers` (JSONB), `questions`, `date`, `end_date` para crisis cerradas. |
| `user_settings` | `headache_threshold` y campos opcionales de perfil (`name`, `sex`, `age` si se desea mencionar). |
| `cl_history` | Un valor de CL por (usuario, fecha) en formato fecha. |
| `threshold_data` | Valores de CL en días con cefalea no clasificada como migraña probable, para recalcular el umbral. |

*(En Word puedes usar fuente monoespaciada para los nombres de tablas y campos, p. ej. Consolas, como en el plan para el script de la guía.)*

### 2.4 Subapartado — Aislamiento entre usuarios (RLS)

**Título sugerido:** *Aislamiento entre usuarios (RLS)*.

**Texto:**

En todas las tablas anteriores, RLS exige que `auth.uid()` coincida con `user_id`: cada paciente solo puede leer, crear, actualizar y borrar sus propias filas. Esto es lo que el documento ya puede resumir como “RLS por usuario”; aquí se explicita el mecanismo para lectores técnicos.

### 2.5 Opcional — Ciclo de vida de la cuenta (Edge Function)

**Una nota breve** (si encaja sin alargar demasiado):

Si la organización despliega una Edge Function para borrado de cuenta, puede citarse como mecanismo de baja que elimina el usuario de autenticación (y, por `ON DELETE CASCADE`, los datos asociados), sin entrar en detalle de despliegue.

### 2.6 Opcional — Caja de nota (notificaciones)

**Nota al pie o recuadro:**

Las notificaciones de check-in son locales (`expo-notifications`); no implican envío de contenido clínico a un servidor para “empujar” el recordatorio.

---

## 3. Referencias cruzadas y diagrama (opcional)

### 3.1 Acortar la sección de persistencia / privacidad y remitir a la nueva §

**Opcional:** Si el informe tiene un apartado largo equivalente a “§9 Persistencia y privacidad” de la guía, acortar la parte repetida (auth, RLS, lista de tablas) a una línea y añadir remisión explícita, por ejemplo: *“Ver §2.3”* (ajustar número al definitivo del informe).

### 3.2 Diagrama de flujo (opcional)

El plan incluye un diagrama mermaid (dispositivo ↔ Supabase). Si quieres equivalente en Word: insertar un esquema simple con dos bloques (“Dispositivo”: UI, algoritmos y PDF; “Supabase”: Auth y PostgreSQL + RLS) y una flecha “REST anon + JWT” del dispositivo a PostgreSQL, más la sesión desde Auth al dispositivo.

---

## 4. Completar “vacíos” que el plan identifica

Comprobar que el informe, tras los cambios, cubra explícitamente:

1. **Separación cliente/servidor** (quién calcula vs quién guarda).
2. **Modelo de tablas** al nivel de auditoría (nombres reales: `check_ins`, `cl_history`, etc., coherentes con migraciones).
3. **Rol del cliente anon** frente a RLS (clave pública, sesión en dispositivo).

El resumen ejecutivo puede seguir con **una frase** sobre backend Supabase (PostgreSQL + RLS); la nueva sección desarrolla el detalle.

---

## 5. Resumen checklist

- [ ] Añadir sección **Infraestructura de datos y Supabase** tras módulos/arquitectura equivalente.
- [ ] Párrafo introductorio Supabase + anon + sesión local cifrada.
- [ ] Subapartado dispositivo vs servidor (algoritmos en cliente; persistencia en servidor).
- [ ] Lista/tabla: `check_ins`, `user_settings`, `cl_history`, `threshold_data`.
- [ ] Subapartado RLS (`auth.uid()` = `user_id`).
- [ ] (Opcional) Nota Edge Function borrado de cuenta.
- [ ] (Opcional) Nota notificaciones locales, sin backend clínico para push.
- [ ] (Opcional) Acortar persistencia/privacidad y enlace a la nueva sección.
- [ ] Revisar coherencia: algoritmos en app, backend solo persiste.
