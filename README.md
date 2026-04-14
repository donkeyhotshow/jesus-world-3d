# + ИИСУС БЬЁТ +

Один проект: **Vite + React + Three.js** (игра), опционально **Express** для прод-сборки.

## Запуск

```bash
pnpm install
pnpm dev
```

Откройте [http://localhost:3000/](http://localhost:3000/) → **ИГРАТЬ** или сразу `/game`.

## Сборка

```bash
pnpm build
pnpm start
```

## Документация дизайна

См. [docs/GAME_DESIGN_DOCUMENT.md](docs/GAME_DESIGN_DOCUMENT.md).

## Структура

- `client/` — фронт (React, `Game.tsx`, Three.js)
- `server/` — раздача статики в production
- `shared/` — общие типы/утилиты при необходимости

## Примечание по слиянию

Папка **`jesus/`** уже удалена. Если осталась **пустая `jesus-world-3d/`** (её держит открытый Cursor/проводник), закройте проект и выполните:

`powershell -ExecutionPolicy Bypass -File .\scripts\remove-legacy-folder.ps1`

или удалите эту папку вручную в проводнике.
