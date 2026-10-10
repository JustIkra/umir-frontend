# umir-frontend

Точка входа React и Vite для системы одного ресторана. Контейнер раздаёт статические файлы и передаёт `/api/` в gateway.

## Текущее состояние

React смонтирован в корневой элемент и пока отображает пустое содержимое. Экраны и бизнес-взаимодействия ещё не реализованы.
Контейнер отвечает на `GET /healthz`; это проверка раздачи HTTP, а не бизнес-функций.

## Объём текущего этапа

Бизнес-ядро и хранилища в памяти реализованы и проверены в `umir-warehouse` и `umir-serving`. Новые экраны и бизнес-взаимодействия frontend остаются следующим этапом; этот репозиторий содержит каркас интерфейса.

| Файл | Назначение |
| --- | --- |
| `index.html` | HTML-точка монтирования приложения. |
| `src/main.js` | Запуск React и монтирование корневого элемента. |
| `nginx.conf` | Раздача сборки и передача `/api/` в gateway внутри Compose-сети. |

Frontend получает API через gateway. Целевой контракт сохранён в [OpenAPI v1](https://github.com/JustIkra/umir-factory/blob/main/docs/api/openapi.yml). Бизнес-HTTP и авторитетное восстановление сетевых операций ещё не реализованы. Будущие экраны показывают предложение заказа и требуют явного подтверждения оставшегося состава. Неизвестный результат запроса нельзя показывать как успех или повторять с новым `commandID`.

Будущий API-клиент отделяет состояние результата сервера, включая неизвестный и ожидающий результат, от отображения интерфейса. Для адаптивной вёрстки используются согласованная шкала точек перелома проекта и относительные единицы.

Границы Go-сервисов описаны в [документе архитектуры](https://github.com/JustIkra/umir-factory/blob/main/docs/go-architecture.md). Доступные проверки frontend — `npm ci` и `npm run build`; отдельного test-скрипта в `package.json` нет. CI также проверяет контейнерную сборку. Сборка Vite и process health не доказывают готовность бизнес-экранов.

## Разработка

Требуется Node.js 22.12+; CI использует Node.js 24.

```sh
npm ci
npm run build
npm run dev
```

Vite выводит адрес dev-сервера в консоль. Проксирование API сейчас настроено в Nginx-контейнере; dev-сервер Vite не содержит proxy-конфигурации.

Сборка отдельного контейнера:

```sh
docker compose up --build -d --wait
```

Отдельный Compose публикует `http://127.0.0.1:18080`.
В [общей сборке фабрики](https://github.com/JustIkra/umir-factory#readme) frontend по умолчанию доступен на `http://127.0.0.1:8080`.
Nginx использует адрес `http://gateway:8080` внутри сети Compose.
Часовой пояс контейнера — `Europe/Moscow`.

## Совместная работа

Main защищён активным ruleset. Обновлять main и объединять PR может только `JustIkra`.
`Kxqusos` добавлен с ролью write и работает в других ветках.
Остальные пользователи GitHub могут создать issue, fork и PR.
Владелец кода указан в `.github/CODEOWNERS`.

Перед PR выполните локальные проверки. Изменение межсервисного контракта согласуйте с вызывающей стороной.

## CI/CD

[GitHub Actions](https://github.com/JustIkra/umir-frontend/actions) проверяет push в ветки, PR в main и ручные запуски.
После успешной проверки main публикует `ghcr.io/justikra/umir-frontend:sha-<полный SHA коммита>` для `linux/amd64` и `linux/arm64`.
Публикация использует `GITHUB_TOKEN`, с `packages:write` только у задания публикации.
Коммит документации запускает тот же workflow.

[Фабрика](https://github.com/JustIkra/umir-factory) закрепляет выбранный SHA в `compose.yaml`.
Обновление фабрики выполняется отдельным PR; новый образ не развёртывается автоматически.
Секреты передаются через окружение; `.env` исключён из Git.

## Development standard and releases

Repository instructions are in [AGENTS.md](AGENTS.md). Public compatibility covers documented requests, results, error states and operational interfaces; warehouse/serving also publish their declared Go contract surfaces when implemented. Internal refactoring does not automatically change this contract.

This remains a React/Vite repository. Use `npm ci` and `npm run build`, plus the existing container build. Go quality tools do not apply to frontend sources.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Stable incompatible changes increment major, compatible additions minor and fixes patch. Our pre-1.0 convention uses patch for compatible fixes and minor for additions or breaking changes. Mark breaking behavior and migration explicitly.

Release repositories independently. Use annotated `vX.Y.Z` tags for actual releases; published nested Go modules prefix tags with the logical module subdirectory (excluding a trailing major-version directory), and Go v2+ needs the matching major import path. Published tags/versions stay immutable. Record changes under Unreleased before releasing. Preserve Umir `sha-<full-SHA>` image identities and exact factory component pins; SemVer does not replace them with `latest`. API versions and service releases are separate.

Preserve unrelated local edits, stage reviewed paths and check `git diff --cached` and `git diff --check`. Tagging, publishing and shared-history rewrites require the corresponding user instruction. This standard does not create a release or change the current version.
