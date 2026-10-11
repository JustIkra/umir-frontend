# Изменения

## Не выпущено

- Expanded the approved frontend stack to JavaScript or TypeScript, SCSS and Chakra UI on React/Vite after inspecting the organizer's presentation. Authorized openapi-typescript, Vitest and Playwright within the frontend task; their integration remains part of that PR.
- Documented how to maintain README, AGENTS and changelog alongside implementation, with separate current, approved and planned status and exact API revision references.
- Обновлены закреплённые GitHub Actions до выпусков с поддержкой Node.js 24.
- Уточнены границы готового ядра, целевого OpenAPI и следующего этапа интерфейса.
- Обновлены закреплённые версии Node.js и Nginx; CI использует Node.js 24.21.0.
- Уточнено состояние HTTP API: backend хранит данные в памяти процесса, а интерфейсные сценарии ещё не реализованы.

- Added repository development and release rules; the frontend toolchain is unchanged.

## [0.1.0] - 2026-10-10

- Добавлены каркас React, контейнер Nginx и CI/CD для образов.

