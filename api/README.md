# Контракт backend v2

Побайтовые копии файлов `umir-factory`. Не правьте их вручную и не форматируйте. При обновлении контракта:

1. скопируйте новые файлы;
2. обновите таблицу;
3. выполните `npm run api:types`.

`npm run api:check` (входит в `npm run check`) сверяет SHA-256 и актуальность сгенерированных типов.

| Файл                       | Источник                                                                                  | SHA-256                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend-v2-public.json`   | `umir-factory@66b827cf49fa70777dcba7b54fb7a3d05e64407c:docs/api/backend-v2-public.json`   | `e710150288d650965cfee80b7cb623f5466583c03da9edf5561f94d127970897` |
| `backend-v2-examples.json` | `umir-factory@66b827cf49fa70777dcba7b54fb7a3d05e64407c:docs/api/backend-v2-examples.json` | `ac2f52f5d8667e54f1000eda0fbbd03356d990e9756a5a1982b3308ff206c6ed` |

Версия контракта: `info.version` = `2.0.0-draft.2`, ветка фабрики `chore/backend-e2e-checkpoint-20261013`. Сгенерированные типы: `src/adapters/api/backend-v2.d.ts`.
