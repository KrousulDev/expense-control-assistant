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
4. **Verificación** — `npm run test` en la raíz (todos los workspaces con test) y `npm run lint` si se tocó código; ver sección [Verificación y scripts](#verificación-y-scripts).

Refactor solo con la barra verde (tests pasando).

## Rol de los tests en este proyecto

Los tests son el **contrato ejecutable** del comportamiento acordado en los casos de uso: documentan la intención, evitan regresiones al refactorizar y dan feedback rápido sin levantar toda la app. No sustituyen revisión manual ni pruebas de integración end-to-end donde aplique, pero son la base del ciclo red-green-refactor en código nuevo o al corregir bugs.

## Dónde están y cómo se nombran (monorepo npm workspaces)

El repositorio tiene workspaces `app` y `api`. Cada uno define su propio `test` en su `package.json`; la raíz ejecuta todos los que existan.

| Workspace | Herramienta | Ubicación y patrón de archivos |
|-----------|-------------|--------------------------------|
| **`api/`** (NestJS) | Jest (`ts-jest`) | Unitarios en `api/src/**/*.spec.ts` (convención Nest: junto al código). Config Jest en `api/package.json` (`testRegex`: `.*\.spec\.ts$`, `rootDir`: `src`). E2E: `api/test/**/*.e2e-spec.ts` con `npm run test:e2e -w api` (config `api/test/jest-e2e.json`). |
| **`app/`** (React + Vite) | Vitest + jsdom | Archivos `*.test.*` / `*.spec.*` bajo `app/src/` (p. ej. `App.test.tsx`). Setup global: `app/src/test/setup.ts`; opciones en `app/vite.config.ts` (`test.environment`, `setupFiles`). Testing Library para componentes. |

**`db/`** y **`ai/`** no tienen tests — `ai/` solo contiene `legacy-ai.md`.

## Cómo se implementan (por capa)

- **API:** `@nestjs/testing` (`Test.createTestingModule`, inyección real de providers/mocks). Supertest suele usarse en e2e HTTP cuando existan esos tests.
- **App:** `vitest` + `@testing-library/react` (y `@testing-library/jest-dom` vía setup) para renderizar y aserciones orientadas al usuario (`getByRole`, etc.).
- **AI:** tests unitarios puros en Node (sin navegador); `describe` / `it` / `expect` importados de `vitest` salvo que se active `globals` en config.

Mantener **un comportamiento verificable por test** y mocks solo en fronteras externas (HTTP, `DatabaseService`), no para “tapar” la lógica que quieres garantizar.

## Verificación y scripts

| Objetivo | Comando (desde la raíz del repo) |
|----------|----------------------------------|
| **Suite completa del monorepo** | `npm run test` — ejecuta `test` en cada workspace con script (`--workspaces --if-present`). |
| **Solo un paquete** | `npm run test -w app`, `npm run test -w api`. |
| **Modo watch (desarrollo)** | `npm run test:watch -w app` / `npm run test:watch -w api`. |
| **Cobertura** | `npm run test:cov -w app` o `npm run test:cov -w api` (cuando haga falta medir cobertura). |
| **E2E API** | `npm run test:e2e -w api` (archivos `*.e2e-spec.ts` en `api/test/`). |
| **Calidad tras cambios** | `npm run lint` (todos los workspaces con lint) además de tests. |

Flujo mínimo tras tocar código: **`npm run test`** y, si aplica, **`npm run lint`**. Si falla un test, corregir implementación o actualizar el test solo si el requisito de negocio cambió (no debilitar aserciones para “hacer pasar”).

## Convención si aún no hay carpeta de tests en un módulo nuevo

| Capa | Convención en este repo |
|------|-------------------------|
| **API** | `*.spec.ts` en `api/src/` junto al servicio/controlador (o subcarpeta del feature). |
| **App** | `*.test.tsx` / `*.test.ts` junto al componente o hook. |

## Cómo escribir el test para que el caso de uso quede claro

- **Un `it` (o test) por comportamiento observable**, no un test gigante por feature.
- Título en lenguaje de negocio: qué hace el sistema, no solo nombres de métodos.
- **Arrange / Act / Assert** implícito o comentado solo donde aporte claridad.
- Para flujos conversacionales: incluir al menos un ejemplo realista de mensaje y el objeto o respuesta esperada (estructura mínima verificable).

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
