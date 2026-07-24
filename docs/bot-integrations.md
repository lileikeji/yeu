# QQ and WeChat bot integration

The site exposes disabled-by-default server webhooks. Group messages are answered only when the bot is explicitly mentioned. Every reply ends with `官网：https://yeu.huiliyill.cn/`.

## QQ via OneBot 11

Use NapCat or Lagrange as the OneBot gateway. Configure its HTTP event callback as:

```text
POST https://yeu.huiliyill.cn/api/integrations/bots/qq-onebot
Authorization: Bearer <NUXT_QQ_BOT_WEBHOOK_TOKEN>
```

The YEU server also needs access to the gateway's OneBot HTTP API. Public plain HTTP is rejected; use HTTPS or a loopback address through a local gateway/VPN.

```dotenv
NUXT_QQ_BOT_WEBHOOK_TOKEN=<random secret, at least 32 characters>
NUXT_QQ_BOT_API_URL=http://127.0.0.1:3005/
NUXT_QQ_BOT_API_TOKEN=<OneBot API token>
NUXT_QQ_BOT_SELF_ID=<QQ number>
```

Supported inbound events are OneBot 11 group `message` events with an `at` segment targeting `self_id`. Private messages, `@全体成员`, messages for other bots, duplicates and messages without a question after the mention are ignored.

## WeChat relay

Personal WeChat does not provide an official inbound group-message API. Run a Gewechat/Wechaty relay and translate its message event to this contract:

```json
{
  "event": "message",
  "messageId": "unique-message-id",
  "roomId": "group-room-id",
  "senderId": "sender-id",
  "botId": "bot-id",
  "text": "@bot 开学时间是什么时候？",
  "cleanText": "开学时间是什么时候？",
  "isAt": true,
  "mentionedIds": ["bot-id"]
}
```

Send it to `POST /api/integrations/bots/wechat` with:

```text
X-Yeu-Timestamp: <Unix milliseconds>
X-Yeu-Signature: sha256=<HMAC-SHA256(secret, timestamp + "." + raw JSON body)>
```

The relay send endpoint receives the following signed JSON from YEU:

```json
{
  "roomId": "group-room-id",
  "replyToMessageId": "unique-message-id",
  "text": "answer\n\n官网：https://yeu.huiliyill.cn/"
}
```

Configure:

```dotenv
NUXT_WECHAT_BOT_WEBHOOK_SECRET=<random secret, at least 32 characters>
NUXT_WECHAT_BOT_SEND_URL=https://relay.example.com/api/send
NUXT_WECHAT_BOT_ID=<relay bot id>
NUXT_WECHAT_BOT_NAME=<display name used after @>
```

Shared settings:

```dotenv
NUXT_BOT_SITE_URL=https://yeu.huiliyill.cn/
NUXT_BOT_MAX_REPLY_CHARS=1800
```

Both integrations use the existing assistant database/API/MCP routing, write runs to the AI analytics table, limit each group to 12 accepted questions per minute, and deduplicate platform message IDs for 30 minutes.
