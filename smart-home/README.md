# Smart Home — інформаційна система (дипломна робота)

Веб-система для управління розумним домом: збір та зберігання телеметрії з IoT-пристроїв, керування, real-time оновлення та аналітика.

## Технологічний стек

| Шар | Технології |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui, Recharts |
| Backend | Node.js + Express + TypeScript, Prisma ORM |
| БД | PostgreSQL 16 (локально, без Docker) |
| Real-time | Socket.io (WebSocket) |
| Auth | JWT (access + refresh), bcrypt |

## Структура репозиторію

```
smart-home/
├── backend/            # Express API + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── src/
│   │   └── index.ts
│   └── package.json
├── frontend/           # (буде створено на кроці 10+)
├── emulator/           # (буде створено на кроці 9)
└── README.md
```

## Швидкий старт

### Передумови
- Node.js 20+
- Локальний PostgreSQL 16 на `localhost:5432` з БД **`diploma`** (користувач `postgres` / пароль `postgres`)

### 1. Встановити залежності бекенда

```bash
cd backend
cp .env.example .env       # .env вже згенеровано з дефолтами для розробки
npm install
```

### 2. Виконати міграцію та seed

```bash
npx prisma migrate dev --name init   # створює всі 9 таблиць
npm run db:seed                       # створює admin + 3 кімнати + 8 пристроїв
```

### 3. Перевірити, що дані залиті

```bash
psql -h localhost -U postgres -d diploma -c '\dt'
```

### Тестовий обліковий запис

| Поле | Значення |
|---|---|
| email | `admin@smart-home.local` |
| пароль | `admin12345` |

## Корисні команди

```bash
# Запустити dev-сервер (HTTP API + /health на http://localhost:4000)
npm run dev

# Відкрити Prisma Studio (GUI для перегляду БД)
npm run prisma:studio

# Скинути БД (drop + migrate + seed)
npm run db:reset

# Лінт + форматування
npm run lint
npm run format
```

## Схема БД (огляд)

Ієрархія сутностей: **User → House → Room → Device**. 10 таблиць у PostgreSQL (`schema.prisma`):

1. **users** — користувачі, ролі (admin / user)
2. **houses** — будинки, належать користувачу (`user_id`)
3. **rooms** — кімнати, належать будинку (`house_id`)
4. **devices** — пристрої, належать кімнаті (типи: thermostat, lamp, motion_sensor, power_meter, air_quality, water_leak, smart_lock, camera)
5. **telemetry** — сирі дані з пристроїв; **індекс `(device_id, timestamp DESC)`** для швидких запитів
6. **telemetry_aggregated** — погодинні / щоденні агрегати для чартів
7. **device_logs** — історія керування пристроями
8. **scenarios** — сценарії автоматизації (trigger + actions у JSONB)
9. **alerts** — правила порогів
10. **notifications** — сповіщення користувачам

Метрики: `temperature, humidity, power, motion, co2, light_level, water_leak`.

## Дорожня карта

- [x] **Крок 1.** Структура репозиторію + підключення до локального PostgreSQL
- [x] **Крок 2.** Prisma схема всіх 9 таблиць + перша міграція + seed (1 admin, 3 кімнати, 8 пристроїв, 96 точок телеметрії, 3 alert-правила)
- [x] **Крок 3.** Auth (JWT access+refresh) + middleware; самостійна реєстрація користувачів; фронтенд `/login`, `/register`, AuthContext, axios інтерсептор з auto-refresh
- [x] **Крок 4.** Ієрархія `User → House → Room → Device`; повний CRUD на бекенді (`/houses`, `/rooms`, `/devices`) з перевіркою ownership; UI-сторінки `Будинки / Кімнати / Пристрої` з create/rename/toggle/delete
- [ ] **Крок 5.** Telemetry модуль (POST + series + table + CSV-експорт)
- [ ] **Крок 6.** Cron-агрегація (node-cron) щогодини
- [ ] **Крок 7.** WebSocket (Socket.io)
- [ ] **Крок 8.** Alerts + notifications (перевірка порогів)
- [ ] **Крок 9.** Емулятор пристроїв
- [ ] **Крок 10-13.** Frontend (Vite + React + Tailwind + Recharts)
- [ ] **Крок 14.** Фінальний README + скріншоти + ER-діаграма

## Ліцензія

Навчальний проєкт у межах дипломної роботи. Використання — вільне.
