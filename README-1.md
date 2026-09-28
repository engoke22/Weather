# Weather Desk - Cloudflare Worker

Telegram weather bot with button menus, rotating wording and three daily updates.

## Deploy

1. Create the bot in Telegram with @BotFather and copy the token.
2. In this folder:
   ```
   npm i -g wrangler
   wrangler login
   wrangler kv namespace create SUBSCRIBERS
   ```
   Copy the namespace `id` it prints into `wrangler.toml`.
3. Add two secrets:
   ```
   wrangler secret put BOT_TOKEN
   wrangler secret put WEBHOOK_SECRET
   ```
   For `WEBHOOK_SECRET` use any long random string of letters and numbers only.
4. Deploy:
   ```
   wrangler deploy
   ```
   It prints your Worker URL, like `https://weather-desk-bot.<you>.workers.dev`.
5. Register the webhook once by opening this in a browser:
   ```
   https://weather-desk-bot.<you>.workers.dev/setup?key=<WEBHOOK_SECRET>
   ```
   You should see `"ok":true` twice.
6. Open your bot in Telegram and send `/start`.

## Update times

Cron Triggers use UTC. Nairobi is UTC+3, so:

| Update  | Nairobi | Cron in wrangler.toml |
|---------|---------|-----------------------|
| Morning | 07:00   | `0 4 * * *`           |
| Midday  | 13:00   | `0 10 * * *`          |
| Evening | 19:00   | `0 16 * * *`          |

If you change a cron, update the matching entry in the `CRONS` map at the top of `src/index.js`.

## Test and debug

- Live logs: `wrangler tail`
- Trigger an update locally: `wrangler dev --test-scheduled`, then open
  `http://localhost:8787/__scheduled?cron=0+4+*+*+*`

## Free plan limits

- A single scheduled run can make 50 outbound requests on the free plan. Each update costs one weather request per distinct place plus one Telegram message per subscriber, so the free plan handles roughly 30 to 40 subscribers per update. The Workers Paid plan raises this to 1,000.
- KV free tier allows 1,000 writes a day. The bot only writes when someone signs up or changes their name, place or settings, not on every update.
- Old `subscribers.json` data from the Python version is not migrated. Subscribers just send `/start` again.
