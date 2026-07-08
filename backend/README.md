# Backend для «Дела рядом»

Это минимальный Node.js backend. Он отдаёт статический PWA и теперь держит базовый серверный контур: OAuth-flow для ЕСИА/Госуслуг, постоянное локальное хранилище или PostgreSQL, аудит, server-sent events и каркасы провайдеров.

- `POST /api/auth/esia/start`
- `GET /api/auth/esia/callback`
- `GET /api/auth/esia/status`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `PATCH /api/account`
- `DELETE /api/account`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/{taskId}/messages`
- `POST /api/tasks/{taskId}/messages`
- `GET /api/events`
- `GET /api/transactions`
- `GET /api/support/tickets`
- `POST /api/support/tickets`
- `GET /api/support/tickets/{ticketId}`
- `PATCH /api/support/tickets/{ticketId}`
- `POST /api/support/tickets/{ticketId}/messages`
- `POST /api/push/subscribe`
- `POST /api/auth/phone/start`
- `POST /api/auth/phone/verify`
- `POST /api/files/prepare`
- `POST /api/files/{fileId}/complete`
- `GET /api/files/{fileId}/download`
- `GET /api/admin/users`
- `GET /api/admin/audit-log`

## Как запустить локально

1. Установите Node.js 18+.
2. Скопируйте `.env.example` в `.env`.
3. Заполните `ESIA_CLIENT_ID`, `ESIA_CLIENT_SECRET`, `ESIA_REDIRECT_URI` и остальные параметры ЕСИА.
4. Установите зависимости и запустите:

```bash
npm install
npm start
```

Откройте `http://localhost:3000`.

## Данные и аудит

Локально backend пишет состояние в `backend/data/store.json` атомарной заменой файла. Там хранятся задания, пользователи ЕСИА, серверные сессии, демо-платежи/выплаты, история операций, заявки поддержки, push-подписки, подготовленные файлы и audit log. Папка `backend/data/` добавлена в `.gitignore`, её нельзя публиковать в репозиторий.

Для production задайте `DATABASE_URL` и выполните миграции:

```bash
npm run db:migrate
npm start
```

При наличии `DATABASE_URL` backend использует PostgreSQL: применяет SQL-миграции из `backend/migrations/`, хранит общий snapshot в `app_state` и синхронизирует основные таблицы `users`, `sessions`, `tasks`, `payments`, `payouts`, `transactions`, `support_tickets`, `audit_log`, `files`, `push_subscriptions`, `sms_codes`. Если `DATABASE_URL` пустой, используется локальный JSON fallback.

Регистрация и вход работают через backend: пароль не сохраняется в браузере, на сервере хранится `scrypt`-хэш, а авторизация держится в HttpOnly cookie-сессии. Frontend при старте проверяет `/api/auth/me` и восстанавливает серверную сессию на другом устройстве после входа. Все небезопасные API-методы с активной cookie-сессией защищены CSRF-токеном `X-CSRF-Token`; токен выдаётся в ответах `/api/auth/me`, login/register/phone verify и автоматически добавляется frontend API helper-ом.

Баланс аккаунта и история операций считаются на backend. Mock-пополнение через `/api/payments` зачисляет деньги серверно, `/api/payouts` списывает их серверно, создание задания удерживает эскроу у заказчика, отклик удерживает залог исполнителя, а приёмка начисляет оплату исполнителю. Каждое подтверждённое движение денег создаёт запись в `/api/transactions`, а frontend только показывает серверный список и больше не делает локальные демо-начисления/операции, если backend не подтвердил финансовое действие.

СБП-пополнение через ЮKassa включается настройками `PAYMENT_PROVIDER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`. Backend создаёт платёж `POST https://api.yookassa.ru/v3/payments` с `payment_method_data.type=sbp`, `capture=true`, redirect confirmation и metadata `localPaymentId`. Frontend открывает `confirmation_url`, а зачисление происходит только после webhook ЮKassa на `POST {PUBLIC_BASE_URL}/api/payments/webhook` с событием `payment.succeeded`/статусом `succeeded`. Ключи ЮKassa должны храниться только в env backend-хостинга.

Для нескольких backend-инстансов следующим шагом всё равно нужен Redis для сессий/rate-limit/SSE fanout и более детальные таблицы сообщений/чатов.

Frontend подключается к `GET /api/events` через Server-Sent Events и получает `task.updated`, `task.message`, `payment.updated`, `payout.updated`, `transaction.created`, `support.updated`. По финансовым событиям frontend заново запрашивает `/api/transactions`, по событиям поддержки — `/api/support/tickets`; polling остаётся резервным механизмом, если SSE недоступен.

Заявки поддержки создаются и обновляются на backend. Обычный пользователь видит только свои обращения, аккаунт поддержки/admin видит все заявки, может отвечать и сбрасывать счётчик непрочитанных.

Чат задания проходит server-side anti-fraud фильтр: сообщения с предложением оплаты/предоплаты на карту, обменом внешними контактами или мессенджерами вне платформы блокируются с audit log. В поддержке такие сообщения не блокируются, чтобы пользователь мог пожаловаться, но ticket получает risk flag и автоматически уходит оператору.

Фотоотчёты и вложения готовятся через `POST /api/files/prepare`. Backend требует серверную сессию, разрешает только JPEG/PNG/WebP до 8 МБ, проверяет исполнителя задания, создаёт запись файла и выдаёт короткую S3 presigned PUT-ссылку. После успешного PUT frontend вызывает `POST /api/files/{fileId}/complete`, а в задаче/сообщении хранит `photoFileId`, не base64. Просмотр идёт через `GET /api/files/{fileId}/download`: backend проверяет владельца файла, участника задания, поддержку или admin и только затем редиректит на короткую presigned GET-ссылку. Если `FILE_STORAGE_PROVIDER=s3` и `S3_*` не настроены, файловые endpoints fail-closed.

Статусы заданий меняются через `POST /api/tasks/{taskId}/actions/{accept|start|review|revision|done|dispute|resolve}`. Backend проверяет роль участника или admin-сессию, пишет audit log, сохраняет состояние и рассылает `task.updated`; прямой `POST /api/tasks` для существующего задания доступен только заказчику/admin и не принимает смену статуса, исполнителя, выплат и споров. `GET /api/tasks` отдаёт полную задачу только участникам/support/admin; публичная лента для остальных не содержит чат, proof-фото и внутренние accountId. `GET /api/tasks/{taskId}/messages` закрыт для посторонних.

Админские endpoints защищены серверной сессией и ролью `admin`. Задания пользователей проходят серверную модерацию: новые задачи от обычных аккаунтов получают `moderationStatus=pending`, а лента открытых заданий показывает только approved. Очередь доступна через `GET /api/admin/tasks/moderation`, решение — через `POST /api/admin/tasks/{taskId}/moderate` со статусом `approved`, `rejected` или `pending`; доступ имеют `admin`, `support` и `moderator`.

Локально можно выдать роли через точные backend account id после первой авторизации: `ADMIN_ACCOUNT_IDS=esia:<externalId>`, `SUPPORT_ACCOUNT_IDS=phone:<hash>` или `MODERATOR_ACCOUNT_IDS=...`. Несколько id разделяются запятыми.

## Redirect URL

Для локального теста укажите в кабинете ЕСИА:

```text
http://localhost:3000/api/auth/esia/callback
```

Для продакшена замените `PUBLIC_BASE_URL` и `ESIA_REDIRECT_URI` на ваш HTTPS-домен.

## Важно про ЕСИА

ЕСИА требует официально зарегистрированную информационную систему, сертификаты и корректно подписанный `client_secret` по требованиям Госуслуг. В `.env.example` оставлено поле `ESIA_CLIENT_SECRET`, но в реальном контуре его часто нужно формировать сервером через криптографическую подпись, а не хранить как обычную строку.

## Что ещё нужно для продакшена

- использовать PostgreSQL через `DATABASE_URL` и добавить Redis перед масштабированием на несколько серверов;
- добавить HTTPS, reverse proxy и secure cookies;
- оставить включённый per-endpoint rate-limit, CSRF-защиту и мониторинг audit log;
- проверять подписи/claims токенов по официальным JWKS/сертификатам провайдеров;
- подключить adapter выбранного SMS-провайдера;
- подключить Web Push adapter с VAPID-ключами;
- настроить приватный S3-compatible bucket для загрузки файлов;
- подключить bank/acquiring adapter только после договора и KYC/AML;
- подключить юридические документы и согласия под реальное юрлицо.
