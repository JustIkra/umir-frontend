# Контракт backend v2

Побайтовые копии файлов `umir-factory`. Не правьте их вручную и не форматируйте. При обновлении контракта:

1. скопируйте новые файлы;
2. обновите таблицу;
3. выполните `npm run api:types`.

`npm run api:check` (входит в `npm run check`) сверяет SHA-256 и актуальность сгенерированных типов.

| Файл                            | Источник                                                                                              | SHA-256                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend-v2-public.json`        | `umir-factory@4374042b0245ecb107a94bf64e814653c20a3dcb:docs/api/registration-v1-composed-public.json` | `2be37f544a1ababa92cf16a4652826281db7f9b0e3d64bf1b389be2af0e0c873` |
| `backend-v2-examples.json`      | `umir-factory@66b827cf49fa70777dcba7b54fb7a3d05e64407c:docs/api/backend-v2-examples.json`             | `ac2f52f5d8667e54f1000eda0fbbd03356d990e9756a5a1982b3308ff206c6ed` |
| `completion-v1-examples.json`   | `umir-factory@80c240065892153129b590f4bdbd2411b7c0319a:docs/api/completion-v1-examples.json`          | `b1b4c13e7a67fccb8a50acb036bc11f220c993f84d1e2c67c13f44ec28b2fdce` |
| `registration-v1-examples.json` | `umir-factory@4374042b0245ecb107a94bf64e814653c20a3dcb:docs/api/registration-v1-examples.json`        | `489239c9f4a31b0de1af60520cf6fa38326404f464319d113022b804bc225628` |

Текущий профиль: `info.version` = `2.0.0-REG.1`, Factory commit `4374042b0245ecb107a94bf64e814653c20a3dcb`. REG1 расширяет FIN1 открытой регистрацией; исходные FIN1/C2 примеры сохранены. `backend-v2-examples.json` сохраняет исходные C2-примеры для неизменённых проверок; они не являются FIN1 evidence. Новые примеры М6 и рекомендаций находятся в `completion-v1-examples.json`. Сгенерированные типы: `src/adapters/api/backend-v2.d.ts`.
