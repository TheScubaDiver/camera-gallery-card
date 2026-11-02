/* Garmin Sleep Card – zelfstandige Lovelace custom card (geen dependencies) */
const NS = "http://www.w3.org/2000/svg";

class GarminSleepCard extends HTMLElement {
  setConfig(config) {
    if (!config.sleep_score || !config.body_battery) {
      throw new Error("Vul minimaal 'sleep_score' en 'body_battery' in");
    }
    this._config = { history_hours: 12, title: "Slaap & energie", ...config };
    this._lastFetch = 0;
    this._series = [];
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    if (Date.now() - this._lastFetch > 5 * 60 * 1000) this._fetchHistory();
  }

  getCardSize() { return 5; }

  // "sensor.x" of "sensor.x::attribuut"
  _raw(key) {
    const ref = this._config[key];
    if (!ref || !this._hass) return undefined;
    const [id, attr] = ref.split("::");
    const st = this._hass.states[id];
    if (!st) return undefined;
    const v = attr ? st.attributes[attr] : st.state;
    return ["unknown", "unavailable", "", null].includes(v) ? undefined : v;
  }
  _num(key) { const v = parseFloat(this._raw(key)); return isNaN(v) ? undefined : v; }
  _minutes(key) {
    const v = this._num(key);
    if (v === undefined) return undefined;
    const unit = (this._hass.states[this._config[key].split("::")[0]].attributes.unit_of_measurement || "").toLowerCase();
    if (unit === "s") return v / 60;
    if (unit === "h") return v * 60;
    return v; // minuten
  }
  _date(key) {
    const v = this._raw(key);
    if (v === undefined) return undefined;
    if (!isNaN(Number(v)) && Number(v) > 1e9) return new Date(Number(v) > 1e12 ? Number(v) : Number(v) * 1000);
    const d = new Date(v);
    if (!isNaN(d)) return d;
    const m = String(v).match(/^(\d{1,2}):(\d{2})/); // alleen HH:MM
    if (m) { const t = new Date(); t.setHours(+m[1], +m[2], 0, 0); return t; }
    return undefined;
  }

  async _fetchHistory() {
    if (!this._hass || !this._config) return;
    this._lastFetch = Date.now();
    const id = this._config.body_battery.split("::")[0];
    const end = new Date();
    const start = new Date(end.getTime() - this._config.history_hours * 3600e3);
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(), end_time: end.toISOString(),
        entity_ids: [id], minimal_response: true, no_attributes: true,
        significant_changes_only: false,
      });
      this._series = (res[id] || [])
        .map((p) => ({ t: (p.lu ?? p.last_updated ?? p.lc) * 1000, v: parseFloat(p.s ?? p.state) }))
        .filter((p) => !isNaN(p.v) && !isNaN(p.t));
      this._render();
    } catch (e) { console.warn("garmin-sleep-card: historie ophalen mislukt", e); }
  }

  _fmtT(d) { return d ? d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "–"; }
  _fmtDur(min) { return min === undefined ? "–" : `${Math.floor(min / 60)}u ${String(Math.round(min % 60)).padStart(2, "0")}m`; }

  _ring(value, max, color, label, sub) {
    const r = 42, c = 2 * Math.PI * r, p = value === undefined ? 0 : Math.max(0, Math.min(1, value / max));
    return `<div class="ring"><svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="${r}" class="track"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${c * p} ${c}" transform="rotate(-90 50 50)"/>
      <text x="50" y="54" text-anchor="middle" class="rv">${value === undefined ? "–" : Math.round(value)}</text>
    </svg><div class="rl">${label}</div><div class="rs">${sub || ""}</div></div>`;
  }

  _scoreInfo(s) {
    if (s === undefined) return ["var(--secondary-text-color)", ""];
    if (s >= 90) return ["#2e9e6b", "Uitstekend"];
    if (s >= 80) return ["#5bb85b", "Goed"];
    if (s >= 60) return ["#e0a43a", "Redelijk"];
    return ["#d9534f", "Slecht"];
  }

  _stages() {
    const defs = [["deep", "Diep", "#3b4cc0"], ["rem", "REM", "#9b6bd1"], ["light", "Licht", "#6fa8dc"], ["awake", "Wakker", "#e8a35a"]];
    const parts = defs.map(([k, l, c]) => ({ k, l, c, m: this._config[k] ? this._minutes(k) : undefined })).filter((p) => p.m);
    const total = parts.reduce((a, p) => a + p.m, 0);
    if (!total) return "";
    return `<div class="stages">${parts.map((p) => `<div style="flex:${p.m};background:${p.c}" title="${p.l}"></div>`).join("")}</div>
      <div class="legend">${parts.map((p) => `<span><i style="background:${p.c}"></i>${p.l} ${this._fmtDur(p.m)}</span>`).join("")}</div>`;
  }

  _chart(sleepStart, sleepEnd) {
    const pts = this._series;
    if (pts.length < 2) return `<div class="empty">Nog geen body battery-geschiedenis…</div>`;
    const W = 320, H = 130, L = 26, R = 6, T = 8, B = 20;
    const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, Date.now());
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
    const y = (v) => T + (1 - v / 100) * (H - T - B);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(pts[pts.length - 1].t).toFixed(1)},${y(0)} L${x(pts[0].t).toFixed(1)},${y(0)} Z`;
    let band = "";
    if (sleepStart && sleepEnd) {
      const a = Math.max(x(sleepStart.getTime()), L), b = Math.min(x(sleepEnd.getTime()), W - R);
      if (b > a) band = `<rect x="${a}" y="${T}" width="${b - a}" height="${H - T - B}" class="sleepband"/>`;
    }
    const grid = [0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" class="ax">${v}</text>`).join("");
    const ticks = []; const step = 3 * 3600e3;
    for (let t = Math.ceil(t0 / step) * step; t < t1; t += step) {
      ticks.push(`<text x="${x(t)}" y="${H - 6}" text-anchor="middle" class="ax">${new Date(t).getHours()}u</text>`);
    }
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb27f" stop-opacity=".45"/><stop offset="1" stop-color="#3fb27f" stop-opacity="0"/></linearGradient></defs>
      ${band}${grid}${ticks.join("")}
      <path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="#3fb27f" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(last.t)}" cy="${y(last.v)}" r="3.5" fill="#3fb27f"/></svg>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const score = this._num("sleep_score"), bb = this._num("body_battery");
    const start = this._date("sleep_start"), end = this._date("sleep_end");
    const dur = this._config.sleep_duration ? this._minutes("sleep_duration") : (start && end ? (end - start) / 60000 : undefined);
    const [sc, sl] = this._scoreInfo(score);
    const bbColor = bb === undefined ? "var(--secondary-text-color)" : bb >= 75 ? "#2e9e6b" : bb >= 40 ? "#e0a43a" : "#d9534f";
    this.shadowRoot.innerHTML = `<style>
      ha-card{padding:16px}
      h2{margin:0 0 12px;font-size:1.1em;font-weight:500}
      .top{display:flex;justify-content:space-around;gap:8px}
      .ring{text-align:center;width:42%}
      .ring svg{width:100%;max-width:130px}
      .track{fill:none;stroke:var(--divider-color);stroke-width:9}
      .rv{font-size:28px;font-weight:600;fill:var(--primary-text-color)}
      .rl{font-weight:500;margin-top:2px}.rs{font-size:.85em;color:var(--secondary-text-color)}
      .times{display:flex;align-items:center;justify-content:center;gap:12px;margin:14px 0 10px;font-size:1.5em;font-weight:500}
      .times small{display:block;font-size:.5em;font-weight:400;color:var(--secondary-text-color)}
      .arrow{color:var(--secondary-text-color)}
      .dur{text-align:center;color:var(--secondary-text-color);margin-bottom:10px}
      .stages{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px;margin-top:6px}
      .legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.8em;margin:6px 0 4px;color:var(--secondary-text-color)}
      .legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
      .sub{margin:14px 0 2px;font-size:.9em;color:var(--secondary-text-color)}
      .chart{width:100%}.grid{stroke:var(--divider-color);stroke-width:.5}
      .ax{font-size:8px;fill:var(--secondary-text-color)}
      .sleepband{fill:#6fa8dc;opacity:.15}
      .empty{padding:20px;text-align:center;color:var(--secondary-text-color)}
    </style>
    <ha-card>
      ${this._config.title ? `<h2>${this._config.title}</h2>` : ""}
      <div class="top">
        ${this._ring(score, 100, sc, "Slaapscore", sl)}
        ${this._ring(bb, 100, bbColor, "Body Battery", bb === undefined ? "" : "nu")}
      </div>
      <div class="times">
        <div>${this._fmtT(start)}<small>in slaap</small></div><span class="arrow">→</span>
        <div>${this._fmtT(end)}<small>wakker</small></div>
      </div>
      <div class="dur">${this._fmtDur(dur)} geslapen</div>
      ${this._stages()}
      <div class="sub">Body Battery – laatste ${this._config.history_hours} uur (blauw = slaap)</div>
      ${this._chart(start, end)}
    </ha-card>`;
  }

  static getStubConfig() {
    return { sleep_score: "sensor.garmin_sleep_score", body_battery: "sensor.garmin_body_battery_most_recent" };
  }
}
customElements.define("garmin-sleep-card", GarminSleepCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "garmin-sleep-card", name: "Garmin Sleep Card", description: "Slaapscore, Body Battery en slaaptijden met grafiek" });
