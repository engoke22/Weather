/**
 * Weather Desk - Telegram weather bot for Cloudflare Workers
 *
 * - Telegram webhook  -> POST /webhook
 * - One-time setup    -> GET  /setup?key=<WEBHOOK_SECRET>
 * - Scheduled updates -> Cron Triggers (morning / midday / evening)
 * - Storage           -> Workers KV (binding: SUBSCRIBERS)
 * - Weather data      -> Open-Meteo (no API key)
 */

const SLOT_NAMES = ["morning", "midday", "evening"];
const SLOT_LABELS = {
  morning: "Morning  07:00",
  midday: "Midday   13:00",
  evening: "Evening  19:00",
};
// Cron runs in UTC. Nairobi is UTC+3 all year: 07:00 -> 04:00, 13:00 -> 10:00, 19:00 -> 16:00
const CRONS = {
  "0 4 * * *": "morning",
  "0 10 * * *": "midday",
  "0 16 * * *": "evening",
};

const LINE = "━".repeat(20);
const ORN = "────  ◆  ────";

// ------------------------------------------------------------------ wording
const CODES = {
  0: "clear sky", 1: "mostly clear skies", 2: "partly cloudy skies", 3: "overcast skies",
  45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 80: "rain showers", 81: "rain showers",
  82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
};

const GREET = {
  morning: [
    "Good morning, {n}.", "Hello {n}, how is your morning?", "Rise and shine, {n}.",
    "{n}, the day has started. Here is your sky report.", "Morning, {n}. Let us see what the sky has planned.",
  ],
  midday: [
    "Good afternoon, {n}.", "Hello {n}, how is your day going?", "A midday check-in for you, {n}.",
    "{n}, pausing the day for a quick sky update.", "Afternoon, {n}. Here is where things stand.",
  ],
  evening: [
    "Good evening, {n}.", "Hello {n}, how did the day treat you?",
    "{n}, as the day winds down, here is the outlook.", "Evening, {n}. Time to look ahead.",
    "Settling in, {n}? Here is tonight and tomorrow.",
  ],
};

const HEAD = {
  clear: [
    "{place} opens the day under a clear, bright sky.",
    "Expect open skies and plenty of sunshine over {place} today.",
    "Not a cloud worth mentioning over {place} this morning.",
    "{place} is set for a clean, sunlit day.",
  ],
  cloudy: [
    "Cloud cover will hang over {place} for much of the day.",
    "{place} gets a soft, grey-toned sky today.",
    "Clouds and light will take turns over {place} today.",
    "A muted sky sits above {place} this morning.",
  ],
  rain: [
    "Rain is part of the plan in {place} today.",
    "{place} should expect wet spells as the day moves on.",
    "The sky over {place} is leaning towards rain today.",
    "Dry moments will be rare in {place} today.",
  ],
  storm: [
    "Thunderstorm activity is possible over {place} today.",
    "{place} may see a stormy day, so keep plans flexible.",
    "Heavy weather is building over {place} today.",
  ],
  fog: [
    "Fog blankets {place} this morning and should lift slowly.",
    "Visibility is low in {place} at the start of the day.",
    "{place} begins the day wrapped in mist.",
  ],
};

const MIDDAY_T = [
  "Right now {place} is at {t}, feels like {f}, and conditions are {desc}.",
  "{place} check: {t} on the thermometer, {f} on the skin, {desc} overhead.",
  "At this hour {place} reads {t} ({f} feels-like) with {desc}.",
  "Current conditions in {place}: {desc}, {t}, feels like {f}.",
];

const EVENING_T = [
  "Tomorrow in {place} looks like {desc}, with a high of {hi} and a low of {lo}.",
  "The forecast for {place} tomorrow: {desc}, warming to {hi} after a start near {lo}.",
  "Looking ahead, {place} can expect {desc} tomorrow, between {lo} and {hi}.",
  "By tomorrow {place} turns to {desc}, topping out at {hi}.",
];

const DRY_LINES = [
  "No rain is expected over the next few hours.",
  "The next six hours look dry.",
  "Rain stays away for the rest of the afternoon.",
  "Nothing wet on the radar for now.",
];

const TREND = {
  same: ["Tomorrow will feel much like today.", "Temperatures hold steady into tomorrow.",
    "No big temperature swing ahead."],
  warm: ["Tomorrow runs about {d} warmer than today.", "Expect a warmer day tomorrow, up roughly {d}.",
    "Heat creeps up by around {d} tomorrow."],
  cool: ["Tomorrow is about {d} cooler than today.", "A cooler day follows, down roughly {d}.",
    "Temperatures dip by around {d} tomorrow."],
};

const ADV = {
  storm: ["Stay indoors during the heavy bursts and keep devices charged.",
    "Avoid open ground and tall trees if thunder starts.",
    "Plan travel around the storm windows, not through them."],
  rain: ["Keep an umbrella within reach today.", "A light jacket and waterproof shoes will pay off.",
    "Leave a little extra time for the road, wet surfaces slow everyone down.",
    "If washing is drying outside, keep an eye on the sky."],
  hot: ["Drink water steadily through the day, not all at once.",
    "Light clothing and shade breaks are your friends today.",
    "Do the heavy work early, the afternoon will be warm."],
  uv: ["The sun is strong, so sunscreen and a hat are worth it.",
    "Midday sun is at its sharpest, so seek shade if you can.",
    "UV is high today, cover up if you will be outside for long."],
  wind: ["It will be breezy, so secure anything light outdoors.",
    "Gusty conditions may make it feel cooler than the number says."],
  cold: ["Layer up, the cool hours will be noticeable.",
    "Keep a warm layer close for the early and late hours."],
  clear: ["A good day for anything outdoors.",
    "Open sky makes it a fine day to get things done outside.",
    "Plenty of light today, make use of it."],
  cloudy: ["Comfortable conditions for a long walk or a full day out.",
    "Soft light and mild air, a steady kind of day.",
    "A layer in the bag is enough, nothing dramatic is expected."],
  fog: ["Drive slowly until the fog lifts.", "Give yourself a few extra minutes for the morning commute."],
};

const SIGN = {
  morning: ["Make it a good one.", "Go well today.", "Step out with intention.", "The day is yours."],
  midday: ["Carry on, the rest of the day is ahead.", "Back to it, well informed.",
    "Enjoy the second half.", "That is the midday picture."],
  evening: ["Rest well.", "Sleep easy, the sky will handle the night.",
    "Close the day gently.", "See you when the sun is up."],
};

const FACTS = [
  "Rain smells the way it does because of a compound called petrichor, released from soil.",
  "Lightning is several times hotter than the surface of the sun.",
  "A single cloud can weigh as much as a hundred elephants.",
  "Wind is simply air moving from high pressure to low pressure.",
  "Fog is a cloud that forms at ground level.",
  "Raindrops fall at roughly 9 to 30 kilometres per hour, depending on their size.",
  "Thunder is the sound of air expanding violently around a lightning bolt.",
  "Humidity makes warm air feel hotter because sweat evaporates more slowly.",
  "The equator sees some of the most frequent thunderstorms on Earth.",
  "Clouds look white because their droplets scatter all colours of light equally.",
];

// ------------------------------------------------------------------ helpers
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const deg = (x) => `${Math.round(x)}°C`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const nairobiNow = () => new Date(Date.now() + 3 * 3600 * 1000);
const dayNumber = () => Math.floor(nairobiNow().getTime() / 86400000);

function currentSlot() {
  const h = nairobiNow().getUTCHours();
  return h < 12 ? "morning" : h < 17 ? "midday" : "evening";
}

/**
 * Picks wording without needing to store history.
 * Scheduled updates rotate through each pool day by day (and slot by slot),
 * so the same phrase never appears twice in a row. Manual taps pick at random.
 */
function pick(u, mode, key, options) {
  const n = options.length;
  const i = mode.manual
    ? Math.floor(Math.random() * n)
    : (mode.day + SLOT_NAMES.indexOf(mode.slot) + hash(`${u.id}:${key}`)) % n;
  return options[i];
}

function sky(code) {
  if (code === 0 || code === 1) return "clear";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}

const uvLabel = (v) => (v < 3 ? "low" : v < 6 ? "moderate" : v < 8 ? "high" : v < 11 ? "very high" : "extreme");

function stats(rows) {
  const width = Math.max(...rows.map((r) => r[0].length)) + 2;
  return "<pre>" + rows.map(([k, v]) => k.padEnd(width) + v).join("\n") + "</pre>";
}

function nowIdx(w) {
  const i = w.hourly.time.indexOf(w.current.time.slice(0, 13) + ":00");
  return i < 0 ? 0 : i;
}

function advice(u, mode, s, tmax, tmin, rain, uv, wind) {
  let name;
  if (s === "storm") name = "storm";
  else if (s === "rain" || rain >= 60) name = "rain";
  else if (tmax >= 30) name = "hot";
  else if (uv >= 8) name = "uv";
  else if (wind >= 30) name = "wind";
  else if (tmin <= 10) name = "cold";
  else name = s;
  return pick(u, mode, "adv_" + name, ADV[name]);
}

function maybeFact(u, mode) {
  const show = mode.manual ? Math.random() < 0.4 : (mode.day + hash(`${u.id}:factgate`)) % 5 < 2;
  return show ? `\n<i>Weather note: ${esc(pick(u, mode, "fact", FACTS))}</i>\n` : "";
}

// ------------------------------------------------------------------ weather data
async function geocode(query) {
  try {
    const r = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?count=5&name=" + encodeURIComponent(query)
    );
    const j = await r.json();
    return (j.results || []).map((g) => ({
      place: g.name, admin: g.admin1 || "", country: g.country || "", lat: g.latitude, lon: g.longitude,
    }));
  } catch {
    return [];
  }
}

async function fetchWeather(u) {
  try {
    const p = new URLSearchParams({
      latitude: u.lat, longitude: u.lon, timezone: "auto", forecast_days: "3",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
      hourly: "temperature_2m,precipitation_probability",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max",
    });
    const r = await fetch("https://api.open-meteo.com/v1/forecast?" + p);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ composers
function composeMorning(u, w, mode) {
  const P = (k, o) => pick(u, mode, k, o);
  const d = w.daily;
  const s = sky(d.weather_code[0]);
  const rain = d.precipitation_probability_max[0] ?? 0;
  const uv = d.uv_index_max[0] ?? 0;
  const rows = [
    ["Temperature", `${deg(d.temperature_2m_min[0])} to ${deg(d.temperature_2m_max[0])}`],
    ["Rain chance", `${rain}%`],
    ["UV index", `${Math.round(uv)} (${uvLabel(uv)})`],
    ["Sunrise", d.sunrise[0].slice(11, 16)],
    ["Sunset", d.sunset[0].slice(11, 16)],
  ];
  const tip = advice(u, mode, s, d.temperature_2m_max[0], d.temperature_2m_min[0], rain, uv, d.wind_speed_10m_max[0] ?? 0);
  return (
    `${esc(fmt(P("greet", GREET.morning), { n: u.name }))}\n${LINE}\n` +
    `${esc(fmt(P("head_" + s, HEAD[s]), { place: u.place }))}\n\n${stats(rows)}${esc(tip)}\n` +
    `${maybeFact(u, mode)}${ORN}\n<i>${esc(P("sign", SIGN.morning))}</i>`
  );
}

function composeMidday(u, w, mode) {
  const P = (k, o) => pick(u, mode, k, o);
  const c = w.current, d = w.daily, i = nowIdx(w);
  const probs = w.hourly.precipitation_probability.slice(i, i + 7).map((x) => x ?? 0);
  const peak = probs.length ? Math.max(...probs) : 0;
  const peakTime = probs.length ? w.hourly.time[i + probs.indexOf(peak)].slice(11, 16) : "";
  const rainLine = peak >= 40 ? `Rain looks most likely around ${peakTime} (${peak}%).` : P("dry", DRY_LINES);
  const head = fmt(P("head", MIDDAY_T), {
    place: u.place, t: deg(c.temperature_2m), f: deg(c.apparent_temperature),
    desc: CODES[c.weather_code] || "changing conditions",
  });
  const rows = [
    ["Now", deg(c.temperature_2m)],
    ["Feels like", deg(c.apparent_temperature)],
    ["Humidity", `${c.relative_humidity_2m}%`],
    ["Wind", `${Math.round(c.wind_speed_10m)} km/h`],
    ["Rain, next 6h", `${peak}% peak`],
  ];
  const tip = advice(u, mode, sky(c.weather_code), d.temperature_2m_max[0], d.temperature_2m_min[0], peak,
    d.uv_index_max[0] ?? 0, c.wind_speed_10m);
  return (
    `${esc(fmt(P("greet", GREET.midday), { n: u.name }))}\n${LINE}\n` +
    `${esc(head)}\n\n${stats(rows)}${esc(rainLine)} ${esc(tip)}\n` +
    `${maybeFact(u, mode)}${ORN}\n<i>${esc(P("sign", SIGN.midday))}</i>`
  );
}

function composeEvening(u, w, mode) {
  const P = (k, o) => pick(u, mode, k, o);
  const d = w.daily, i = nowIdx(w);
  const temps = w.hourly.temperature_2m.slice(i, i + 10);
  const nightLow = temps.length ? Math.min(...temps) : d.temperature_2m_min[0];
  const hi = d.temperature_2m_max[1], lo = d.temperature_2m_min[1];
  const rain = d.precipitation_probability_max[1] ?? 0;
  const diff = hi - d.temperature_2m_max[0];
  const kind = Math.abs(diff) < 1.5 ? "same" : diff > 0 ? "warm" : "cool";
  const trend = fmt(P("trend_" + kind, TREND[kind]), { d: deg(Math.abs(diff)) });
  const head = fmt(P("head", EVENING_T), {
    place: u.place, desc: CODES[d.weather_code[1]] || "changing conditions", hi: deg(hi), lo: deg(lo),
  });
  const rows = [
    ["Overnight low", deg(nightLow)],
    ["Tomorrow high", deg(hi)],
    ["Tomorrow low", deg(lo)],
    ["Rain chance", `${rain}%`],
    ["Sunrise", d.sunrise[1].slice(11, 16)],
  ];
  const tip = advice(u, mode, sky(d.weather_code[1]), hi, lo, rain, d.uv_index_max[1] ?? 0, d.wind_speed_10m_max[1] ?? 0);
  return (
    `${esc(fmt(P("greet", GREET.evening), { n: u.name }))}\n${LINE}\n` +
    `${esc(head)}\n\n${stats(rows)}${esc(trend)} ${esc(tip)}\n` +
    `${maybeFact(u, mode)}${ORN}\n<i>${esc(P("sign", SIGN.evening))}</i>`
  );
}

const COMPOSE = { morning: composeMorning, midday: composeMidday, evening: composeEvening };
const manualMode = () => ({ day: dayNumber(), manual: true, slot: currentSlot() });

function viewHours(u, w) {
  const h = w.hourly, i = nowIdx(w), rows = [];
  for (let j = i; j <= i + 12 && j < h.time.length; j += 2) {
    rows.push([h.time[j].slice(11, 16), `${deg(h.temperature_2m[j]).padEnd(6)} rain ${h.precipitation_probability[j] ?? 0}%`]);
  }
  return `<b>NEXT 12 HOURS</b>\n${esc(u.place)}\n${LINE}\n${stats(rows)}`;
}

function viewOutlook(u, w) {
  const d = w.daily, names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blocks = [0, 1, 2].map((j) => {
    const day = `${names[new Date(d.time[j] + "T00:00:00Z").getUTCDay()]} ${d.time[j].slice(8, 10)}`;
    const desc = cap(CODES[d.weather_code[j]] || "mixed conditions");
    return `${day}  ${desc}\n       ${deg(d.temperature_2m_min[j])} to ${deg(d.temperature_2m_max[j])}, rain ${d.precipitation_probability_max[j] ?? 0}%`;
  });
  return `<b>3-DAY OUTLOOK</b>\n${esc(u.place)}\n${LINE}\n<pre>${blocks.join("\n\n")}</pre>`;
}

// ------------------------------------------------------------------ Telegram + menus
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const send = (env, chat, text, markup) =>
  tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", reply_markup: markup });
const edit = (env, q, text, markup) =>
  tg(env, "editMessageText", {
    chat_id: q.message.chat.id, message_id: q.message.message_id, text, parse_mode: "HTML", reply_markup: markup,
  });

const kb = (rows) => ({
  inline_keyboard: rows.map((r) => r.map(([text, data]) => ({ text, callback_data: data }))),
});

const MAIN = kb([[["Weather Now", "now"]], [["Next 12 Hours", "hours"]], [["3-Day Outlook", "outlook"]],
  [["Change Place", "place"]], [["Settings", "settings"]]]);
const BACK = kb([[["Back to Menu", "menu"]]]);
const NOW_KB = kb([[["Refresh", "now"]], [["Back to Menu", "menu"]]]);
const OPEN_MENU = kb([[["Open Menu", "menu"]]]);
const STOP_KB = kb([[["Yes, unsubscribe", "stop_yes"]], [["Keep me subscribed", "menu"]]]);
const SETTINGS_TEXT = `<b>SETTINGS</b>\n${LINE}\nTap a time to switch that update on or off.`;
const UNREACHABLE = "The weather service is not responding. Please try again shortly.";

const menuText = (u) =>
  `<b>WEATHER DESK</b>\n${LINE}\nSubscriber:  ${esc(u.name)}\nLocation:    ${esc(u.place)}\n${LINE}\nChoose an option below.`;

const settingsKb = (u) =>
  kb([
    ...SLOT_NAMES.map((s) => [[`${SLOT_LABELS[s]}    ${u.slots[s] ? "ON" : "OFF"}`, `tog:${s}`]]),
    [["Change Name", "name"]], [["Unsubscribe", "stop"]], [["Back to Menu", "menu"]],
  ]);

// ------------------------------------------------------------------ storage (KV)
const ukey = (id) => `u:${id}`;
const getUser = (env, id) => env.SUBSCRIBERS.get(ukey(id), "json");
// List metadata carries what the scheduler needs, so broadcasts need no per-user reads.
const meta = (u) => ({
  n: (u.name || "").slice(0, 30), p: (u.place || "").slice(0, 60), la: u.lat ?? null, lo: u.lon ?? null,
  s: SLOT_NAMES.map((s) => (u.slots[s] ? 1 : 0)).join(""),
});
const putUser = (env, u) => env.SUBSCRIBERS.put(ukey(u.id), JSON.stringify(u), { metadata: meta(u) });
const newUser = (id) => ({ id, step: "name", slots: { morning: true, midday: true, evening: true }, pending: [] });

// ------------------------------------------------------------------ handlers
async function handleUpdate(update, env) {
  if (update.callback_query) return onButton(update.callback_query, env);
  if (update.message && update.message.text) return onMessage(update.message, env);
}

async function startFlow(env, id) {
  await putUser(env, newUser(id));
  return send(env, id, `<b>WEATHER DESK</b>\n${LINE}\nWelcome. What is your name?`);
}

async function sendNow(env, id, u) {
  const w = await fetchWeather(u);
  if (!w) return send(env, id, UNREACHABLE, BACK);
  const mode = manualMode();
  return send(env, id, COMPOSE[mode.slot](u, w, mode), NOW_KB);
}

async function onCommand(env, id, cmd) {
  if (cmd === "start") return startFlow(env, id);
  const u = await getUser(env, id);
  if (!u) return startFlow(env, id);

  if (cmd === "place") {
    u.step = "place";
    await putUser(env, u);
    return send(env, id, "Send me the name of your town or city.", BACK);
  }
  if (cmd === "stop") return send(env, id, "Unsubscribe from all updates?", STOP_KB);
  if (cmd === "settings") return send(env, id, SETTINGS_TEXT, settingsKb(u));

  if (u.lat == null) return startFlow(env, id);
  if (cmd === "weather") return sendNow(env, id, u);
  return send(env, id, menuText(u), MAIN); // menu and anything else
}

async function onMessage(m, env) {
  const id = m.chat.id;
  const text = m.text.trim();
  if (text.startsWith("/")) {
    return onCommand(env, id, text.split(/\s+/)[0].split("@")[0].slice(1).toLowerCase());
  }
  const u = await getUser(env, id);
  if (!u) return send(env, id, "Send /start to subscribe.");

  if (u.step === "name") {
    const first = text.split(/\s+/)[0].slice(0, 30);
    u.name = cap(first.toLowerCase());
    if (u.lat != null) {
      u.step = null;
      await putUser(env, u);
      return send(env, id, `Name updated to ${esc(u.name)}.`, MAIN);
    }
    u.step = "place";
    await putUser(env, u);
    return send(env, id, `Nice to meet you, ${esc(u.name)}.\nWhich town or city should I follow?`);
  }

  if (u.step === "place") {
    const results = await geocode(text);
    if (!results.length) return send(env, id, "No match found. Try another spelling or a nearby town.");
    if (results.length === 1) return finishPlace(env, u, results[0]);
    u.pending = results;
    await putUser(env, u);
    const rows = results.map((g, i) => [
      [[g.place, g.admin, g.country].filter(Boolean).join(", ").slice(0, 55), `pick:${i}`],
    ]);
    rows.push([["Search again", "place"]]);
    return send(env, id, `<b>SELECT YOUR PLACE</b>\n${LINE}\nTap the correct match.`, kb(rows));
  }

  return send(env, id, u.lat != null ? menuText(u) : "Send /start to finish setup.", u.lat != null ? MAIN : undefined);
}

async function finishPlace(env, u, g, q) {
  const firstTime = !u.place;
  Object.assign(u, { place: g.place, lat: g.lat, lon: g.lon, step: null, pending: [] });
  await putUser(env, u);
  const text =
    `<b>LOCATION SET</b>\n${LINE}\nFollowing ${esc(g.place)}.\n` +
    `Updates arrive at 07:00, 13:00 and 19:00.\nChange anything from the menu.`;
  if (q) await edit(env, q, text, MAIN);
  else await send(env, u.id, text, MAIN);
  if (firstTime) {
    const w = await fetchWeather(u);
    if (w) {
      const mode = manualMode();
      await send(env, u.id, COMPOSE[mode.slot](u, w, mode));
    }
  }
}

async function onButton(q, env) {
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
  const id = q.message.chat.id;
  const data = q.data;
  const u = await getUser(env, id);
  if (!u) return edit(env, q, "Send /start to subscribe.");

  if (data === "menu") {
    return u.lat != null ? edit(env, q, menuText(u), MAIN) : edit(env, q, "Send /start to finish setup.");
  }

  if (data === "now" || data === "hours" || data === "outlook") {
    if (u.lat == null) return edit(env, q, "Set your place first with /place.");
    const w = await fetchWeather(u);
    if (!w) return edit(env, q, UNREACHABLE, BACK);
    if (data === "now") {
      const mode = manualMode();
      return edit(env, q, COMPOSE[mode.slot](u, w, mode), NOW_KB);
    }
    return edit(env, q, data === "hours" ? viewHours(u, w) : viewOutlook(u, w), BACK);
  }

  if (data === "place") {
    u.step = "place";
    await putUser(env, u);
    return edit(env, q, "Send me the name of your town or city.", BACK);
  }

  if (data.startsWith("pick:")) {
    const g = (u.pending || [])[Number(data.split(":")[1])];
    if (g) return finishPlace(env, u, g, q);
    return;
  }

  if (data === "settings") return edit(env, q, SETTINGS_TEXT, settingsKb(u));

  if (data.startsWith("tog:")) {
    const slot = data.split(":")[1];
    if (slot in u.slots) {
      u.slots[slot] = !u.slots[slot];
      await putUser(env, u);
    }
    return edit(env, q, SETTINGS_TEXT, settingsKb(u));
  }

  if (data === "name") {
    u.step = "name";
    await putUser(env, u);
    return edit(env, q, "What should I call you?", BACK);
  }

  if (data === "stop") return edit(env, q, "Unsubscribe from all updates?", STOP_KB);

  if (data === "stop_yes") {
    await env.SUBSCRIBERS.delete(ukey(id));
    return edit(env, q, `<b>UNSUBSCRIBED</b>\n${LINE}\nSend /start whenever you want to return.`);
  }
}

// ------------------------------------------------------------------ scheduled updates
async function broadcast(env, slot) {
  const idx = SLOT_NAMES.indexOf(slot);
  const users = [];
  let cursor;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: "u:", cursor });
    for (const k of page.keys) {
      const m = k.metadata;
      if (!m || m.la == null || !m.s || m.s[idx] !== "1") continue;
      users.push({ id: k.name.slice(2), name: m.n, place: m.p, lat: m.la, lon: m.lo });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  // One weather request per distinct place, shared by everyone who follows it
  const cache = new Map();
  const weatherFor = (u) => {
    const ck = `${Number(u.lat).toFixed(2)},${Number(u.lon).toFixed(2)}`;
    if (!cache.has(ck)) cache.set(ck, fetchWeather(u));
    return cache.get(ck);
  };

  const mode = { day: dayNumber(), manual: false, slot };
  for (let i = 0; i < users.length; i += 5) {
    await Promise.all(
      users.slice(i, i + 5).map(async (u) => {
        try {
          const w = await weatherFor(u);
          if (!w) return;
          const r = await send(env, u.id, COMPOSE[slot](u, w, mode), OPEN_MENU);
          if (!r.ok && r.error_code === 403) await env.SUBSCRIBERS.delete(ukey(u.id)); // user blocked the bot
        } catch (e) {
          console.error("send failed", u.id, e);
        }
      })
    );
  }
}

// ------------------------------------------------------------------ entry points
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/setup") {
      if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const hook = await tg(env, "setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      });
      const cmds = await tg(env, "setMyCommands", {
        commands: [
          { command: "menu", description: "Open the main menu" },
          { command: "weather", description: "Weather right now" },
          { command: "place", description: "Change your place" },
          { command: "settings", description: "Update times and name" },
          { command: "stop", description: "Unsubscribe" },
        ],
      });
      return Response.json({ webhook: hook, commands: cmds });
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = await req.json();
      ctx.waitUntil(handleUpdate(update, env).catch((e) => console.error("update failed", e)));
      return new Response("ok");
    }

    return new Response("Weather Desk is running.");
  },

  async scheduled(event, env, ctx) {
    const slot = CRONS[event.cron];
    if (slot) ctx.waitUntil(broadcast(env, slot).catch((e) => console.error("broadcast failed", e)));
  },
};
