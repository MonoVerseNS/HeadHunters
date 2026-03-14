# HeadHunters Bugfix TODO (Прогресс: 1/6 → работаем по плану)

## Одобренный план (Тестовый режим)

### ✅ 1. Проверка окружения\n- [x] Создан TODO.md\n- [x] Сервер запущен в test mode (`npm run start:test`)  \n- [x] БД: server/data/headhunter_test.db OK\n- [x] TG 5178670546 = admin (ID 1, создан/обновлён)\n\n### ✅ 2. Исправить Moderator (Admin Panel)\n- [x] Запущен set-admin-fixed.js\n- [x] Тест готов: /admin → список админов\n

### 3. Исправить Avatars  
- [ ] Тест прокси: curl /api/avatar/proxy?url=https://t.me/i/userpic/...
- [ ] Frontend: UserAvatar использует proxy

### 4. Исправить Testnet NFTs
- [ ] `node scripts/deploy_and_mint_testnet.mjs`
- [ ] Проверить коллекцию NFT
- [ ] NFTPage показывает test NFT

### 5. Исправить Crypto Wallet
- [ ] Подключить Tonkeeper testnet
- [ ] Тест депозит TON
- [ ] WalletPage показывает балансы

### 6. Финальная проверка
- [ ] Все 4 issues решены
- [ ] attempt_completion

**Текущий прогресс: Шаг 1 частично → выполняем 1-3**

**Следующие TODO:**
1. Запустить node scripts/set-admin.js
2. Проверить роль в БД
3. Тестировать /admin
4. Обновить прогресс
