# Деплой «Дела рядом»

## Вариант 1: один backend-домен, проще всего

Рекомендуемый вариант: backend отдаёт и сайт, и API на одном HTTPS-домене.

### Бесплатный запуск на Render под названием `dela-ryadom`

Render подходит для этого проекта лучше статического хостинга, потому что приложению нужен Node.js backend: сессии, баланс, задания, поддержка, модерация и webhooks платежей.

1. Загрузите полный проект в GitHub-репозиторий, например `dela-ryadom`.
2. Откройте Render → **New** → **Blueprint** и выберите репозиторий. Render прочитает `render.yaml` и создаст free web service `dela-ryadom`.
3. Если создаёте вручную через **New Web Service**, укажите:

```text
Name: dela-ryadom
Environment: Node
Plan: Free
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

4. Добавьте обязательные переменные окружения:

```text
NODE_ENV=production
PUBLIC_BASE_URL=https://dela-ryadom.onrender.com
FRONTEND_ALLOWED_ORIGIN=https://dela-ryadom.onrender.com
COOKIE_SECRET=<длинная случайная строка 64+ символа>
COOKIE_SAME_SITE=None
COOKIE_SECURE=true
PAYMENT_PROVIDER=mock
PAYMENT_MOCK_AUTO_CONFIRM=false
```

Если Render выдаст другой бесплатный адрес, замените `PUBLIC_BASE_URL` и `FRONTEND_ALLOWED_ORIGIN` на фактический URL сервиса.

5. После деплоя откройте:

```text
https://dela-ryadom.onrender.com/api/health
```

Должно быть `ok: true`. Сам сайт будет доступен по:

```text
https://dela-ryadom.onrender.com
```

Важно: бесплатный Render может усыплять сервис после простоя. Для MVP/демо это нормально, первый запрос после сна будет медленнее.

### Универсальный запуск на любом Node.js-хостинге

1. Загрузите полный проект на Render, Koyeb, Railway, VPS или другой Node.js-хостинг.
2. Укажите команду запуска:

```bash
npm start
```

3. Добавьте переменные окружения из `.env.production.example`.
4. В кабинете ЕСИА укажите redirect URL вашего домена:

```text
https://your-domain.example/api/auth/esia/callback
```

5. Откройте `https://your-domain.example/api/health` — должно быть `ok: true`.

## Вариант 2: статический сайт отдельно, backend отдельно

Если сайт лежит на Netlify, а backend на Render/Railway:

1. В `config.js` укажите API-домен:

```js
window.DELA_RYADOM_CONFIG = {
  API_BASE_URL: "https://your-api.example"
};
```

2. На backend добавьте:

```text
PUBLIC_BASE_URL=https://your-api.example
FRONTEND_ALLOWED_ORIGIN=https://your-site.netlify.app
COOKIE_SAME_SITE=None
COOKIE_SECURE=true
```

3. В redirect URL ЕСИА используйте backend-домен:

```text
https://your-api.example/api/auth/esia/callback
```

Важно: отдельные домены могут упираться в ограничения браузеров на third-party cookies. Для OAuth лучше один домен или поддомены одного домена.

## Что нельзя публиковать

Никогда не кладите `.env`, `client_secret`, сертификаты ЕСИА и приватные ключи в статический архив или GitHub.

## Минимальный security-чеклист перед публикацией

- Используйте длинный случайный `COOKIE_SECRET` и храните его только в переменных окружения.
- Проверьте, что `.env`, архивы, `backend/`, `package.json` и служебные файлы не раздаются как статические файлы. Встроенный backend отдаёт только allowlist публичных файлов.
- Не передавайте `client_secret` в URL авторизации. Секреты используются только на backend при обмене `code` на токен.
- Для ЕСИА настройте официальный userinfo/JWKS/сертификаты. Непроверенный JWT нельзя считать подтверждённым профилем.
- Оставьте включёнными CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HTTPS и secure cookies.
- Для продакшена замените in-memory session/rate-limit на Redis или базу данных.
