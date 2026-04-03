---
name: executing-browser
description: >-
  Automatiza el navegador con la CLI `agent-browser` (Vercel Labs): flujo snapshot + refs,
  salida JSON, sesiones y buenas prácticas para agentes. Usar al probar flujos web en vivo,
  E2E manuales asistidos, depuración UI, o cuando el usuario mencione agent-browser,
  automatización de navegador para IA o pruebas con refs @eN.
---

# Ejecutar navegador con `agent-browser`

Herramienta: [agent-browser](https://github.com/vercel-labs/agent-browser) — CLI en Rust que controla Chrome vía CDP (daemon persistente; no hace falta Playwright/Node para el daemon).

 Ayuda completa: `agent-browser --help`.

## Flujo recomendado para agentes (refs)

El flujo óptimo para LLMs es **árbol de accesibilidad + refs**, no adivinar selectores a ciegas.

1. `agent-browser open <url>` — navegar (alias: `goto`, `navigate`).
2. `agent-browser snapshot -i --json` — solo elementos interactivos + salida parseable (`@e1`, `@e2`, …).
3. Actuar con refs: `agent-browser click @e2`, `agent-browser fill @e3 "texto"`, `agent-browser get text @e1`.
4. Tras cambiar el DOM o navegar: **nuevo** `snapshot` antes de seguir interactuando.

**Por qué refs:** determinísticos, rápidos y alineados con el snapshot que ya viste.

### Reducir ruido en snapshot

Combinar flags según necesidad:

| Flag | Efecto |
|------|--------|
| `-i` / `--interactive` | Solo botones, enlaces, inputs |
| `-c` / `--compact` | Menos nodos estructurales vacíos |
| `-d <n>` | Profundidad máxima del árbol |
| `-s "<selector>"` | Limitar a un contenedor CSS |

Ejemplo: `agent-browser snapshot -i -c -d 5 --json`

### Otros localizadores (cuando no baste el snapshot)

- CSS: `agent-browser click "#id"`.
- Semánticos: `agent-browser find role button click --name "Submit"`, `find text "Entrar" click`, `find label "Email" fill "..."`.

## Salida JSON (`--json`)

Para parsing estable en scripts o agentes, añadir `--json` a comandos que lo soporten (p. ej. `snapshot`, `get text`, `is visible`, `screenshot` con metadatos).

## Encadenar comandos

El daemon mantiene el navegador entre invocaciones. En shell se puede encadenar con `&&` cuando no necesitas inspeccionar salida intermedia:

```bash
agent-browser open http://localhost:5173 && agent-browser wait --load networkidle && agent-browser snapshot -i --json
```

Si debes **leer refs** del snapshot antes del siguiente paso, ejecuta `snapshot` en un paso separado y decide el siguiente comando según el JSON/texto.

## Batch (varios pasos, menos overhead)

Pipe de array JSON de comandos:

```bash
echo '[
  ["open", "https://example.com"],
  ["snapshot", "-i"],
  ["click", "@e1"]
]' | agent-browser batch --json
```

Útil para flujos largos en CI o scripts.

## Esperas

- `agent-browser wait <selector>` — elemento visible.
- `agent-browser wait <ms>` — tiempo.
- `agent-browser wait --text "Bienvenido"` — subcadena en página.
- `agent-browser wait --load networkidle` — estado de carga (`load`, `domcontentloaded`, `networkidle`).

Timeout por defecto de operaciones: **25 s**. Variable: `AGENT_BROWSER_DEFAULT_TIMEOUT` (ms). Subir por encima de ~30 s puede chocar con timeouts del CLI (EAGAIN); ver README del proyecto si ajustas tiempos largos.

## Sesiones y estado

| Necesidad | Mecanismo |
|-----------|-----------|
| Varias instancias aisladas | `--session <nombre>` o `AGENT_BROWSER_SESSION` |
| Persistir cookies/localStorage entre cierres | `--session-name <nombre>` o `AGENT_BROWSER_SESSION_NAME` (estado en `~/.agent-browser/sessions/`) |
| Perfil completo (IndexedDB, SW, caché) | `--profile <ruta>` o `AGENT_BROWSER_PROFILE` |
| Cargar auth guardada | `--state <archivo.json>` o `AGENT_BROWSER_STATE` |
| API sin login UI | `open` con `--headers '{"Authorization":"Bearer ..."}'` (headers acotados al **origen** de esa URL) |

**Seguridad:** archivos de estado pueden llevar tokens en claro → `.gitignore`, no commitear. Cifrado opcional: `AGENT_BROWSER_ENCRYPTION_KEY` (hex 64 chars).

## Multimodal / UI difícil de expresar en a11y

`agent-browser screenshot --annotate` — captura con etiquetas numéricas que corresponden a refs `@eN` para clic/relleno posterior.

## Modo depuración

`agent-browser open <url> --headed` — ventana visible (`AGENT_BROWSER_HEADED=1`).

## Seguridad (opt-in, entornos no confiables)

Activar solo si el agente navega dominios que debes acotar:

- `--allowed-domains "midominio.com,*.midominio.com"` (incluir CDNs necesarios).
- `--content-boundaries` / `AGENT_BROWSER_CONTENT_BOUNDARIES` — delimitar salida para el LLM.
- `--max-output <n>` — límite de caracteres en salidas de página.
- `--action-policy`, `--confirm-actions` — políticas y confirmación de acciones sensibles.

## Cierre

`agent-browser close` al terminar la sesión; `agent-browser close --all` para cerrar todas.

## Integración con este repo

- **E2E formales:** el monorepo usa Jest/Vitest según capa (`defining-tdd`); `agent-browser` encaja en **exploración manual**, **smoke** rápidos o **reproducción guiada** cuando un test escrito aún no existe.
- **App local:** típicamente `open http://localhost:<puerto>` tras `npm run dev` si el servidor ya está levantado.

## Actualización

`agent-browser upgrade` — actualiza según el método de instalación (npm, brew, cargo).

## Referencia externa

Documentación y lista completa de comandos en el repositorio oficial: [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser).
