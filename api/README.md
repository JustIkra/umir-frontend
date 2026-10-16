# Контракт backend v2

Побайтовые копии файлов `umir-factory`. Не правьте их вручную и не форматируйте. При обновлении контракта:

1. скопируйте новые файлы;
2. обновите таблицу;
3. выполните `npm run api:types`.

`npm run api:check` (входит в `npm run check`) сверяет SHA-256 и актуальность сгенерированных типов.

| Файл                            | Источник                                                                                         | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `backend-v2-public.json`        | `umir-factory@c1ad88cff4616ed683d7fbb832ded1647e886125:docs/api/durable-v1-composed-public.json` | `614580ad7dd5aa3b299948852e0308cc0601ca00e9cb21f2df8526450322ed1e` |
| `backend-v2-examples.json`      | `umir-factory@66b827cf49fa70777dcba7b54fb7a3d05e64407c:docs/api/backend-v2-examples.json`        | `ac2f52f5d8667e54f1000eda0fbbd03356d990e9756a5a1982b3308ff206c6ed` |
| `completion-v1-examples.json`   | `umir-factory@80c240065892153129b590f4bdbd2411b7c0319a:docs/api/completion-v1-examples.json`     | `b1b4c13e7a67fccb8a50acb036bc11f220c993f84d1e2c67c13f44ec28b2fdce` |
| `durable-v1-examples.json`      | `umir-factory@c1ad88cff4616ed683d7fbb832ded1647e886125:docs/api/durable-v1-examples.json`        | `4e74ca65e394c564c95185f4e0fa6843e50e62b77471a34df6bcb71924273ffe` |
| `registration-v1-examples.json` | `umir-factory@4374042b0245ecb107a94bf64e814653c20a3dcb:docs/api/registration-v1-examples.json`   | `489239c9f4a31b0de1af60520cf6fa38326404f464319d113022b804bc225628` |

Текущий профиль: `info.version` = `2.0.0-DUR.1`, Factory commit `c1ad88cff4616ed683d7fbb832ded1647e886125`. DUR1 расширяет REG1 (открытая регистрация поверх FIN1) ограничениями, кодами 429 `RateLimited` и 503 `ServiceUnavailable`, `CommandConflict` и поколением хранилища; исходные FIN1/C2 примеры сохранены. `backend-v2-examples.json` сохраняет исходные C2-примеры для неизменённых проверок; они не являются FIN1 evidence. Новые примеры М6 и рекомендаций находятся в `completion-v1-examples.json`. Сгенерированные типы: `src/adapters/api/backend-v2.d.ts`.
