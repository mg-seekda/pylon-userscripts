// ==UserScript==
// @name         Pylon: Hotel-Manager & ERP Button
// @namespace    https://seekda.com
// @version      1.1.2
// @description  Fügt in der Issue Sidebar unter der Hotel-ID eine Zeile mit zwei Buttons ein: links "🏨 Hotel-Manager", rechts "🧑‍🤝‍🧑 Verrechnungspartner …". ERP-Partner werden über Redash API gecached.
// @match        https://app.usepylon.com/issues/*
// @run-at       document-idle
// @author       you
// @updateURL    https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @downloadURL  https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @grant        GM_xmlhttpRequest
// @connect      analytics.seekda.com
// ==/UserScript==

(() => {
  "use strict";

  const HOTEL_ID_PLACEHOLDER = "Hotel-ID";
  const HOTEL_ID_LABEL_TEXTS = ["Hotel-ID", "Hotel ID"];
  const ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;
  const HM_BASE = "https://hotels.seekda.com/";
  const ANALYTICS_URL = "http://analytics.seekda.com/api/queries/2983/results.json?api_key=wsEZCx6Y4E2pnuuWBGeHDjxtnVOs1rtGve5Ge545";

  const buildHmUrl = id => `${HM_BASE}~/cm/${encodeURIComponent(id)}`;

  // ===== Helpers =====
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const textEq = (el, s) => ((el.textContent || "").trim().toLowerCase() === s.toLowerCase());
  const raf = fn => requestAnimationFrame(fn);

  function closestRow(el) {
    while (el && el !== document.documentElement) {
      if (el.tagName === "DIV" && el.classList.contains("flex") && el.className.includes("min-h-8")) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getHotelIdInputCandidates(root) {
    const fromPlaceholder = qsa(`input[placeholder="${HOTEL_ID_PLACEHOLDER}"]`, root);
    const spanLabels = qsa("span", root).filter(el =>
      HOTEL_ID_LABEL_TEXTS.some(t => textEq(el, t))
    );
    const fromSibling = [];
    for (const lab of spanLabels) {
      const sib = lab.nextElementSibling;
      if (sib && sib.tagName === "INPUT") fromSibling.push(sib);
    }
    return Array.from(new Set([...fromPlaceholder, ...fromSibling]));
  }

  // ===== UI: Neue Zeile -> HM & ERP Buttons =====
  function createCompanionRow() {
    const row = document.createElement("div");
    row.className = "relative flex min-h-8 items-center gap-x-3 px-1.5";
    row.dataset.hmErpRow = "1";

    const left = document.createElement("div");
    left.className = "relative flex shrink-0 items-center gap-2";
    left.style.minWidth = "150px";
    const hmBtn = document.createElement("a");
    hmBtn.dataset.hotelManagerLink = "1";
    hmBtn.className = "button button--primary button--md";
    hmBtn.textContent = "🏨 Hotel-Manager";
    hmBtn.target = "blank";
    hmBtn.rel = "noopener noreferrer";
    hmBtn.style.whiteSpace = "nowrap";
    left.appendChild(hmBtn);

    const right = document.createElement("div");
    right.className = "flex max-w-full min-w-0 flex-1";
    right.dataset.hmErpRight = "1";
    const erpBtn = document.createElement("a");
    erpBtn.dataset.erpLink = "1";
    erpBtn.className = "button button--primary button--md";
    erpBtn.textContent = "🧑‍🤝‍🧑 Partner …";
    erpBtn.target = "blank";
    erpBtn.rel = "noopener noreferrer";
    erpBtn.style.whiteSpace = "nowrap";
    erpBtn.setAttribute("aria-disabled", "true");
    erpBtn.style.opacity = "0.5";
    erpBtn.style.pointerEvents = "none";
    right.appendChild(erpBtn);

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function findOrCreateCompanionRow(afterRow) {
    const next = afterRow.nextElementSibling;
    if (next && next.dataset && next.dataset.hmErpRow === "1") return next;
    const row = createCompanionRow();
    afterRow.parentElement.insertBefore(row, afterRow.nextSibling);
    return row;
  }

  function setHmButton(row, hotelId) {
    const btn = row.querySelector('a[data-hotel-manager-link]');
    if (!btn) return;
    const clean = (hotelId || "").trim();
    if (ID_REGEX.test(clean)) {
      const url = buildHmUrl(clean);
      btn.href = url;
      btn.title = `Öffnen: ${url}`;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      btn.setAttribute("aria-disabled", "false");
    } else {
      btn.removeAttribute("href");
      btn.title = "Bitte gültige Hotel-ID eingeben";
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      btn.setAttribute("aria-disabled", "true");
    }
  }

  // ===== ERP-Button =====
  function setErpButtonLoading(row, label = "🧑‍🤝‍🧑 Partner …") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = label;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = "Lade ERP-Link …";
  }

  function setErpButtonReady(row, partnerId) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Partner ${partnerId}`;
    btn.href = `https://erp.seekda.com/web#id=${partnerId}&view_type=form&model=res.partner`;
    btn.setAttribute("aria-disabled", "false");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = `Öffnen: Partner ${partnerId}`;
  }

  function setErpButtonDisabled(row, reason = "nicht gefunden") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Partner (${reason})`;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = `ERP-Link ${reason}`;
  }

  // ===== Cache Logik =====
  const CACHE_KEY = "_pylon_erp_cache";

  function saveCache(map) {
    try {
      const obj = Object.fromEntries(map);
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch(e) { console.warn("Cache speichern fehlgeschlagen", e); }
  }

  function loadCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return new Map(Object.entries(obj));
    } catch(e) {
      console.warn("Cache laden fehlgeschlagen", e);
      return new Map();
    }
  }

  async function fetchErpData() {
    const cached = loadCache();
    if (cached.size > 0) return cached;

    try {
      const r = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: ANALYTICS_URL,
          headers: { "Accept": "application/json" },
          onload: res => resolve(JSON.parse(res.responseText)),
          onerror: reject,
          ontimeout: () => reject(new Error("timeout"))
        });
      });

      const rows = r?.query_result?.data?.rows || [];
      const map = new Map();
      rows.forEach(item => {
        const hid = (item.name || "").trim();
        const pid = (item.account_partner_id || "").toString().trim();
        if (hid && pid) map.set(hid, pid);
      });
      saveCache(map);
      return map;
    } catch(e) {
      console.error("Fehler beim Laden der ERP-Daten", e);
      return new Map();
    }
  }

  async function updateErpButton(row, hotelId) {
    const clean = (hotelId || "").trim();
    if (!ID_REGEX.test(clean)) {
      setErpButtonDisabled(row, "invalid Hotel-ID");
      return;
    }
    setErpButtonLoading(row);

    const map = await fetchErpData();
    const partnerId = map.get(clean);
    if (partnerId) setErpButtonReady(row, partnerId);
    else setErpButtonDisabled(row, "nicht gefunden");
  }

  // ===== Buttons setzen =====
  const debounceMap = new Map();
  function debounce(key, fn, delay = 400) {
    const prev = debounceMap.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(fn, delay);
    debounceMap.set(key, t);
  }

  function setBothButtons(row, hotelId) {
    setHmButton(row, hotelId);
    debounce(row, () => updateErpButton(row, hotelId), 450);
  }

  function bindToInput(input) {
    if (input.dataset._hmErpBound) return;
    input.dataset._hmErpBound = "1";

    const row = closestRow(input);
    if (!row) return;

    const companion = findOrCreateCompanionRow(row);
    setBothButtons(companion, input.value || "");

    const handler = () => setBothButtons(companion, input.value || "");
    input.addEventListener("input", handler, { passive: true });
    input.addEventListener("change", handler, { passive: true });
  }

  function processRoot(root = document) {
    const inputs = getHotelIdInputCandidates(root);
    inputs.forEach(bindToInput);

    if (inputs.length === 0) {
      const spanLabels = qsa("span", root).filter(el =>
        HOTEL_ID_LABEL_TEXTS.some(t => textEq(el, t))
      );
      for (const lab of spanLabels) {
        const valEl = lab.nextElementSibling;
        if (!valEl) continue;
        const parentRow = closestRow(lab);
        if (!parentRow) continue;

        const companion = findOrCreateCompanionRow(parentRow);
        if (!companion.dataset._hmErpBoundStatic) {
          companion.dataset._hmErpBoundStatic = "1";
          const readVal = () => (valEl.textContent || "").trim();
          setBothButtons(companion, readVal());

          const mo = new MutationObserver(() => setBothButtons(companion, readVal()));
          mo.observe(valEl, { childList: true, subtree: true, characterData: true });
        }
      }
    }
  }

  processRoot(document);

  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    raf(() => {
      scheduled = false;
      processRoot(document);
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
