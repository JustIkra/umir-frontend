# Контракт backend v2 (composed UA1)

Побайтовые копии файлов `umir-factory`. Не правьте их вручную и не форматируйте. При обновлении контракта:

1. скопируйте новые файлы;
2. обновите таблицу;
3. выполните `npm run api:types`.

`npm run api:check` (входит в `npm run check`) сверяет SHA-256 и актуальность сгенерированных типов.

| Файл                                   | Источник                                                                                              | SHA-256                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ui-amendment-v1-composed-public.json` | `umir-factory@9d4941cffcea42608b203ed0a1d00ea0226c32cf:docs/api/ui-amendment-v1-composed-public.json` | `f1be4d340fcc609ff6429bfe509836afbe0040337e5f7c22702b90bd46063298` |
| `backend-v2-examples.json`             | `umir-factory@9d4941cffcea42608b203ed0a1d00ea0226c32cf:docs/api/backend-v2-examples.json`             | `ac2f52f5d8667e54f1000eda0fbbd03356d990e9756a5a1982b3308ff206c6ed` |
| `ui-amendment-v1-examples.json`        | `umir-factory@9d4941cffcea42608b203ed0a1d00ea0226c32cf:docs/api/ui-amendment-v1-examples.json`        | `274e7cb5715224f418a1f42d94608cf29651abaee8f0da6303fd44da5bcb850b` |

Версия контракта: `info.version` = `2.0.0-UA1.1`, ветка фабрики `main` (в `e6acf27` содержимое файлов то же). Типы генерируются из `ui-amendment-v1-composed-public.json` в `src/adapters/api/backend-v2.d.ts`.
