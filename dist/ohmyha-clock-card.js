/*!
 * OhMyHA Clock Card
 * A glowing clock + greeting tile for Home Assistant dashboards.
 * Free, MIT licence. Made by OhMyHA — https://ohmyha.com
 */
const VERSION = "1.0.0";

const GREETINGS = {
  fr: ["Bonne nuit", "Bonjour", "Bon après-midi", "Bonsoir"],
  en: ["Good night", "Good morning", "Good afternoon", "Good evening"],
  de: ["Gute Nacht", "Guten Morgen", "Guten Tag", "Guten Abend"],
  es: ["Buenas noches", "Buenos días", "Buenas tardes", "Buenas noches"],
  it: ["Buona notte", "Buongiorno", "Buon pomeriggio", "Buonasera"],
  nl: ["Goedenacht", "Goedemorgen", "Goedemiddag", "Goedenavond"],
  pt: ["Boa noite", "Bom dia", "Boa tarde", "Boa noite"],
};

const WEATHER_ICONS = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const DEFAULTS = {
  day_color: "255,183,3",
  night_color: "0,242,254",
  second_color: "168,85,247",
  day_start: 6,
  night_start: 18,
  show_bar: true,
  show_seconds: false,
  height: 165,
  clock_weight: 300,
};

/** "#ffb703", "ffb703", "255,183,3" or [255,183,3] -> "255,183,3" */
function toRgb(value, fallback) {
  if (value == null || value === "") return fallback;
  if (Array.isArray(value) && value.length >= 3) return value.slice(0, 3).join(",");
  const s = String(value).trim();
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex.split("").map((c) => parseInt(c + c, 16)).join(",");
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  }
  const m = s.match(/^(?:rgb\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
  return m ? `${m[1]},${m[2]},${m[3]}` : fallback;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class OhMyHAClockCard extends HTMLElement {
  static getStubConfig(hass) {
    const weather = hass && Object.keys(hass.states).find((e) => e.startsWith("weather."));
    return weather ? { weather } : {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "name", selector: { text: {} } },
        { name: "show_user_name", selector: { boolean: {} } },
        { name: "weather", selector: { entity: { domain: "weather" } } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "show_seconds", selector: { boolean: {} } },
            { name: "show_bar", selector: { boolean: {} } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "day_color", selector: { color_rgb: {} } },
            { name: "night_color", selector: { color_rgb: {} } },
            { name: "second_color", selector: { color_rgb: {} } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "day_start", selector: { number: { min: 0, max: 23, mode: "box" } } },
            { name: "night_start", selector: { number: { min: 0, max: 23, mode: "box" } } },
          ],
        },
        {
          name: "time_format",
          selector: { select: { mode: "dropdown", options: [
            { value: "", label: "Auto" },
            { value: "24", label: "24h" },
            { value: "12", label: "12h" },
          ] } },
        },
        {
          name: "clock_weight",
          selector: { select: { mode: "dropdown", options: [
            { value: "100", label: "Thin" },
            { value: "200", label: "Extra light" },
            { value: "300", label: "Light (default)" },
            { value: "400", label: "Regular" },
          ] } },
        },
        { name: "language", selector: { language: {} } },
      ],
      computeLabel: (s) =>
        ({
          name: "Name in the greeting (optional)",
          show_user_name: "Use the logged-in user's first name",
          weather: "Weather entity (optional)",
          show_seconds: "Show seconds",
          show_bar: "Show day progress bar",
          day_color: "Day colour",
          night_color: "Night colour",
          second_color: "Second colour (bar end)",
          day_start: "Day starts at (hour)",
          night_start: "Night starts at (hour)",
          time_format: "Time format",
          language: "Language (default: Home Assistant's)",
          clock_weight: "Clock thickness",
        }[s.name]),
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...DEFAULTS, ...config };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${OhMyHAClockCard.styles}</style>
        <ha-card>
          <div class="greet"></div>
          <div class="time"></div>
          <div class="date"><span class="d"></span><span class="w"></span></div>
          <div class="bar"></div>
        </ha-card>`;
    }
    this._render();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    const w = this._config && this._config.weather;
    if (!old || (w && old.states[w] !== hass.states[w]) || old.language !== hass.language) {
      this._render();
    }
  }

  connectedCallback() {
    this._render();
    this._schedule();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    this._timer = undefined;
  }

  _schedule() {
    clearTimeout(this._timer);
    const now = new Date();
    const wait = this._config && this._config.show_seconds
      ? 1000 - now.getMilliseconds()
      : (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    this._timer = setTimeout(() => {
      this._render();
      this._schedule();
    }, wait + 20);
  }

  _lang() {
    const c = this._config.language;
    const h = this._hass;
    return (c || (h && h.locale && h.locale.language) || (h && h.language) || navigator.language || "en");
  }

  _is12h(lang) {
    const f = String(this._config.time_format || "");
    if (f === "12") return true;
    if (f === "24") return false;
    const tf = this._hass && this._hass.locale && this._hass.locale.time_format;
    if (tf === "12") return true;
    if (tf === "24") return false;
    try {
      return new Intl.DateTimeFormat(lang, { hour: "numeric" }).resolvedOptions().hour12 === true;
    } catch (e) {
      return false;
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const c = this._config;
    const root = this.shadowRoot;
    const now = new Date();
    const h = now.getHours();
    const lang = this._lang();
    const base = lang.toLowerCase().split(/[-_]/)[0];

    const dayStart = Number(c.day_start);
    const nightStart = Number(c.night_start);
    const isDay = dayStart <= nightStart ? h >= dayStart && h < nightStart : h >= dayStart || h < nightStart;
    const accent = isDay ? toRgb(c.day_color, DEFAULTS.day_color) : toRgb(c.night_color, DEFAULTS.night_color);
    const second = toRgb(c.second_color, DEFAULTS.second_color);
    const pct = Math.round(((h * 60 + now.getMinutes()) / 14.4) * 10) / 10;

    const card = root.querySelector("ha-card");
    card.style.setProperty("--omh-accent", accent);
    card.style.setProperty("--omh-second", second);
    card.style.setProperty("--omh-pct", pct + "%");
    card.style.setProperty("--omh-weight", String(Number(c.clock_weight) || DEFAULTS.clock_weight));
    card.style.setProperty("--omh-height", (Number(c.height) || DEFAULTS.height) + "px");

    // Greeting
    const g = GREETINGS[base] || GREETINGS.en;
    const word = h < 6 ? g[0] : h < 12 ? g[1] : h < 18 ? g[2] : g[3];
    let name = c.name ? String(c.name) : "";
    if (!name && c.show_user_name && this._hass && this._hass.user && this._hass.user.name) {
      name = this._hass.user.name.split(" ")[0];
    }
    root.querySelector(".greet").textContent = name ? `${word} ${name}` : word;

    // Time
    const twelve = this._is12h(lang);
    let hh = h;
    let suffix = "";
    if (twelve) {
      suffix = h < 12 ? " AM" : " PM";
      hh = h % 12 || 12;
    }
    const pad = (n) => String(n).padStart(2, "0");
    let time = `${twelve ? hh : pad(hh)}:${pad(now.getMinutes())}`;
    if (c.show_seconds) time += `<span class="sec">:${pad(now.getSeconds())}</span>`;
    if (suffix) time += `<span class="ampm">${suffix.trim()}</span>`;
    root.querySelector(".time").innerHTML = time;

    // Date
    let date;
    try {
      date = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    } catch (e) {
      date = now.toDateString();
    }
    root.querySelector(".d").textContent = date;

    // Weather
    const wEl = root.querySelector(".w");
    const st = c.weather && this._hass && this._hass.states[c.weather];
    if (st && st.state !== "unavailable" && st.state !== "unknown") {
      const t = st.attributes.temperature;
      const unit = st.attributes.temperature_unit || "°";
      const cond = this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
      const icon = WEATHER_ICONS[st.state] || "mdi:weather-partly-cloudy";
      const temp = t != null ? `${Math.round(Number(t))}${unit.startsWith("°") ? "°" : " " + unit}` : "";
      wEl.innerHTML = `<span class="dot">·</span><ha-icon icon="${icon}"></ha-icon>${esc(temp)}<span class="cond">${esc(cond)}</span>`;
      wEl.title = cond;
      wEl.hidden = false;
    } else {
      wEl.innerHTML = "";
      wEl.hidden = true;
    }

    root.querySelector(".bar").hidden = c.show_bar === false;
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, rows: 3, min_columns: 6, min_rows: 2 };
  }
}

OhMyHAClockCard.styles = `
  :host { display: block; }
  ha-card {
    --omh-fg: 255,255,255;
    position: relative;
    height: var(--omh-height, 165px);
    box-sizing: border-box;
    border-radius: 32px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 16px;
    text-align: center;
    color: rgb(var(--omh-fg));
    background:
      radial-gradient(ellipse at 50% -15%, rgba(var(--omh-accent),.30), transparent 65%),
      radial-gradient(circle at 90% 110%, rgba(var(--omh-second),.22), transparent 55%),
      linear-gradient(145deg, rgba(24,34,58,.80), rgba(10,15,30,.72));
    -webkit-backdrop-filter: blur(24px);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--omh-accent),.33);
    box-shadow:
      0 0 40px rgba(var(--omh-accent),.30),
      0 20px 40px rgba(0,0,0,.4),
      inset 0 1px 0 rgba(var(--omh-fg),.12);
    transition: border-color 1s, box-shadow 1s;
  }
  .greet {
    position: absolute;
    top: 18px; left: 12px; right: 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 7px;
    text-transform: uppercase;
    color: rgb(var(--omh-accent));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    font-size: 78px;
    font-weight: var(--omh-weight, 300);
    letter-spacing: 10px;
    padding-left: 10px;
    line-height: 1.05;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 38px rgba(var(--omh-accent),.55), 0 0 8px rgba(var(--omh-fg),.25);
  }
  .time .sec { font-size: .42em; letter-spacing: 2px; opacity: .7; }
  .time .ampm { font-size: .2em; letter-spacing: 3px; margin-left: 6px; font-weight: 600; opacity: .75; vertical-align: super; }
  .date {
    margin-top: 2px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(var(--omh-fg),.72);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .d::first-letter { text-transform: uppercase; }
  .w { display: inline-flex; align-items: center; gap: 4px; }
  .w[hidden] { display: none; }
  .w ha-icon { --mdc-icon-size: 16px; color: rgb(var(--omh-accent)); }
  .w .dot { margin-right: 2px; opacity: .6; }
  .w .cond { opacity: .8; font-weight: 500; margin-left: 2px; }
  .bar {
    position: absolute;
    bottom: 20px; left: 20%;
    width: 60%; height: 4px;
    border-radius: 4px;
    background: linear-gradient(90deg,
      rgb(var(--omh-accent)) 0%,
      rgb(var(--omh-second)) var(--omh-pct),
      rgba(var(--omh-fg),.12) var(--omh-pct));
    box-shadow: 0 0 12px rgba(var(--omh-accent),.30);
  }
  .bar[hidden] { display: none; }
  @media (max-width: 420px) {
    .time { font-size: 62px; letter-spacing: 6px; padding-left: 6px; }
    .greet { letter-spacing: 5px; }
  }
`;

if (!customElements.get("ohmyha-clock-card")) {
  customElements.define("ohmyha-clock-card", OhMyHAClockCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "ohmyha-clock-card")) {
  window.customCards.push({
    type: "ohmyha-clock-card",
    name: "OhMyHA Clock",
    description: "A glowing clock with a greeting, the date, the weather and a day progress bar.",
    preview: true,
    documentationURL: "https://github.com/OhMyHAdash/ohmyha-clock-card",
  });
}

console.info(
  `%c OHMYHA CLOCK %c v${VERSION} · ohmyha.com `,
  "color:#0a0f1e;background:#00f2fe;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#00f2fe;background:#0a0f1e;border-radius:0 3px 3px 0;padding:2px 4px"
);
