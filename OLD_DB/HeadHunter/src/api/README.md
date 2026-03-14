# HeadHunters API Documentation

## Base URL
```
api.domain/request
```
In development: `http://localhost:5180/api/`

> Currently runs in **mock mode** (localStorage). Swap to real backend by changing `VITE_API_URL` in `.env`.

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `auth/login` | Login via Telegram ID |
| GET | `auth/users` | List all users |
| GET | `auth/user?id=` | Get user by ID |
| POST | `auth/block` | Block user `{ id }` |
| POST | `auth/unblock` | Unblock user `{ id }` |

## Wallet

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `wallet/balance?userId=` | Get user balance |
| GET | `wallet/platform` | Get platform balance |
| POST | `wallet/deposit` | Deposit `{ userId, amount }` |
| POST | `wallet/withdraw` | Withdraw `{ userId, amount, address }` |
| POST | `wallet/transfer` | Transfer `{ fromId, toId, amount }` |

## NFT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `nft/list` | List all NFTs |
| GET | `nft/get?id=` | Get NFT by ID |
| POST | `nft/create` | Create NFT `{ name, image, ... }` |
| POST | `nft/upgrade` | Upgrade NFT `{ id, bgColor, pattern }` |
| POST | `nft/transfer` | Transfer `{ id, targetUserId }` |
| POST | `nft/withdraw` | Withdraw `{ id, walletAddress }` |

## Auction

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `auction/list` | List all auctions |
| GET | `auction/get?id=` | Get auction by ID |
| POST | `auction/create` | Create auction `{ nftId, startPrice, duration }` |
| POST | `auction/bid` | Place bid `{ auctionId, amount }` |
| POST | `auction/buyNow` | Buy now `{ auctionId }` |
| POST | `auction/cancel` | Cancel `{ auctionId }` |
| POST | `auction/claim` | Claim won NFT `{ auctionId }` |

## Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `admin/stats` | Platform statistics |
| GET | `admin/logs` | Activity logs |
| POST | `admin/mint` | Mint HH `{ amount }` |
| POST | `admin/ban` | Ban user `{ userId }` |
| GET | `admin/endpoints` | List all endpoints |

## Clicker

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `clicker/state` | Get user's clicker state |
| POST | `clicker/tap` | Register tap `{ userId }` |
| POST | `clicker/withdraw` | Withdraw `{ userId, amount }` |

---

## Response Format
```json
{
  "ok": true,
  "data": { ... }
}
```

Error:
```json
{
  "ok": false,
  "error": "Error message"
}
```

## Config
Set `VITE_API_URL` in `.env` to point to your backend:
```
VITE_API_URL=https://api.yourdomain.com
```
