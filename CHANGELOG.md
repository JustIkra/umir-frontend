# Изменения

## Не выпущено

- Переведён пустой каркас на TypeScript и зафиксирована пятислойная архитектура: domain, application, adapters, presentation и app. Добавлены ESLint, dependency-cruiser, Prettier и Bun 1.4.3 с положительными и отрицательными сценариями архитектурных правил.
- Документированы команды проверки, CI и границы backend/frontend. Для будущих экранов сохранены runtime-проверка API, генерация типов из закреплённой OpenAPI, HTTP-моки и браузерная приёмка; экраны, API-клиент и E2E-проверки в этот этап не входят.
- Chakra UI оставлена выбранной для будущих экранов, но пока не устанавливается. Prettier обрабатывает SCSS; семантическая проверка стилей отложена до появления production-стилей.
- Expanded the approved frontend stack to JavaScript or TypeScript, SCSS and Chakra UI on React/Vite after inspecting the organizer's presentation. Authorized openapi-typescript and Playwright as future additions; Bun is the selected test runner.
- Documented how to maintain README, AGENTS and changelog alongside implementation, with separate current, approved and planned status and exact API revision references.
- Обновлены закреплённые GitHub Actions до выпусков с поддержкой Node.js 24.
- Уточнены границы готового ядра, целевого OpenAPI и следующего этапа интерфейса.
- Обновлены закреплённые версии Node.js и Nginx; CI использует Node.js 24.21.0.
- Уточнено состояние HTTP API: backend хранит данные в памяти процесса, а интерфейсные сценарии ещё не реализованы.

- Added repository development and release rules; that documentation change did not alter the frontend toolchain.

## [0.1.0] - 2026-10-10

- Добавлены каркас React, контейнер Nginx и CI/CD для образов.
