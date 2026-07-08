# Backend-памятка для «Дела рядом»

Текущая сборка — PWA с минимальным Node.js backend. Backend уже отдаёт сайт, хранит задания/платёжные события/пользователей ЕСИА в локальном `backend/data/store.json` или PostgreSQL через `DATABASE_URL`, ведёт audit log и отдаёт server-sent events. Это снимает самый опасный in-memory риск для раннего теста, но ещё не заменяет полноценный production-контур с Redis, S3, SMS и банковскими adapter-ами.

## Что нужно для реального запуска

1. **Аккаунты и авторизация**
   - серверная регистрация, вход, восстановление доступа;
   - OAuth-вход через ЕСИА/Госуслуги с redirect URL, state-защитой, callback endpoints и серверной проверкой токенов;
   - SMS/push-коды через провайдера;
   - хэширование паролей и rate-limit;
   - роли пользователя, поддержки, модератора и администратора;
   - список всех зарегистрированных пользователей для модераторов с журналом блокировок и предупреждений.

2. **Задания и карта**
   - база данных заданий, откликов, статусов и истории;
   - серверная проверка города, адреса и координат;
   - хранение вложений в S3-совместимом хранилище;
   - модерация запрещённых заданий.

3. **Чат, поддержка и арбитраж**
   - сообщения между разными устройствами;
   - заявки поддержки с правами доступа;
   - журнал действий для споров;
   - очередь жалоб и решений арбитража;
   - блокировка рискованных контактов и переводов вне платформы.

4. **Платежи**
    - платёжный провайдер/банк для СБП, карт и выплат;
    - настоящие эскроу-счета или безопасная сделка;
    - токенизация карт через форму провайдера;
    - чеки, комиссии, возвраты, KYC/AML и налоговые документы.

   Для MVP подключён backend-адаптер ЮKassa для СБП-пополнений: `PAYMENT_PROVIDER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`. Backend создаёт redirect-платёж ЮKassa с `payment_method_data.type=sbp`, а баланс зачисляет только после webhook `payment.succeeded`. До появления ИП/юрлица, договора с провайдером и активного магазина backend можно оставлять в `PAYMENT_PROVIDER=mock`: он создаёт демо-платежи и заявки на выплату, но не двигает реальные деньги. Выплаты исполнителям пока остаются backend-заявками без реального payout adapter.

   Production-хостинг для платежей и персональных данных лучше размещать в российском облаке/VPS с HTTPS и резервными копиями: Selectel, Timeweb Cloud или Yandex Cloud. Render/Railway можно использовать для раннего прототипа, но не как целевой контур реальных платежей.

5. **Push и уведомления**
   - Web Push/VAPID или мобильный push;
   - подписки устройств;
   - серверные события по чатам, заданиям, оплатам и спорам.

6. **Админка, аналитика и мониторинг**
   - серверные роли и права доступа к админ-панели;
   - аудит действий модераторов;
   - аналитика регистраций, заданий, конверсий, оплат и споров;
   - error monitoring с алертами.

7. **Юридический контур**
   - полноценные пользовательское соглашение, политика конфиденциальности, согласие на обработку персональных данных и оферты под юридическое лицо;
   - правила хранения персональных данных, геоданных и платёжных событий;
   - контактные данные оператора и порядок удаления данных.

## Backend endpoints

```text
POST /api/auth/phone/start
POST /api/auth/phone/verify
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/esia/start
GET  /api/auth/esia/status
GET  /api/auth/me
PATCH /api/account
DELETE /api/account
GET  /api/tasks
POST /api/tasks
GET  /api/events
POST /api/tasks/{taskId}/messages
POST /api/tasks/{taskId}/actions/{accept|start|review|revision|done|dispute|resolve}
GET  /api/support/tickets
POST /api/support/tickets
GET  /api/support/tickets/{ticketId}
PATCH /api/support/tickets/{ticketId}
POST /api/support/tickets/{ticketId}/messages
POST /api/payments
GET  /api/payments/{paymentId}
POST /api/payments/webhook
POST /api/payouts
GET  /api/transactions
POST /api/push/subscribe
POST /api/files/prepare
POST /api/files/{fileId}/complete
GET  /api/files/{fileId}/download
GET  /api/admin/users
GET  /api/admin/tasks/moderation
POST /api/admin/tasks/{taskId}/moderate
GET  /api/admin/audit-log
```

Сейчас реализованы: серверные регистрация/вход/выход/удаление аккаунта с HttpOnly cookie-сессией и `scrypt`-хэшем пароля, серверный баланс аккаунта, mock-пополнения/выводы с изменением баланса только на backend, серверная история операций `/api/transactions`, серверные заявки поддержки `/api/support/tickets`, ЕСИА start/callback/status, `/api/auth/me`, `/api/auth/phone/start`, `/api/auth/phone/verify`, `/api/tasks`, `/api/tasks/{taskId}/messages`, `/api/tasks/{taskId}/actions/...`, `/api/events`, push-subscribe storage, S3-compatible file prepare/complete/download с presigned PUT/GET и проверкой доступа, `/api/admin/users`, `/api/admin/tasks/moderation`, `/api/admin/tasks/{taskId}/moderate`, `/api/admin/audit-log`. Серверные task action endpoints проверяют участника/админа по backend-сессии, пишут audit log, сохраняют состояние и отправляют SSE `task.updated`; создание задания списывает эскроу на backend, пишет операцию `escrow` и ставит новые задания обычных пользователей в `pending` до решения модератора. Роли `admin`, `support`, `moderator` берутся из account roles или env `ADMIN_ACCOUNT_IDS`, `SUPPORT_ACCOUNT_IDS`, `MODERATOR_ACCOUNT_IDS`. Отклик списывает залог исполнителя и пишет `deposit`, приёмка начисляет выплату исполнителю и пишет `payout`. Пополнения и выводы также создают операции на backend. Заявки поддержки, сообщения, привязка к заданию и эскалация к оператору теперь хранятся на backend и синхронизируются по SSE `support.updated`. Фотоотчёты больше не сохраняются base64 в задачах/сообщениях: frontend загружает файл в S3 по короткой presigned PUT-ссылке, завершает загрузку через backend и кладёт в сообщение только `photoFileId`. Если S3 не настроен, файловый flow fail-closed. Прямой `/api/tasks` больше не принимает смену статуса, исполнителя, выплат и споров для существующего задания.

## Добавленный backend-каркас OAuth

В папке `backend/` добавлен Node.js backend без внешних зависимостей. Он отдаёт сайт и обрабатывает OAuth-flow:

```text
POST /api/auth/esia/start
GET  /api/auth/esia/callback
GET  /api/auth/esia/status
```

Настройки берутся из `.env` по шаблону `.env.example`: `ESIA_CLIENT_ID`, `ESIA_CLIENT_SECRET`, `ESIA_REDIRECT_URI`, `ESIA_USERINFO_URL`, `PUBLIC_BASE_URL`, `COOKIE_SECRET`.

Реальные ключи и секреты нельзя хранить в `app.js` или публиковать в статическом архиве. Их нужно добавлять только на backend-хостинге через переменные окружения.

## Добавленный persistence-контур

- `backend/data/store.json` — локальное атомарное хранилище для раннего запуска.
- `DATABASE_URL` — production-переключатель на PostgreSQL.
- `backend/migrations/001_initial.sql`, `002_transactions.sql`, `003_support_tickets.sql` — SQL-схема: users, sessions, tasks, payments, payouts, transactions, support_tickets, audit_log, files, push_subscriptions, sms_codes, app_state.
- `npm run db:migrate` — применяет PostgreSQL-миграции, если задан `DATABASE_URL`.
- `backend/data/` исключён из git.
- `/api/health` показывает статус persistence, SSE и провайдеров: ЕСИА, payments, SMS, push, storage.
- Реальные SMS и банковские операции не имитируются: endpoints возвращают ошибку, пока нет официальных ключей и adapter-а под выбранный API. S3-compatible файлы уже поддерживают presigned PUT/GET без SDK, но требуют приватный bucket и заполненные `FILE_STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Cookie-сессии защищены CSRF-токеном для unsafe API методов: backend выдаёт `csrfToken` после восстановления/создания сессии, frontend отправляет его в `X-CSRF-Token`. Для auth/SMS/платежей/выплат/файлов/задач/поддержки добавлены отдельные rate-limit профили; при масштабировании их нужно перенести из памяти процесса в Redis.
- Задания имеют два server-side представления: полное доступно только заказчику, исполнителю, поддержке и admin; публичное для ленты скрывает чат, proof-фото и внутренние accountId. Сообщения задания через `/api/tasks/{taskId}/messages` доступны только участникам/support/admin, а редактирование существующего задания через `/api/tasks` разрешено только заказчику/admin.
- Anti-fraud фильтр теперь работает на backend: task chat блокирует сообщения про оплату/предоплату на карту, номера карт и внешние мессенджеры; support chat такие сообщения помечает risk flag и переводит заявку оператору, чтобы жалобы не терялись.
