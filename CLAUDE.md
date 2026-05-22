# Engram — Project Context for Claude Code

## Что это
Браузерное расширение (Firefox + Chrome) для сохранения непрерывности AI-сессий.
Следит за деградацией длинных чатов и генерирует handoff-пакет для продолжения в новом чате.

## Хакатон
- Scale Without Borders AI Hackathon
- Дедлайн сабмита: 24 мая 2025, 11:59 PM EST
- Demo Day: 27 мая 2025
- Платформа сабмита: Devpost
- Критерии (по 25%): Problem & Impact, Technical Execution, Creativity & Innovation, Pitch & Demo

## Ключевые решения принятые в проекте

### Платформы
- MVP: Claude.ai (приоритет)
- Планируется: Gemini (заглушка уже есть)
- НЕ ChatGPT (нет подписки для демо)

### AI для handoff генерации
- Gemini 1.5 Flash (бесплатный tier)
- НЕ локальные модели (сложно для хакатона)
- НЕ Gemini 2.5 Flash (списывает деньги из-за thinking режима)

### Браузер
- Firefox (основной у разработчика)
- Кросс-браузерная архитектура через utils/compat.js

### Хранилище
- IndexedDB (через background/worker.js)
- Каждый проект изолирован по projectId
- Global: настройки и шаблоны (shared)

## Структура проекта
```
engram-extension/
  extension/
    manifest.json              # MV3, Firefox + Chrome
    utils/
      compat.js                # Browser/Chrome API shim
    platforms/
      base/parser.js           # Общий интерфейс парсеров
      claude/parser.js         # Claude.ai DOM парсер (MVP)
      gemini/parser.js         # Заглушка (TODO)
    background/
      worker.js                # Service worker, IndexedDB, handoff логика
    storage/
      storage.js               # IndexedDB wrapper (устаревший, логика перенесена в worker.js)
    popup/
      popup.html / .css / .js  # UI расширения
  README.md
```

## Текущий статус
- [x] Базовая структура расширения создана
- [x] Загружается в Firefox без ошибок
- [x] Фоновый скрипт выполняется
- [ ] Исправить "No listener" ошибку между content script и background
- [ ] Проверить что MutationObserver захватывает сообщения Claude.ai
- [ ] Реализовать Gemini парсер
- [ ] Интегрировать Gemini 1.5 Flash API для handoff генерации
- [ ] Финальный UI popup
- [ ] Демо видео для Devpost

## Известные проблемы
1. Firefox MV3: async IIFE + return true + sendResponse не работает в Firefox.
   Firefox ожидает либо Promise из async-слушателя, либо синхронный sendResponse.
2. browser.runtime.sendMessage с callback не поддерживается в Firefox — нужен Promise стиль.
3. compat.js вызывает _api.runtime.sendMessage(msg, callback) когда _api === browser — неправильно.

## Важные принципы
- Легковесный мониторинг (MutationObserver, не polling)
- Инкрементальная обработка (не пересканировать весь чат)
- Проект-изолированное хранение данных
- Handoff = один вызов AI при нажатии кнопки (не continuously)

## Companion tool
В папке C:\Users\temir\Documents\Web_Projects\AI_Knowledge_Base\
есть локальный инструмент базы знаний (kb.py) — отдельно от этого репо.

## Позиционирование продукта
НЕ: "Мы клонируем чаты"
ДА: "Continuity layer для AI-assisted workflows"
Слоган: "Keep the thread. Never lose context."
