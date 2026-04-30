# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with HMR (http://localhost:5173)
npm run build     # Production build to /dist
npm run preview   # Preview production build locally
npm run lint      # Run ESLint
```

No test framework is configured.

## Stack

- **React 19** + **Vite** (JSX, no TypeScript)
- All styles inline via the `style` prop — `App.css` and `index.css` are legacy template files
- ESLint flat config (`eslint.config.js`), browser globals, React hooks + refresh rules

## Architecture

Todo el código de la aplicación vive en `src/App.jsx`. No hay routing, ni state management externo, ni componentes en archivos separados.

**Persistencia:** `localStorage` bajo la clave `glucosa_records`. Al montar, se leen los registros guardados; si no hay, se carga un registro semilla. Cada cambio en `records` dispara un `useEffect` que sincroniza con `localStorage`.

**Clasificación de mediciones:** La función `getStatus(value, moment)` aplica rangos basados en guías ADA:

| Momento         | Normal       | Elevado       | Alto     |
|-----------------|-------------|---------------|----------|
| Ayunas          | 70–100      | 101–125       | >125     |
| Preprandial     | 70–110      | 111–130       | >130     |
| Postprandial 2h | 70–140      | 141–180       | >180     |
| Antes de dormir | 100–140     | 141–160       | >160     |

Los momentos "Aleatorio" y cualquier otro no reconocido caen en la rama `preprandial`.

**Tabs:**
- `log` — historial ordenado de más nuevo a más antiguo, con valor, momento, fecha/hora, nota y badge de estado
- `grafica` — SVG línea temporal con los últimos 15 registros; requiere mínimo 2 puntos
- `agregar` — formulario con input numérico (20–600 mg/dL), selector de momento y nota opcional
