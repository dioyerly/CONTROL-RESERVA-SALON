# Privacidad de los datos de clientes

## Estado actual (primera etapa)

Esta versión **reduce la exposición desde la pantalla**, pero **no ofrece privacidad real**.

Qué hace:

- **Consulta de reserva:** pide código de reserva y teléfono. Si uno de los dos no coincide, muestra el mismo mensaje genérico, sin revelar cuál falló.
- **Teléfonos:** se comparan normalizados. El mismo número escrito en distintos formatos argentinos coincide (por ejemplo `+54 9 11 5555-4444` y `011 15 5555-4444`). Números distintos no coinciden, aunque compartan los últimos dígitos.
- **Pantalla del cliente:** recibe solo la agenda ocupada (horarios, servicios y profesional), sin nombres, teléfonos, emails, notas ni códigos de otros clientes.

Qué no hace:

- **No es privacidad real.** Todos los turnos, con sus teléfonos y nombres, siguen guardados en `localStorage` del navegador. Cualquiera con herramientas de desarrollo en ese navegador puede leerlos.
- **La verificación ocurre en el navegador.** Quien pueda leer el almacenamiento puede ver el teléfono esperado.
- **No hay límite de intentos.** Sin servidor no se puede limitar la fuerza bruta sobre los códigos.
- **La regla "un cliente, un turno a la vez" no se aplica en la pantalla del cliente.** Para verificarla hace falta el teléfono de los demás turnos, que ya no se envía a esa pantalla. Esa regla tiene que moverse al backend.

## Qué requiere backend

Antes de presentar la app como segura para clientes reales, hace falta:

1. Búsqueda de reservas en el servidor, que devuelva un solo turno solo si el código y el teléfono coinciden.
2. Límite de intentos por IP y por código.
3. Verificación por código de un solo uso enviado al teléfono o al correo.
4. Datos de clientes en una base de datos, con permisos por rol (cliente, empleado, dueño).
5. Contraseñas y PIN guardados como hash, nunca en texto plano.
6. Validación de disponibilidad y de "un cliente, un turno" dentro de una transacción en el servidor.
7. Eliminación de las contraseñas de demostración del código fuente.
