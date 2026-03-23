---
name: defining-tdd
description: Delimita el flujo TDD del proyecto (casos de uso → tests → implementación → verificación). Prioriza escribir o fijar tests antes del código de producción. Usar al implementar features, al planificar casos de uso, al refactorizar con cobertura, o cuando el usuario mencione TDD, tests primero o casos de prueba.
---

# TDD en este repositorio

## Regla de oro

**No implementar lógica de negocio nueva sin antes tener el caso de uso acotado y reflejado en tests (o en una lista explícita de casos que se traducirán a tests en el mismo cambio).** Si el test no existe aún, créalo primero y observa el fallo (red) antes de hacer pasar el test (green).

## Qué es un “caso de uso” aquí

Un caso de uso es un escenario concreto con:

| Elemento | Qué definir |
|----------|-------------|
| Contexto | Usuario, canal (ej. WhatsApp), estado previo si aplica |
| Entrada | Texto o payload realista (ej. “gasté 20k en comida”) |
| Resultado esperado | Intención detectada, datos normalizados, respuesta o efecto observable |
| Límites | Errores, ambigüedad, idioma, montos sin moneda, etc. |

Los tests deben nombrar o comentar ese escenario para que en el código base se entienda **qué comportamiento se garantiza**.

## Orden obligatorio (alineado con `forma_de_trabajo`)

1. **Aclarar casos de uso** — Lista breve de escenarios + entradas + salidas esperadas.
2. **Tests primero** — Un archivo de test por módulo/feature o bloque coherente; `describe`/`it` (o equivalente) por caso de uso.
3. **Implementación mínima** — Solo lo necesario para que pasen los tests.
4. **Verificación** — `npm run test` (y `npm run lint` si tocó código).

Refactor solo con la barra verde (tests pasando).

## Dónde ubicar tests (cuando exista el código)

| Capa | Convención típica |
|------|-------------------|
| **API (NestJS)** | Junto al módulo: `*.spec.ts` al lado del servicio/controlador, o carpeta `__tests__` cercana |
| **App (React/Vite)** | Componentes/hooks: `*.test.tsx` / `*.spec.ts` junto al archivo o en `__tests__` |
| **Dominio / parsers / AI** | Tests unitarios cerca de la unidad probada; mocks de IO externo |

Si la estructura del repo ya define otra convención, **seguir la existente**.

## Cómo escribir el test para que el caso de uso quede claro

- **Un `it` (o test) por comportamiento observable**, no un test gigante por feature.
- Título en lenguaje de negocio: qué hace el sistema, no solo nombres de métodos.
- **Arrange / Act / Assert** implícito o comentado solo donde aporte claridad.
- Para flujos conversacionales: incluir al menos un ejemplo realista de mensaje y el objeto o respuesta esperada (estructura mínima verificable).

## Verificación

- Tras cambios: `npm run test` desde la raíz del monorepo (o el paquete que tocaste, si el repo define workspaces).
- Si un test falla, no “arreglar” silenciando el assert: corregir implementación o el propio test si el requisito cambió.

## Bugs

1. Test de reproducción que falle con el bug actual.
2. Arreglo.
3. Mismo test en verde.

## Qué no cuenta como TDD

- Escribir toda la implementación y añadir tests después como checklist.
- Tests que solo cubren mocks sin aserción del resultado útil al usuario.

## Referencia rápida red-green-refactor

1. **Red:** test nuevo o ampliado que falla por la ausencia o el error del comportamiento.
2. **Green:** código mínimo para pasar.
3. **Refactor:** limpieza sin cambiar el contrato que cubren los tests.
