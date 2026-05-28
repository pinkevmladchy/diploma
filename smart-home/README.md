# Smart Home — інформаційна система (дипломна робота)

Веб-система управління розумним домом: ієрархія `User → House → Room → Device`,
збір телеметрії з IoT-пристроїв, real-time оновлення через WebSocket, аналітика
з кількома типами графіків, правила алертів з історією та сценарії автоматизації.
Двороль: автоматично створений **admin** і самостійно зареєстровані **customer**'и.

## Технологічний стек

| Шар | Технології |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS, **ECharts** (через `echarts-for-react`), Socket.io-client, axios |
| Backend | Node.js + Express + TypeScript, Prisma ORM, Multer (uploads), Socket.io (WS), Zod (валідація) |
| БД | PostgreSQL 16 (локально, без Docker) |
| Auth | JWT (15 хв access + 7 дн refresh), bcrypt; role-based middleware |

## Структура репозиторію

```
smart-home/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # 11 таблиць
│   │   ├── seed.ts                 # ручний CLI-seed (не обов'язково)
│   │   └── migrations/             # init + ~6 інкрементальних
│   ├── src/
│   │   ├── index.ts                # bootstrap, маршрути, graceful shutdown
│   │   ├── realtime.ts             # Socket.io: telemetry:new, alert:event
│   │   ├── uploads.ts              # multer: avatars/, floorplans/
│   │   ├── auth/                   # jwt + requireAuth + requireRole
│   │   ├── bootstrap/              # ensureAdminUser, ensureDemoCustomer
│   │   ├── services/
│   │   │   ├── emulator.ts         # in-process per-user генератор телеметрії
│   │   │   ├── alertEvaluator.ts   # відкриває/закриває AlertEvent
│   │   │   └── scenarioEngine.ts   # time scheduler + sensor rising-edge
│   │   └── routes/                 # auth, houses, rooms, devices, telemetry,
│   │                               # alerts, scenarios, emulator, admin
│   └── uploads/                    # uploads/avatars/, uploads/floorplans/
├── frontend/
│   ├── src/
│   │   ├── api.ts                  # axios + усі ендпоінти + типи
│   │   ├── realtime.ts             # socket.io-client wrapper
│   │   ├── auth/                   # AuthContext, ProtectedRoute, RoleRoute
│   │   ├── theme/                  # ThemeContext (per-user persistence)
│   │   ├── ui/                     # Sidebar, TopBar, Avatar, Modal, EChart…
│   │   └── pages/                  # 14 сторінок (див. нижче)
│   ├── vite.config.ts              # proxy /api, /uploads, /socket.io → :4000
│   └── tailwind.config.js          # CSS-vars driven palettes
└── README.md
```

## Швидкий старт

### Передумови
- Node.js 20+
- Локальний PostgreSQL 16 на `localhost:5432` з БД **`diploma`**
  (користувач `postgres` / пароль `postgres`)

### 1. Бекенд

```bash
cd backend
cp .env.example .env        # вже згенеровано з дефолтами для дев
npm install
npx prisma migrate deploy   # застосовує всі міграції з prisma/migrations/
npm run dev                 # http://localhost:4000
```

При першому старті автоматично створюються:
- **admin** (`admin@smart-home.local` / `admin12345`)
- **demo customer** (`customer@smart-home.local` / `customer12345`) із 1 будинком,
  2 кімнатами, 5 пристроями, **3 правилами алертів** і **4 сценаріями**

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Vite проксує `/api`, `/uploads`, `/socket.io` → `http://localhost:4000`.

### Облікові записи з коробки

| Роль | Email | Пароль | Що бачить |
|---|---|---|---|
| **admin** | `admin@smart-home.local` | `admin12345` | список користувачів, можливість «увійти як» |
| **customer** (демо) | `customer@smart-home.local` | `customer12345` | дашборд, будинок, пристрої, аналітика, сценарії, алерти |

Будь-хто може зареєструватися самостійно через `/register` — створюється `role: user`.

## Корисні команди (backend)

```bash
npm run dev               # tsx watch
npm run build             # tsc
npm run start             # node dist/index.js
npm run prisma:studio     # GUI для БД
npm run db:reset          # ⚠ drop + migrate + seed
npm run lint
npm run format
```

## Схема БД (огляд)

11 таблиць. Cascade-delete по ланцюгу `User → House → Room → Device → Telemetry`.

| # | Таблиця | Призначення |
|---|---|---|
| 1 | **users** | користувачі, ролі (`admin` / `user`), `avatar_url`, `theme_brand`, `theme_primary` |
| 2 | **houses** | будинки, належать користувачу |
| 3 | **rooms** | кімнати в будинку, `floorplan_url` для плану |
| 4 | **devices** | пристрої в кімнаті, `floorplan_x/y` (нормалізовані координати на плані) |
| 5 | **telemetry** | сирі вимірювання; індекс `(device_id, timestamp DESC)` |
| 6 | **telemetry_aggregated** | hourly/daily агрегати (поки заюзано на льоту в Analytics) |
| 7 | **device_logs** | історія керування (статус on/off, дії сценаріїв) |
| 8 | **scenarios** | автоматизації (`triggerType` + `triggerValue` + `actions` JSONB) |
| 9 | **alerts** | правила порогів (рівень будинку) |
| 10 | **alert_events** | відкриті/закриті breach-події з історією; підтримує **manual clear** |
| 11 | **notifications** | сповіщення, що створюються діями сценаріїв `notify` |

**Типи пристроїв**: `thermostat, lamp, motion_sensor, power_meter, air_quality, water_leak, smart_lock`.
**Метрики**: `temperature, humidity, power, motion, co2, light_level, water_leak`.

## Що вміє система

### Авторизація і ролі
- JWT (access 15 хв + refresh 7 дн) з axios-інтерсептором auto-refresh на 401
- Самостійна реєстрація (тільки role=user)
- `requireRole('user'|'admin')` middleware на всіх ресурсних роутах
- **Admin impersonation**: `POST /admin/customers/:id/impersonate` повертає токени
  кастомера; фронт зберігає admin-токени в localStorage backup і показує жовтий
  банер «Повернутись до адміна»

### CRUD і ієрархія
- Будинки / Кімнати / Пристрої — повний CRUD з ownership-перевіркою
- Модалки створення підтримують **каскадний вибір**: будинок → кімната
- Завантаження зображень плану кімнати (PNG/JPEG/WebP, до 5 МБ);
  на плані можна розміщувати маркери пристроїв drag-and-drop'ом
- Завантаження аватара профілю (до 2 МБ); відображається у TopBar і Settings

### Телеметрія
- `GET /devices/:id/telemetry?from&to&limit` — серія для графіка
- `GET /telemetry?deviceId&metricType&houseId&roomId&from&to&limit` — лог
  по всіх пристроях юзера
- POST батч-вставка для зовнішніх інтеграцій

### Чарти й аналітика
- Live line/state chart на сторінці пристрою (state-chart для бінарних метрик
  на 0/1 осі з лейблами «Спокій / Рух»)
- **Агрегація**: функція (avg/sum/min/max/count) + інтервал (1m..1d), для
  бінарних форситься `count`; авто-вибір інтервалу під обраний період
- Сторінка `/analytics`: line + gauge (з кольоровими зонами) + bar по днях +
  heatmap (години × дні тижня), все перебарвлюється під обрану палітру

### Алерти
- Правила порогів на рівні будинку (`metric > threshold`)
- `alertEvaluator` після кожного запису телеметрії відкриває/закриває `AlertEvent`
  (rising-edge), емітить `alert:event` через WS
- Сторінка `/alerts` з трьома табами: **Активні** (з кнопкою `Зняти` — manual clear),
  **Історія** (з тегом `нормалізовано` / `знято вручну`), **Правила** (CRUD)
- Активні алерти знімаються і з Dashboard'у

### Сценарії
- Тригери: `manual`, `time` (HH:MM щодня), `sensor` (метрика > поріг, rising-edge)
- Дії: `set_device_status` (увімкнути/вимкнути), `notify` (запис у `notifications`)
- `setInterval(60_000)` тікер для time-сценаріїв з дедупом по хвилині
- Запис у `device_logs` коли сценарій змінює статус пристрою

### Емулятор
- In-process per-user сервіс; реалістичні генератори на тип пристрою
  (рандом-волк для термостату, ймовірнісні події для motion/leak, тощо)
- Інтервал від 1 с до 60 с, контроль зі сторінки Settings
- Кожен тік пише в `telemetry`, прокидає `telemetry:new` у WS, запускає
  evaluator-и алертів і сенсорних сценаріїв

### Real-time
- Socket.io з JWT-auth (токен у `auth.token`), кімната `user:<id>`
- Events: `telemetry:new` (live append на графіках і логу телеметрії),
  `alert:event` (`opened` / `cleared`) — список активних алертів на Alerts
  оновлюється без рефетчу

### Тема
- 5 brand-палітр (синя/смарагдова/фіолетова/бурштинова/рожева) — кольорує
  кнопки, посилання, активний пункт меню, графіки
- 9 primary-палітр (5 темних: Графіт/Цинк/Камінь/Опівнічний/Темно-зелений;
  4 світлих: Сніговий/Кремовий/Світло-блакитний/Лавандовий) — сайдбар і TopBar
- **Збереження per-user**: при логіні/імперсонації — підтягується з `users.theme_*`,
  при зміні — `PATCH /auth/me/theme`. localStorage використовується як кеш для
  першого paint'у

### Адмін
- `/admin/customers` — список з лічильниками (будинків/кімнат/пристроїв/сценаріїв)
- `/admin/customers/:id` — деталі (всі будинки → кімнати → пристрої)
- Видалення (cascade) і impersonation

### Mobile responsive
- Sidebar стає slide-in drawer на `<md` з backdrop і hamburger у TopBar
- TopBar згортає email/назву поза `sm/md`
- PageHeader стекає на колонку на маленьких екранах
- Таблиці обгорнуті в `overflow-x-auto` з `min-w-[640px]`
- `h-full` layout сторінок Analytics і RoomDashboard активний тільки на `md+`;
  на мобілці сторінка скролиться, віджети отримують явні висоти

## Сторінки фронтенду

| Маршрут | Доступ | Що показує |
|---|---|---|
| `/login`, `/register` | guest | форми auth |
| `/dashboard` | user | головна: 4 stat-картки, активні алерти, картки будинків→кімнат |
| `/houses`, `/houses/:id` | user | список і детальна будинку |
| `/rooms`, `/rooms/:id` | user | список і детальна (devices + floorplan) |
| `/devices`, `/devices/:id` | user | список і детальна (chart + history + stats + power toggle) |
| `/analytics` | user | глибокий аналіз: 4 чарти, агрегація, фільтри |
| `/telemetry-log` | user | стрічка телеметрії від усіх пристроїв з live-append |
| `/scenarios` | user | таблиця сценаріїв, форма-конструктор тригер/дії |
| `/alerts` | user | 3 таби: Активні / Історія / Правила |
| `/settings` | both | профіль (аватар), емулятор (тільки user), тема |
| `/admin/customers`, `/admin/customers/:id` | admin | список і деталі кастомерів |

## Тестовий сценарій (за 2 хвилини)

1. Залогінься адміном → `/admin/customers` → побачиш demo customer'а
2. Натисни `▶ Увійти як` → потрапиш на дашборд кастомера з жовтим банером
3. Settings → запусти емулятор (інтервал 2 с) → побачиш live-апдейти на сторінці
   пристрою і у TelemetryLog
4. `/alerts` → таб «Правила» → переконайся що є 3 правила; з часом термостат
   перевищить 25°C і у «Активних» з'явиться breach
5. Натисни `Зняти` → подія переїде в «Історію» з тегом `знято вручну`
6. `/scenarios` → натисни `▶ Запустити` на «Нічний режим — вимкнути світло» →
   побачиш banner із результатом виконання дій
7. У жовтому банері — `Повернутись до адміна`

## Архітектурні рішення

- **Per-user emulator state** в пам'яті (`Map<userId, Instance>`); зупиняється
  на graceful shutdown через `emulator.stopAll()`
- **`AlertEvent` rising-edge**: лічильник стану в БД, не in-memory — переживає
  рестарт сервера, manual clear переносить запис у історію не змінюючи rule
- **`scenarioEngine` rising-edge**: `Map<scenarioId, boolean>` в пам'яті —
  reset при змінах правил, тож новий сценарій не пропускає перший спрацьовок
- **Time-сценарії**: один глобальний `setInterval(60_000)`, дедуп через
  `Math.floor(now / 60_000)` — навіть якщо тікнути двічі за хвилину, виконається
  один раз
- **Theme CSS vars**: `applyPrimary` / `applyBrand` пишуть `--color-*` у `:root`
  inline-стилем; Sidebar/TopBar додатково тримають інлайн `style` для bg/fg/border
  — щоб не залежати від hot-reload Tailwind конфіга при перемиканні палітри

## Ліцензія

Навчальний проєкт у межах дипломної роботи. Використання — вільне.
