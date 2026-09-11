/* ============================================================================
   CARMINELLO DASHBOARD — applicazione
   Pagine: cruscotto · da chiamare · clienti · scheda cliente · ordini · impostazioni
   ========================================================================== */
(function () {
  "use strict";
  // storageKey: sessione separata da quella del negozio (stesso dominio GitHub Pages)
  const dbReal = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { storageKey: "carminello-dashboard-auth" } });
  const db = /[?&]demo=1/.test(location.search) ? { auth: dbReal.auth, from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "base-33-cartone-20", nome_it: "Base Pizza Carminello 33 cm — cartone da 20" }] }) }) }) }), rpc: async () => ({ error: { message: "Modalità prova: le modifiche non vengono salvate" } }) } : dbReal;
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  const dateS = d => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const dateL = d => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const TIPO = { b2c: "Privato", b2b: "Esercente", rivenditore: "Rivenditore" };
  const TIPI_PL = { b2c: "Privati", b2b: "Esercenti", rivenditore: "Rivenditori" };
  const PM = { carta: "Carta", bonifico: "Bonifico", contrassegno: "Contrassegno" };
  const ST = { da_pagare: "Da pagare", da_spedire: "Da spedire", spedito: "Spedito", annullato: "Annullato" };
  const NOTA_TIPO = { chiamata: "Telefonata", whatsapp: "WhatsApp", email: "Email", nota: "Nota" };
  const ESITI = ["riordina", "in pausa", "nessuna risposta", "richiamare", "perso", "altro"];

  // ---------- stato ----------
  let user = null, profile = null;
  let D = { profili: [], ordini: [], note: [], imp: {}, stat: {}, byUser: {} };

  function toast(msg, type) {
    let box = el("toast-box"); if (!box) { box = document.createElement("div"); box.id = "toast-box"; document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast " + (type || ""); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10); setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 4000);
  }
  function modal(html) { el("modal-in").innerHTML = html; el("modal").hidden = false; }
  function closeModal() { el("modal").hidden = true; }
  el("modal").addEventListener("click", e => { if (e.target === el("modal")) closeModal(); });

  // ---------- accesso ----------
  function uscitaSicura(client, chiave) {
    // 1) cancella la sessione sul dispositivo (non può fallire) 2) avvisa il server 3) pulizia manuale per sicurezza
    return client.auth.signOut({ scope: "local" }).catch(() => {}).then(() => client.auth.signOut({ scope: "global" }).catch(() => {})).finally(() => {
      try { Object.keys(localStorage).forEach(k => { if (k === chiave || k.startsWith(chiave + "-") || (chiave === "" && /^sb-.*-auth-token/.test(k))) localStorage.removeItem(k); }); } catch (_) {}
    });
  }
  function renderLogin(msg) {
    el("top").hidden = true;
    el("view").innerHTML = `
      <div class="login card">
        <img class="logo" src="assets/icons/icon-192.png" alt="">
        <h1 style="text-align:center">Carminello Dashboard</h1>
        <p class="muted small" style="text-align:center">Riservato al titolare. Stesso account del negozio.</p>
        ${msg ? `<div class="notice warn">${esc(msg)}</div>` : ""}
        <form id="login">
          <div class="field"><label>Email</label><input id="l-email" type="email" autocomplete="email" required></div>
          <div class="field"><label>Password</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
          <div class="err" id="l-err" hidden></div>
          <button class="btn block" type="submit">Entra</button>
        </form>
      </div>`;
    el("login").addEventListener("submit", async e => {
      e.preventDefault(); el("l-err").hidden = true;
      const { error } = await db.auth.signInWithPassword({ email: el("l-email").value.trim(), password: el("l-pass").value });
      if (error) { el("l-err").textContent = "Email o password non corretti."; el("l-err").hidden = false; return; }
      boot();
    });
  }

  const DEMO = /[?&]demo=1/.test(location.search) && typeof Demo !== "undefined";
  async function boot() {
    if (DEMO) {
      user = { id: "demo", email: "demo@carminello.eu" }; profile = { nome: "Demo", ruolo: "admin" };
      el("top").hidden = false; el("user").innerHTML = `<span>Dati di prova</span><button id="logout">Esci</button>`; el("logout").onclick = () => location.search = "";
      await loadAll(); route(); return;
    }
    const { data } = await db.auth.getSession(); user = data.session ? data.session.user : null;
    if (!user) return renderLogin();
    const { data: p } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle(); profile = p;
    if (!p || p.ruolo !== "admin") { await uscitaSicura(db, "carminello-dashboard-auth"); return renderLogin("Questo account non è amministratore."); }
    el("top").hidden = false;
    el("user").innerHTML = `<span>${esc(p.nome || p.email)}</span><button id="logout">Esci</button>`;
    el("logout").onclick = async () => { await uscitaSicura(db, "carminello-dashboard-auth"); user = null; profile = null; location.hash = ""; renderLogin(); };
    await loadAll(); route(); avviaTempoReale(); swReg();
  }

  // ---------- dati ----------
  async function loadAll() {
    const [p, o, n, i] = DEMO ? (function () { const d = Demo.genera(); return [{ data: d.profili }, { data: d.ordini }, { data: d.note }, { data: Object.entries(d.imp).map(([chiave, valore]) => ({ chiave, valore })) }]; })() : await Promise.all([
      db.from("profiles").select("*, prezzi_cliente(product_id, prezzo)").order("created_at", { ascending: false }),
      db.from("orders").select("*").order("created_at", { ascending: false }).limit(5000),
      db.from("note_clienti").select("*").order("created_at", { ascending: false }),
      db.from("impostazioni").select("chiave,valore")
    ]);
    if (p.error || o.error) { toast("Errore nel caricamento: " + ((p.error || o.error).message), "err"); }
    // Solo i clienti veri: il titolare (admin) e gli agenti non compaiono mai tra i clienti, e i loro ordini di prova non entrano nelle statistiche
    const nonClienti = new Set((p.data || []).filter(x => x.ruolo !== "cliente").map(x => x.id));
    D.profili = (p.data || []).filter(x => x.ruolo === "cliente");
    D.tuttiProfili = D.profili;
    D.agenti = (p.data || []).filter(x => x.ruolo === "agente");
    D.agenteBy = {}; D.agenti.forEach(a => D.agenteBy[a.id] = a);
    D.clientiDiAgente = {}; D.tuttiProfili.forEach(c => { if (c.agente_id) (D.clientiDiAgente[c.agente_id] = D.clientiDiAgente[c.agente_id] || []).push(c); });
    if (DEMO) D.provv = []; else { const pv = await db.rpc("provvigioni_mensili"); D.provv = pv.data || []; }
    D.ordini = (o.data || []).filter(x => !nonClienti.has(x.user_id)); D.note = n.data || []; D.imp = {}; (i.data || []).forEach(r => D.imp[r.chiave] = r.valore);
    D.cfg = Object.assign({}, Stats.DEFAULT_CFG, D.imp.avvisi || {});
    D.byUser = {}; D.ordini.forEach(x => { (D.byUser[x.user_id] = D.byUser[x.user_id] || []).push(x); });
    D.noteBy = {}; D.note.forEach(x => { (D.noteBy[x.user_id] = D.noteBy[x.user_id] || []).push(x); });
    D.stat = {}; D.profili.forEach(c => { D.stat[c.id] = Stats.cliente(c, D.byUser[c.id] || [], D.cfg); });
    D.prodB2b = null;
  }
  const nome = c => c.ragione_sociale || ((c.nome || "") + " " + (c.cognome || "")).trim() || c.email || "—";
  const tel = c => (c.telefono || (c.indirizzo && c.indirizzo.telefono) || "").replace(/\s+/g, "");
  const waLink = c => { let t = tel(c).replace(/[^\d+]/g, ""); if (!t) return null; if (t.startsWith("+")) t = t.slice(1); else if (!t.startsWith(CONFIG.WHATSAPP_PREFISSO)) t = CONFIG.WHATSAPP_PREFISSO + t; return "https://wa.me/" + t; };
  const daChiamare = () => D.profili.filter(c => ["rischio", "ritardo", "flessione"].includes(D.stat[c.id].stato));
  const nuoviOrdini = () => D.ordini.filter(o => o.visto === false && o.stato !== "annullato");
  const nomeAg = a => a ? (((a.nome || "") + " " + (a.cognome || "")).trim() || a.email || "agente") : "—";
  const agentiDaApprovare = () => (D.agenti || []).filter(a => !a.approvato);
  const provvAgente = id => (D.provv || []).filter(r => r.agente_id === id);
  const daLiquidare = id => provvAgente(id).reduce((t, r) => t + Number(r.maturata) - Number(r.liquidata), 0);
  const meseLabel = d => { const x = new Date(d); return x.toLocaleDateString("it-IT", { month: "long", year: "numeric" }); };
  const meseCorrente = () => { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-01"; };
  function qrSvg(testo, px) { try { const q = window.qrcode(0, "M"); q.addData(testo); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace("<svg ", `<svg style="width:${px}px;height:${px}px;background:#fff;border-radius:8px" `); } catch (e) { return ""; } }
  const origineTxt = c => { const a = c.agente_id ? D.agenteBy[c.agente_id] : null; return c.origine === "invito" ? "Registrato sul posto dall'agente " + nomeAg(a) : c.origine === "link" ? "Registrato dal link dell'agente " + nomeAg(a) : c.origine === "manuale" && a ? "Collegato da te all'agente " + nomeAg(a) : a ? "Agente: " + nomeAg(a) : "Registrato dal sito, senza agente"; };

  // ---------- attenzione: titolo, numerino sull'icona, suono, notifica ----------
  function aggiornaAttenzione() {
    const n = nuoviOrdini().length;
    document.title = (n ? "(" + n + ") " : "") + "Carminello Dashboard";
    try { if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {}
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); const t0 = ctx.currentTime;
      [[880, 0], [1175, 0.18]].forEach(([f, dt]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.3, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.35); o.connect(g).connect(ctx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.4); });
    } catch (e) {}
  }
  function notifica(titolo, testo, url) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try { const n = new Notification(titolo, { body: testo, icon: "assets/icons/icon-192.png", badge: "assets/icons/icon-192.png", tag: "ordine" }); n.onclick = () => { window.focus(); if (url) location.hash = url; n.close(); }; } catch (e) {}
  }
  // ---------- notifiche push (funzionano anche ad app chiusa) ----------
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  async function swReg() { if (!("serviceWorker" in navigator)) return null; try { return await navigator.serviceWorker.register("sw.js"); } catch (e) { console.error("sw", e); return null; } }
  function b64ToU8(b) { const p = "=".repeat((4 - b.length % 4) % 4); const s = (b + p).replace(/-/g, "+").replace(/_/g, "/"); const r = atob(s); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
  async function pushAttiva() {
    const reg = await swReg(); if (!reg) return null;
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
    const disp = (isIOS() ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac" : "altro") + (standalone() ? " (app)" : " (browser)");
    const { error } = await db.rpc("admin_salva_push", { p_sub: sub.toJSON(), p_dispositivo: disp });
    if (error) throw new Error(error.message);
    return sub;
  }
  async function pushStato() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "non_supportato";
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return "spento";
    const sub = await reg.pushManager.getSubscription(); return sub ? "attivo" : "spento";
  }
  async function chiediPermessoNotifiche() {
    if (!("Notification" in window)) { toast("Questo browser non supporta le notifiche", "err"); return; }
    if (isIOS() && !standalone()) { toast("Su iPhone: prima aggiungi la dashboard alla schermata Home (Condividi → Aggiungi alla schermata Home), poi attiva da lì", "err"); return; }
    const r = await Notification.requestPermission();
    if (r !== "granted") { toast("Permesso negato: puoi cambiarlo dalle impostazioni del browser", "err"); route(); return; }
    try {
      if (DEMO) { toast("Modalità prova: le notifiche non vengono registrate", "err"); return; }
      const sub = await pushAttiva();
      if (sub) toast("Notifiche attivate: arriveranno anche ad app chiusa", "ok"); else toast("Notifiche attive solo con la dashboard aperta", "ok");
    } catch (e) { console.error(e); toast("Notifiche attive solo con la dashboard aperta (" + e.message + ")", "err"); }
    route();
  }
  async function provaPush() {
    if (DEMO) { toast("Modalità prova", "err"); return; }
    const { data, error } = await db.functions.invoke("notifica", { body: { type: "TEST" } });
    if (error || !data || data.error) toast("Prova fallita: " + ((data && data.error) || (error && error.message) || "?"), "err");
    else toast(data.inviate ? "Notifica di prova inviata a " + data.inviate + " dispositivo/i: dovrebbe comparire tra pochi secondi" : "Nessun dispositivo registrato: premi prima 'Attiva le notifiche'", data.inviate ? "ok" : "err");
  }
  function onNuovoOrdine(o) {
    const c = D.tuttiProfili.find(x => x.id === o.user_id); const a = o.indirizzo || {};
    const chi = c ? nome(c) : (a.ragione_sociale || ((a.nome || "") + " " + (a.cognome || "")).trim() || "cliente");
    const testo = "Ordine n. " + o.numero + " da " + chi + ": " + o.cartoni + " cartoni, " + money(o.totale) + " (" + PM[o.metodo_pagamento] + ")";
    toast("Nuovo ordine! " + testo, "ok"); beep(); notifica("Nuovo ordine Carminello", testo, "#/ordini");
  }

  // ---------- tempo reale + controllo periodico ----------
  let rtChannel = null, pollTimer = null;
  function avviaTempoReale() {
    if (DEMO || rtChannel) return;
    rtChannel = db.channel("dash-ordini")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, async payload => { await loadAll(); onNuovoOrdine(payload.new); aggiornaAttenzione(); route(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, async () => { await loadAll(); aggiornaAttenzione(); renderNav(currentPage); })
      .subscribe();
    // rete di sicurezza: ogni 60 secondi conta gli ordini non visti
    pollTimer = setInterval(async () => {
      const { count, error } = await db.from("orders").select("id", { count: "exact", head: true }).eq("visto", false);
      if (!error && count != null && count !== nuoviOrdini().length) { const prima = new Set(nuoviOrdini().map(o => o.id)); await loadAll(); nuoviOrdini().filter(o => !prima.has(o.id)).forEach(onNuovoOrdine); aggiornaAttenzione(); route(); }
    }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }
  const ultimaNota = c => (D.noteBy[c.id] || [])[0];

  // ---------- navigazione ----------
  const PAGES = [
    ["cruscotto", "Cruscotto", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/></svg>'],
    ["chiamare", "Da chiamare", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>'],
    ["clienti", "Clienti", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><circle cx="17" cy="9" r="3"/><path d="M17 14c3 0 5 2 5 5"/></svg>'],
    ["agenti", "Agenti", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M5 18c.5-2.2 2-3.5 4-3.5s3.5 1.3 4 3.5"/><path d="M15 10h4M15 14h4"/></svg>'],
    ["ordini", "Ordini", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16l-1.5 12h-13z"/><path d="M8 7a4 4 0 0 1 8 0"/></svg>'],
    ["impostazioni", "Impostazioni", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>']
  ];
  let currentPage = "cruscotto";
  function renderNav(cur) {
    currentPage = cur; const n = daChiamare().length, no = nuoviOrdini().length, na = agentiDaApprovare().length;
    el("nav").innerHTML = PAGES.map(([k, l, ic]) => `<a href="#/${k}" class="${cur === k ? "on" : ""}">${ic}${l}${k === "chiamare" && n ? `<span class="cnt">${n}</span>` : ""}${k === "ordini" && no ? `<span class="cnt blink">${no}</span>` : ""}${k === "agenti" && na ? `<span class="cnt">${na}</span>` : ""}</a>`).join("");
    aggiornaAttenzione();
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, "") || "cruscotto"; const [page, arg] = h.split("/");
    renderNav(page === "cliente" ? "clienti" : page === "agente" ? "agenti" : page); window.scrollTo(0, 0);
    ({ cruscotto: vCruscotto, chiamare: vChiamare, clienti: vClienti, cliente: () => vCliente(arg), agenti: vAgenti, agente: () => vAgente(arg), ordini: vOrdini, impostazioni: vImpostazioni }[page] || vCruscotto)();
  }
  window.addEventListener("hashchange", () => { if (user) route(); });
  async function refresh() { await loadAll(); route(); }

  // ---------- grafico a barre (SVG) ----------
  function barChart(serie, opts) {
    opts = opts || {}; const W = 720, H = 200, padL = 36, padB = 26, padT = 14; const n = serie.length; const bw = (W - padL - 10) / n;
    const max = Math.max(1, ...serie.map(s => opts.val(s))); const y = v => padT + (H - padT - padB) * (1 - v / max);
    let g = ""; serie.forEach((s, i) => {
      const x = padL + i * bw + bw * 0.15; const w = bw * 0.7;
      if (opts.stack) { let acc = 0; ["b2c", "b2b", "rivenditore"].forEach(t => { const v = s.perTipo[t] || 0; if (!v) return; const y1 = y(acc + v), y0 = y(acc); g += `<rect class="bar ${t}" x="${x}" y="${y1}" width="${w}" height="${y0 - y1}" rx="2"><title>${TIPI_PL[t]}: ${v}</title></rect>`; acc += v; }); }
      else { const v = opts.val(s); g += `<rect class="bar" x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="3"><title>${v}</title></rect>`; }
      if (opts.val(s)) g += `<text x="${x + w / 2}" y="${y(opts.val(s)) - 4}" text-anchor="middle">${opts.fmt ? opts.fmt(opts.val(s)) : opts.val(s)}</text>`;
      g += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(s.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="max-height:220px">${g}</svg>`;
  }

  // ---------- CRUSCOTTO ----------
  function vCruscotto() {
    const now = new Date(); const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sett = new Date(d0 - 6 * 86400000); const m0 = new Date(now.getFullYear(), now.getMonth(), 1); const mPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const oggi = Stats.periodo(D.ordini, d0, new Date(d0.getTime() + 86400000)), settimana = Stats.periodo(D.ordini, sett, new Date(d0.getTime() + 86400000));
    const mese = Stats.periodo(D.ordini, m0, new Date(now.getFullYear(), now.getMonth() + 1, 1)), prev = Stats.periodo(D.ordini, mPrev, m0);
    const delta = prev.totale ? Math.round((mese.totale - prev.totale) / prev.totale * 100) : null;
    const daPagare = D.ordini.filter(o => o.stato === "da_pagare").length, daSpedire = D.ordini.filter(o => o.stato === "da_spedire").length;
    const daAttivare = D.tuttiProfili.filter(c => c.tipo !== "b2c" && !c.approvato).length;
    const chiamare = daChiamare(); const rischio = chiamare.filter(c => D.stat[c.id].stato === "rischio").length;
    const t90 = new Date(now - 90 * 86400000);
    const perTipo = ["b2b", "rivenditore", "b2c"].map(t => {
      const cl = D.profili.filter(c => c.tipo === t); const ord = D.ordini.filter(o => o.tipo === t);
      const attivi = cl.filter(c => D.stat[c.id].ultimo && D.stat[c.id].ultimo >= t90).length;
      const m = Stats.periodo(ord, m0, new Date(now.getFullYear(), now.getMonth() + 1, 1));
      const all = cl.filter(c => ["rischio", "ritardo", "flessione"].includes(D.stat[c.id].stato)).length;
      return { t, n: cl.length, attivi, m, all };
    });
    const serie = Stats.mensile(D.ordini, 12);
    const top = D.profili.map(c => ({ c, m: Stats.periodo(D.byUser[c.id] || [], m0, new Date(now.getFullYear(), now.getMonth() + 1, 1)) })).filter(x => x.m.n).sort((a, b) => b.m.totale - a.m.totale).slice(0, 5);
    el("view").innerHTML = `
      <div class="page-title"><h1>Cruscotto</h1><span class="sub">${now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span></div>
      ${("Notification" in window) && Notification.permission === "default" && !DEMO ? '<div class="notice info" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap"><span>Vuoi un avviso su questo dispositivo ad ogni nuovo ordine?</span><button class="btn sm" id="k-notif">Attiva le notifiche</button></div>' : ""}
      <div class="kpis">
        ${nuoviOrdini().length ? `<div class="kpi alert"><div class="l">Nuovi ordini</div><div class="v warn">${nuoviOrdini().length}</div><div class="d"><a href="#/ordini">apri gli ordini</a></div></div>` : ""}
        <div class="kpi"><div class="l">Oggi</div><div class="v">${money(oggi.totale)}</div><div class="d">${oggi.n} ordini · ${oggi.cartoni} cartoni</div></div>
        <div class="kpi"><div class="l">Ultimi 7 giorni</div><div class="v">${money(settimana.totale)}</div><div class="d">${settimana.n} ordini · ${settimana.cartoni} cartoni</div></div>
        <div class="kpi"><div class="l">Questo mese</div><div class="v">${money(mese.totale)}</div><div class="d ${delta == null ? "" : delta >= 0 ? "up" : "down"}">${mese.n} ordini · ${mese.cartoni} cartoni${delta == null ? "" : " · " + (delta >= 0 ? "+" : "") + delta + "% sul mese scorso"}</div></div>
        <div class="kpi ${chiamare.length ? "alert" : ""}"><div class="l">Da chiamare</div><div class="v ${chiamare.length ? "warn" : ""}">${chiamare.length}</div><div class="d">${rischio ? rischio + " a rischio · " : ""}<a href="#/chiamare">apri la lista</a></div></div>
        <div class="kpi"><div class="l">Ordini da gestire</div><div class="v">${daPagare + daSpedire}</div><div class="d">${daPagare} da pagare · ${daSpedire} da spedire</div></div>
        <div class="kpi ${daAttivare ? "alert" : ""}"><div class="l">Clienti da attivare</div><div class="v ${daAttivare ? "warn" : ""}">${daAttivare}</div><div class="d"><a href="#/clienti/attivare">vedi</a></div></div>
        ${agentiDaApprovare().length ? `<div class="kpi alert"><div class="l">Agenti da approvare</div><div class="v warn">${agentiDaApprovare().length}</div><div class="d"><a href="#/agenti">apri gli agenti</a></div></div>` : ""}
        ${(D.agenti || []).length ? `<div class="kpi"><div class="l">Provvigioni da liquidare</div><div class="v">${money(D.agenti.reduce((t, a) => t + daLiquidare(a.id), 0))}</div><div class="d"><a href="#/agenti">tabellone</a></div></div>` : ""}
      </div>
      <div class="card">
        <h2>Cartoni per mese, ultimi 12 mesi</h2>
        ${barChart(serie, { val: s => s.cartoni, stack: true })}
        <div class="legend"><span><i style="background:var(--green)"></i>Esercenti</span><span><i style="background:var(--blue)"></i>Rivenditori</span><span><i style="background:#9aa891"></i>Privati</span></div>
      </div>
      <div class="grid three">
        ${perTipo.map(x => `<div class="card"><h3><span class="pill ${x.t}">${TIPI_PL[x.t]}</span></h3>
          <dl class="kv"><dt>Clienti</dt><dd><b>${x.n}</b> <span class="muted small">(${x.attivi} attivi negli ultimi 90 gg)</span></dd>
          <dt>Questo mese</dt><dd><b>${money(x.m.totale)}</b> · ${x.m.n} ordini · ${x.m.cartoni} cartoni</dd>
          <dt>Da chiamare</dt><dd>${x.all ? `<b style="color:var(--red)">${x.all}</b>` : "0"}</dd></dl>
          <p style="margin:.6rem 0 0"><a class="btn sm ghost" href="#/clienti/${x.t}">Vedi ${TIPI_PL[x.t].toLowerCase()}</a></p></div>`).join("")}
      </div>
      <div class="card"><h2>Migliori clienti del mese</h2>
        ${top.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Cliente</th><th>Tipo</th><th class="num">Ordini</th><th class="num">Cartoni</th><th class="num">Speso</th></tr></thead><tbody>
        ${top.map(x => `<tr class="click" data-go="#/cliente/${x.c.id}"><td><b>${esc(nome(x.c))}</b></td><td><span class="pill ${x.c.tipo}">${TIPO[x.c.tipo]}</span></td><td class="num">${x.m.n}</td><td class="num">${x.m.cartoni}</td><td class="num"><b>${money(x.m.totale)}</b></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nessun ordine questo mese.</p>'}
      </div>`;
    bindRows(); const kn = el("k-notif"); if (kn) kn.onclick = chiediPermessoNotifiche;
  }
  function bindRows() { el("view").querySelectorAll("[data-go]").forEach(r => r.addEventListener("click", () => location.hash = r.getAttribute("data-go"))); }

  // ---------- DA CHIAMARE ----------
  let chiamFiltro = "tutti", nascondiContattati = true;
  function vChiamare() {
    const now = new Date();
    let list = daChiamare().map(c => ({ c, s: D.stat[c.id], n: ultimaNota(c) }));
    const contattatiRecenti = list.filter(x => x.n && Stats.giorni(new Date(x.n.created_at), now) <= 7).length;
    if (nascondiContattati) list = list.filter(x => !(x.n && Stats.giorni(new Date(x.n.created_at), now) <= 7));
    if (chiamFiltro !== "tutti") list = list.filter(x => x.c.tipo === chiamFiltro);
    list.sort((a, b) => Stats.STATI[a.s.stato].prio - Stats.STATI[b.s.stato].prio || b.s.speso - a.s.speso);
    const persi = D.profili.filter(c => D.stat[c.id].stato === "perso" && (chiamFiltro === "tutti" || c.tipo === chiamFiltro));
    el("view").innerHTML = `
      <div class="page-title"><h1>Da chiamare</h1><span class="sub">${list.length} clienti · ordinati per urgenza</span></div>
      <div class="seg">
        ${["tutti", "b2b", "rivenditore", "b2c"].map(t => `<button class="${chiamFiltro === t ? "on" : ""}" data-cf="${t}">${t === "tutti" ? "Tutti" : TIPI_PL[t]}</button>`).join("")}
        <button class="${nascondiContattati ? "on" : ""}" id="cf-hide" style="margin-left:auto">Nascondi contattati negli ultimi 7 gg${contattatiRecenti ? " (" + contattatiRecenti + ")" : ""}</button>
      </div>
      ${list.length ? list.map(x => callCard(x)).join("") : '<div class="card"><p class="muted" style="margin:0">Nessuno da chiamare. Ottimo.</p></div>'}
      ${persi.length ? `<h2 style="margin-top:1.6rem">Clienti persi <span class="muted small">(${persi.length})</span></h2><p class="muted small">Non ordinano da molto. Vale una chiamata quando hai tempo.</p>${persi.map(c => callCard({ c, s: D.stat[c.id], n: ultimaNota(c) })).join("")}` : ""}`;
    el("view").querySelectorAll("[data-cf]").forEach(b => b.onclick = () => { chiamFiltro = b.getAttribute("data-cf"); vChiamare(); });
    el("cf-hide").onclick = () => { nascondiContattati = !nascondiContattati; vChiamare(); };
    bindCallButtons();
  }
  function callCard(x) {
    const { c, s, n } = x; const wa = waLink(c), t = tel(c);
    return `<div class="call ${s.stato}">
      <div>
        <div class="name"><a href="#/cliente/${c.id}">${esc(nome(c))}</a> <span class="pill ${c.tipo}">${TIPO[c.tipo]}</span> <span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></div>
        <div class="why">${esc(Stats.spiega(s))}</div>
        <div class="last">${s.n} ordini · ${s.cartoni} cartoni · ${money(s.speso)} in totale${n ? ` · ultimo contatto ${dateS(n.created_at)}: ${esc(NOTA_TIPO[n.tipo])}${n.esito ? ", " + esc(n.esito) : ""}` : " · mai contattato"}</div>
      </div>
      <div class="side">
        <div class="actions">${t ? `<a class="btn sm tel" href="tel:${esc(t)}">Chiama</a>` : ""}${wa ? `<a class="btn sm wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div>
        <button class="btn sm ghost" data-nota="${c.id}">Segna contatto</button>
      </div></div>`;
  }
  function bindCallButtons() { el("view").querySelectorAll("[data-nota]").forEach(b => b.onclick = () => notaModal(b.getAttribute("data-nota"))); }
  function notaModal(uid) {
    const c = D.tuttiProfili.find(x => x.id === uid);
    modal(`<h2>Contatto con ${esc(nome(c))}</h2>
      <div class="row"><div class="field"><label>Tipo</label><select id="n-tipo">${Object.entries(NOTA_TIPO).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label>Esito</label><select id="n-esito"><option value="">—</option>${ESITI.map(e => `<option>${e}</option>`).join("")}</select></div></div>
      <div class="field"><label>Cosa ha detto / cosa fare</label><textarea id="n-testo" placeholder="Es. richiamare lunedì, ha finito le scorte, ordina la settimana prossima…"></textarea></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn ghost" id="n-cancel">Annulla</button><button class="btn" id="n-save">Salva</button></div>`);
    el("n-cancel").onclick = closeModal;
    el("n-save").onclick = async () => {
      const testo = el("n-testo").value.trim() || (NOTA_TIPO[el("n-tipo").value] + (el("n-esito").value ? ": " + el("n-esito").value : ""));
      const { error } = await db.rpc("admin_aggiungi_nota", { p_user_id: uid, p_tipo: el("n-tipo").value, p_testo: testo, p_esito: el("n-esito").value || null });
      if (error) { toast(error.message, "err"); return; }
      closeModal(); toast("Contatto salvato", "ok"); await refresh();
    };
  }

  // ---------- CLIENTI ----------
  let cliSeg = "b2b", cliSort = "ultimo", cliDir = 1, cliQ = "";
  function vClienti(seg) {
    if (seg && seg !== cliSeg) { cliSeg = seg; }
    const counts = { b2b: 0, rivenditore: 0, b2c: 0, attivare: 0 };
    D.profili.forEach(c => counts[c.tipo] = (counts[c.tipo] || 0) + 1);
    counts.attivare = D.tuttiProfili.filter(c => c.tipo !== "b2c" && !c.approvato).length;
    let list = (cliSeg === "attivare" ? D.tuttiProfili.filter(c => c.tipo !== "b2c" && !c.approvato) : cliSeg === "tutti" ? D.profili : D.profili.filter(c => c.tipo === cliSeg)).map(c => ({ c, s: D.stat[c.id] || Stats.cliente(c, D.byUser[c.id] || [], D.cfg) }));
    if (cliQ) { const q = cliQ.toLowerCase(); list = list.filter(x => (nome(x.c) + " " + (x.c.email || "") + " " + ((x.c.indirizzo || {}).citta || "") + " " + (x.c.piva || "")).toLowerCase().includes(q)); }
    const key = { nome: x => nome(x.c).toLowerCase(), stato: x => Stats.STATI[x.s.stato].prio, n: x => x.s.n, cartoni: x => x.s.cartoni, speso: x => x.s.speso, ultimo: x => x.s.ultimo ? x.s.ultimo.getTime() : 0, intervallo: x => x.s.intervallo || 9999, atteso: x => x.s.atteso ? x.s.atteso.getTime() : 9e15, trend: x => x.s.trend == null ? -9999 : x.s.trend }[cliSort];
    list.sort((a, b) => { const A = key(a), B = key(b); return (A > B ? 1 : A < B ? -1 : 0) * cliDir; });
    const th = (k, l, num) => `<th class="${num ? "num " : ""}${cliSort === k ? "on" : ""}" data-sort="${k}">${l}${cliSort === k ? (cliDir > 0 ? " ▲" : " ▼") : ""}</th>`;
    el("view").innerHTML = `
      <div class="page-title"><h1>Clienti</h1><span class="sub">${list.length} in elenco</span></div>
      <div class="seg">
        ${[["b2b", "Esercenti"], ["rivenditore", "Rivenditori"], ["b2c", "Privati"], ["tutti", "Tutti"], ["attivare", "Da attivare"]].map(([k, l]) => `<button class="${cliSeg === k ? "on" : ""}" data-seg="${k}">${l}${counts[k] != null ? `<span class="cnt">${counts[k]}</span>` : ""}</button>`).join("")}
        <input class="search" id="cli-q" placeholder="Cerca nome, città, email, P.IVA…" value="${esc(cliQ)}" style="margin-left:auto">
      </div>
      ${cliSeg === "attivare" ? '<div class="notice info">Questi clienti si sono registrati come esercente o rivenditore ma non hanno ancora un prezzo. Apri la scheda, scrivi il prezzo concordato e attivali.</div>' : ""}
      <div class="card"><div class="table-wrap"><table class="data"><thead><tr>
        ${th("nome", "Cliente")}${th("stato", "Stato")}${th("n", "Ordini", 1)}${th("cartoni", "Cartoni", 1)}${th("speso", "Speso", 1)}${th("ultimo", "Ultimo ordine")}${th("intervallo", "Ogni", 1)}${th("atteso", "Prossimo atteso")}${th("trend", "Trend 3 mesi", 1)}
      </tr></thead><tbody>
        ${list.map(({ c, s }) => `<tr class="click" data-go="#/cliente/${c.id}">
          <td><b>${esc(nome(c))}</b><br><span class="small muted">${esc((c.indirizzo || {}).citta || "")}${cliSeg === "tutti" || cliSeg === "attivare" ? " · " + TIPO[c.tipo] : ""}${c.tipo !== "b2c" && !c.approvato ? ' · <span class="pill unpaid">da attivare</span>' : ""}${c.agente_id ? ' · <span class="pill agente">agente: ' + esc(nomeAg(D.agenteBy[c.agente_id])) + "</span>" : ""}</span></td>
          <td><span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></td>
          <td class="num">${s.n}</td><td class="num">${s.cartoni}</td><td class="num">${money(s.speso)}</td>
          <td class="nowrap">${s.ultimo ? dateS(s.ultimo) + ` <span class="muted small">(${s.giorniDaUltimo} gg)</span>` : "—"}</td>
          <td class="num">${s.intervallo ? s.intervallo + " gg" : "—"}</td>
          <td class="nowrap">${s.atteso ? dateS(s.atteso) : "—"}</td>
          <td class="num">${s.trend == null ? "—" : `<span class="trend ${s.trend >= 0 ? "up" : "down"}">${s.trend > 0 ? "+" : ""}${s.trend}%</span>`}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">Nessun cliente.</td></tr>'}
      </tbody></table></div></div>`;
    el("view").querySelectorAll("[data-seg]").forEach(b => b.onclick = () => { cliSeg = b.getAttribute("data-seg"); location.hash = "#/clienti/" + cliSeg; });
    el("view").querySelectorAll("[data-sort]").forEach(h => h.onclick = () => { const k = h.getAttribute("data-sort"); if (cliSort === k) cliDir = -cliDir; else { cliSort = k; cliDir = k === "nome" ? 1 : (k === "stato" ? 1 : -1); } vClienti(); });
    el("cli-q").addEventListener("input", e => { cliQ = e.target.value; vClienti(); const i = el("cli-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    bindRows();
  }

  // ---------- SCHEDA CLIENTE ----------
  async function vCliente(uid) {
    const c = D.tuttiProfili.find(x => x.id === uid); if (!c) { el("view").innerHTML = '<div class="notice err">Cliente non trovato.</div>'; return; }
    const s = D.stat[c.id] || Stats.cliente(c, D.byUser[c.id] || [], D.cfg); const note = D.noteBy[c.id] || []; const a = c.indirizzo || {};
    if (!D.prodB2b) { const { data } = await db.from("products").select("*").eq("canale", "b2b").order("ordine"); D.prodB2b = data || []; }
    const prezzi = {}; (c.prezzi_cliente || []).forEach(p => prezzi[p.product_id] = p.prezzo);
    const serie = Stats.mensile(s.ordini, 12); const wa = waLink(c), t = tel(c);
    const ordiniDesc = [...s.ordini].reverse(); const tutti = (D.byUser[c.id] || []);
    el("view").innerHTML = `
      <p><a href="#/clienti/${c.tipo}">← ${TIPI_PL[c.tipo]}</a></p>
      <div class="card head-cli">
        <div class="info">
          <h1 style="margin-bottom:.3rem">${esc(nome(c))} <span class="pill ${c.tipo}">${TIPO[c.tipo]}</span> <span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></h1>
          <p style="margin:0 0 .6rem;color:var(--ink-2)">${esc(Stats.spiega(s))}</p>
          <dl class="kv">
            <dt>Contatti</dt><dd>${esc(c.email || "")}${t ? " · " + esc(t) : ""}</dd>
            ${c.tipo !== "b2c" ? `<dt>Fiscale</dt><dd>P.IVA ${esc(c.piva || "—")}${c.sdi ? " · SDI " + esc(c.sdi) : ""}${c.pec ? " · PEC " + esc(c.pec) : ""}</dd>` : ""}
            <dt>Indirizzo</dt><dd>${esc([a.via, (a.cap || "") + " " + (a.citta || ""), a.prov].filter(x => x && x.trim()).join(", ") || "—")}</dd>
            <dt>Cliente dal</dt><dd>${dateS(c.created_at)}</dd>
          </dl>
        </div>
        <div class="actions" style="flex-direction:column;align-items:stretch">
          ${t ? `<a class="btn tel" href="tel:${esc(t)}">Chiama</a>` : ""}${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          <button class="btn ghost" data-nota="${c.id}">Segna contatto</button>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Ordini</div><div class="v">${s.n}</div><div class="d">${s.primo ? "dal " + dateS(s.primo) : ""}</div></div>
        <div class="kpi"><div class="l">Cartoni</div><div class="v">${s.cartoni}</div><div class="d">${s.n ? (s.cartoni / s.n).toFixed(1) + " a ordine" : ""}</div></div>
        <div class="kpi"><div class="l">Speso</div><div class="v">${money(s.speso)}</div><div class="d">${s.n ? money(s.speso / s.n) + " a ordine" : ""}</div></div>
        <div class="kpi"><div class="l">Ritmo</div><div class="v">${s.intervallo ? "ogni " + s.intervallo + " gg" : "—"}</div><div class="d">${s.atteso ? "prossimo atteso " + dateS(s.atteso) : ""}</div></div>
        <div class="kpi"><div class="l">Trend 3 mesi</div><div class="v ${s.trend != null && s.trend < 0 ? "warn" : ""}">${s.trend == null ? "—" : (s.trend > 0 ? "+" : "") + s.trend + "%"}</div><div class="d">${s.cartoni90} vs ${s.cartoniPrec} cartoni</div></div>
      </div>
      <div class="grid two">
        <div>
          <div class="card"><h2>Cartoni per mese</h2>${barChart(serie, { val: x => x.cartoni })}</div>
          <div class="card"><h2>Storico ordini</h2>
            ${tutti.length ? `<ul class="timeline">${tutti.map((o, i) => { const next = tutti[i + 1]; const gap = next ? Stats.giorni(new Date(next.created_at), new Date(o.created_at)) : null; return `<li><span class="nowrap">${dateS(o.created_at)}</span><span>n. ${o.numero} · ${o.cartoni} cartoni · ${PM[o.metodo_pagamento]} <span class="pill ${o.stato}">${ST[o.stato]}</span>${gap != null ? `<br><span class="gap">${gap} giorni dopo il precedente</span>` : ""}</span><b class="num">${money(o.totale)}</b></li>`; }).join("")}</ul>` : '<p class="muted">Nessun ordine.</p>'}
          </div>
        </div>
        <div>
          ${c.tipo !== "b2c" ? `<div class="card"><h2>Prezzo riservato e attivazione</h2>
            <p class="small muted">Stato: ${c.approvato ? '<span class="pill paid">attivo, può ordinare</span>' : '<span class="pill unpaid">da attivare, non può ordinare</span>'}</p>
            ${D.prodB2b.map(p => `<div class="field"><label>${esc(p.nome_it)} — € a cartone</label><input type="number" step="0.01" min="0" data-price="${p.id}" value="${prezzi[p.id] != null ? prezzi[p.id] : ""}" placeholder="es. 32.00"></div>`).join("")}
            <div class="actions"><button class="btn" id="c-attiva">Salva prezzo e attiva</button>${c.approvato ? '<button class="btn ghost" id="c-sospendi">Sospendi</button>' : ""}</div>
          </div>` : ""}
          ${c.ruolo === "admin" ? `<div class="card"><h2>Agente</h2><p class="small muted" style="margin:0">Questo è il tuo account: un agente si collega solo ai clienti veri. Per provare, apri la scheda di un cliente registrato dal sito.</p></div>` : `<div class="card"><h2>Agente</h2>
            <p class="small muted">${esc(origineTxt(c))}</p>
            <div class="row"><div class="field"><select id="c-agente"><option value="">Nessun agente</option>${(D.agenti || []).map(a => `<option value="${a.id}" ${c.agente_id === a.id ? "selected" : ""}>${esc(nomeAg(a))}${a.codice_agente ? " (" + esc(a.codice_agente) + ")" : ""}${a.approvato ? "" : " · non attivo"}</option>`).join("")}</select></div><div class="field"><button class="btn ghost block" id="c-agente-save">Salva agente</button></div></div>
            <p class="small muted" style="margin:0">Gli ordini futuri di questo cliente daranno la provvigione all'agente scelto. Quelli già fatti non cambiano.</p>
          </div>`}
          <div class="card"><h2>Tipo di cliente</h2>
            <div class="row"><div class="field"><select id="c-tipo">${Object.entries(TIPO).map(([k, v]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></div><div class="field"><button class="btn ghost block" id="c-tipo-save">Cambia tipo</button></div></div>
            <p class="small muted" style="margin:0">Serve se un cliente si è registrato con il tipo sbagliato, o se un esercente diventa rivenditore.</p>
            ${c.ruolo !== "admin" ? `<p style="margin:.8rem 0 0"><button class="btn sm ghost" id="c-rendi-agente">Trasforma in agente</button> <span class="small muted">se questa persona deve portare clienti e prendere una provvigione</span></p>` : ""}
          </div>
          <div class="card"><h2>Elimina cliente</h2>
            <p class="small muted">Cancella l'account con tutti i suoi ordini, note e prezzi. Serve solo per account di prova o creati per errore: per un cliente vero è meglio non farlo, si perde lo storico.</p>
            <button class="btn red" id="c-elimina">Elimina definitivamente</button>
          </div>
          <div class="card"><h2>Note e contatti <span class="muted small">(${note.length})</span></h2>
            ${note.length ? note.map(n => `<div class="note"><div class="m">${dateL(n.created_at)} · ${NOTA_TIPO[n.tipo] || n.tipo}${n.esito ? ' · <span class="esito">' + esc(n.esito) + "</span>" : ""} <a href="#" data-delnota="${n.id}" class="muted" title="Elimina">✕</a></div>${esc(n.testo)}</div>`).join("") : '<p class="muted small">Nessuna nota. Usa "Segna contatto" dopo una chiamata.</p>'}
          </div>
        </div>
      </div>`;
    bindCallButtons();
    el("view").querySelectorAll("[data-delnota]").forEach(x => x.onclick = async e => { e.preventDefault(); if (!confirm("Eliminare questa nota?")) return; const { error } = await db.rpc("admin_elimina_nota", { p_id: x.getAttribute("data-delnota") }); if (error) toast(error.message, "err"); else refresh(); });
    const attiva = el("c-attiva"); if (attiva) attiva.onclick = async () => {
      const p = {}; let missing = false; el("view").querySelectorAll("[data-price]").forEach(i => { if (i.value === "") missing = true; else p[i.getAttribute("data-price")] = Number(i.value); });
      if (missing) { toast("Scrivi il prezzo prima di attivare", "err"); return; }
      const { error } = await db.rpc("admin_imposta_cliente", { p_user_id: c.id, p_approvato: true, p_prezzi: p }); if (error) toast(error.message, "err"); else { toast("Cliente attivato", "ok"); refresh(); }
    };
    const sosp = el("c-sospendi"); if (sosp) sosp.onclick = async () => { const { error } = await db.rpc("admin_imposta_cliente", { p_user_id: c.id, p_approvato: false, p_prezzi: {} }); if (error) toast(error.message, "err"); else { toast("Cliente sospeso", "ok"); refresh(); } };
    el("c-elimina").onclick = async () => {
      if (!confirm("Eliminare definitivamente " + nome(c) + " con tutti i suoi ordini? Non si può annullare.")) return;
      if (prompt('Per confermare scrivi ELIMINA') !== "ELIMINA") return;
      const { error } = await db.rpc("admin_elimina_cliente", { p_user_id: c.id });
      if (error) toast(error.message, "err"); else { toast("Cliente eliminato", "ok"); location.hash = "#/clienti/tutti"; refresh(); }
    };
    el("c-tipo-save").onclick = async () => { const { error } = await db.rpc("admin_cambia_tipo", { p_user_id: c.id, p_tipo: el("c-tipo").value }); if (error) toast(error.message, "err"); else { toast("Tipo aggiornato", "ok"); refresh(); } };
    const cas = el("c-agente-save"); if (cas) cas.onclick = async () => { const v = el("c-agente").value || null; const { error } = await db.rpc("admin_assegna_agente", { p_cliente_id: c.id, p_agente_id: v }); if (error) toast(error.message, "err"); else { toast(v ? "Agente collegato" : "Agente scollegato", "ok"); refresh(); } };
    const ra = el("c-rendi-agente"); if (ra) ra.onclick = async () => {
      if (!confirm("Trasformare " + nome(c) + " in agente? Non potrà più ordinare come cliente; lo approverai e gli darai la percentuale dalla pagina Agenti.")) return;
      const { error } = await db.rpc("admin_cambia_ruolo", { p_user_id: c.id, p_ruolo: "agente" }); if (error) toast(error.message, "err"); else { toast("Ora è un agente: approvalo dalla pagina Agenti", "ok"); location.hash = "#/agente/" + c.id; refresh(); }
    };
  }

  // ---------- AGENTI ----------
  function provvTable(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<p class="muted small" style="margin:0">Nessuna provvigione ancora: arriveranno con i primi ordini pagati dei clienti degli agenti.</p>';
    return `<div class="table-wrap"><table class="data"><thead><tr><th>Mese</th>${opts.conAgente ? "<th>Agente</th>" : ""}<th class="num">Ordini</th><th class="num">Cartoni</th><th class="num">Merce pagata</th><th class="num">Maturata</th><th class="num">In attesa di pagamento</th><th>Liquidazione</th></tr></thead><tbody>
      ${rows.map(r => { const resto = Number(r.maturata) - Number(r.liquidata); const a = D.agenteBy[r.agente_id]; return `<tr>
        <td class="nowrap"><b>${esc(meseLabel(r.mese))}</b></td>${opts.conAgente ? `<td><a href="#/agente/${r.agente_id}">${esc(nomeAg(a))}</a></td>` : ""}
        <td class="num">${r.ordini}</td><td class="num">${r.cartoni}</td><td class="num">${money(r.fatturato)}</td><td class="num"><b>${money(r.maturata)}</b></td>
        <td class="num muted">${Number(r.in_attesa) ? money(r.in_attesa) : "—"}</td>
        <td>${Number(r.maturata) <= 0 ? '<span class="muted small">—</span>' : resto <= 0.005 ? `<span class="pill paid">liquidata</span> <button class="btn sm ghost" data-liq="${r.agente_id}|${r.mese}|0">annulla</button>` : `<span class="pill unpaid">da liquidare ${money(resto)}</span> <button class="btn sm" data-liq="${r.agente_id}|${r.mese}|1">Segna liquidata</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  }
  function bindLiq() {
    el("view").querySelectorAll("[data-liq]").forEach(b => b.onclick = async () => {
      const [ag, mese, on] = b.getAttribute("data-liq").split("|");
      if (on === "1" && !confirm("Segnare come liquidate (pagate all'agente) le provvigioni di " + meseLabel(mese) + "?")) return;
      const { error } = await db.rpc("admin_liquida_provvigioni", { p_agente_id: ag, p_mese: mese, p_liquidata: on === "1" });
      if (error) toast(error.message, "err"); else { toast(on === "1" ? "Provvigioni segnate come liquidate" : "Liquidazione annullata", "ok"); refresh(); }
    });
  }
  function vAgenti() {
    const ag = D.agenti || []; const daApp = agentiDaApprovare(); const mc = meseCorrente();
    const righe = ag.map(a => { const m = provvAgente(a.id).find(r => r.mese === mc) || {}; return { a, m, cl: (D.clientiDiAgente[a.id] || []).length, resto: daLiquidare(a.id) }; })
      .sort((x, y) => (x.a.approvato === y.a.approvato ? 0 : x.a.approvato ? 1 : -1) || nomeAg(x.a).localeCompare(nomeAg(y.a)));
    el("view").innerHTML = `
      <div class="page-title"><h1>Agenti</h1><span class="sub">${ag.length} agenti${daApp.length ? " · " + daApp.length + " da approvare" : ""}</span></div>
      ${daApp.length ? '<div class="notice warn">Ci sono agenti in attesa: apri la scheda, concorda la provvigione e approvali. Fino ad allora non possono registrare clienti.</div>' : ""}
      <p class="small muted">Per far scaricare l'app agenti a un nuovo rappresentante: <a href="qr.html" target="_blank" rel="noopener">QR delle app</a>.</p>
      ${!ag.length ? '<div class="card"><p class="muted" style="margin:0">Nessun agente ancora. Gli agenti si registrano dall\'app agenti; in alternativa apri la scheda di un cliente e usa "Trasforma in agente".</p></div>' : `
      <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Agente</th><th>Stato</th><th class="num">Provvigione</th><th class="num">Clienti</th><th class="num">Ordini questo mese</th><th class="num">Merce pagata (mese)</th><th class="num">Da liquidare</th></tr></thead><tbody>
        ${righe.map(({ a, m, cl, resto }) => `<tr class="click" data-go="#/agente/${a.id}">
          <td><b>${esc(nomeAg(a))}</b><br><span class="small muted">${esc(a.codice_agente || "")}${a.telefono ? " · " + esc(a.telefono) : ""}</span></td>
          <td>${a.approvato ? '<span class="pill paid">attivo</span>' : '<span class="pill unpaid">da approvare</span>'}</td>
          <td class="num">${a.provvigione_pct}%</td><td class="num">${cl}</td><td class="num">${m.ordini || 0}</td><td class="num">${money(m.fatturato || 0)}</td>
          <td class="num">${resto > 0.005 ? "<b>" + money(resto) + "</b>" : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>
      <div class="card"><h2>Provvigioni per mese</h2>
        <p class="small muted">La provvigione matura sugli ordini pagati e non annullati, sul valore della merce (senza spedizione e contrassegno). Quando paghi un agente, premi "Segna liquidata" sul mese.</p>
        ${provvTable(D.provv || [], { conAgente: true })}
      </div>`}`;
    bindRows(); bindLiq();
  }
  function vAgente(uid) {
    const a = D.agenteBy[uid]; if (!a) { el("view").innerHTML = '<div class="notice err">Agente non trovato.</div>'; return; }
    const clienti = (D.clientiDiAgente[a.id] || []).map(c => ({ c, s: D.stat[c.id] || Stats.cliente(c, D.byUser[c.id] || [], D.cfg) })).sort((x, y) => Stats.STATI[x.s.stato].prio - Stats.STATI[y.s.stato].prio);
    const ord = D.ordini.filter(o => o.agente_id === a.id && o.stato !== "annullato"); const pagati = ord.filter(o => o.pagato);
    const rows = provvAgente(a.id); const resto = daLiquidare(a.id);
    const link = CONFIG.SHOP_URL + "/account.html?agente=" + (a.codice_agente || ""); const t = tel(a), wa = waLink(a);
    el("view").innerHTML = `
      <p><a href="#/agenti">← Agenti</a></p>
      <div class="card head-cli">
        <div class="info">
          <h1 style="margin-bottom:.3rem">${esc(nomeAg(a))} <span class="pill agente">Agente</span> ${a.approvato ? '<span class="pill paid">attivo</span>' : '<span class="pill unpaid">da approvare</span>'}</h1>
          <dl class="kv">
            <dt>Contatti</dt><dd>${esc(a.email || "")}${t ? " · " + esc(t) : ""}</dd>
            ${a.piva || a.ragione_sociale ? `<dt>Fiscale</dt><dd>${esc(a.ragione_sociale || "")}${a.piva ? " · P.IVA " + esc(a.piva) : ""}</dd>` : ""}
            <dt>Codice</dt><dd><b>${esc(a.codice_agente || "—")}</b></dd>
            <dt>Link clienti</dt><dd><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a> <button class="btn sm ghost" id="ag-copy">Copia</button></dd>
            <dt>Registrato il</dt><dd>${dateS(a.created_at)}${a.accordo_accettato_il ? " · accordo accettato il " + dateS(a.accordo_accettato_il) : ""}</dd>
          </dl>
        </div>
        <div class="actions" style="flex-direction:column;align-items:stretch">
          ${t ? `<a class="btn tel" href="tel:${esc(t)}">Chiama</a>` : ""}${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          ${a.codice_agente ? `<div style="align-self:center">${qrSvg(link, 150)}</div>` : ""}
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Clienti</div><div class="v">${clienti.length}</div><div class="d">${clienti.filter(x => x.c.tipo !== "b2c" && !x.c.approvato).length ? clienti.filter(x => x.c.tipo !== "b2c" && !x.c.approvato).length + " da attivare" : ""}</div></div>
        <div class="kpi"><div class="l">Ordini</div><div class="v">${ord.length}</div><div class="d">${ord.reduce((s, o) => s + o.cartoni, 0)} cartoni</div></div>
        <div class="kpi"><div class="l">Merce pagata</div><div class="v">${money(pagati.reduce((s, o) => s + Number(o.subtotale), 0))}</div><div class="d">base di calcolo</div></div>
        <div class="kpi"><div class="l">Provvigioni maturate</div><div class="v">${money(pagati.reduce((s, o) => s + Number(o.provvigione), 0))}</div><div class="d">${a.provvigione_pct}% sulla merce</div></div>
        <div class="kpi ${resto > 0.005 ? "alert" : ""}"><div class="l">Da liquidare</div><div class="v ${resto > 0.005 ? "warn" : ""}">${money(resto)}</div><div class="d">${resto > 0.005 ? "segna i mesi pagati qui sotto" : "tutto liquidato"}</div></div>
      </div>
      <div class="grid two">
        <div>
          <div class="card"><h2>Provvigione e attivazione</h2>
            <p class="small muted">Stato: ${a.approvato ? '<span class="pill paid">attivo, può registrare clienti</span>' : '<span class="pill unpaid">da approvare, non può ancora lavorare</span>'}</p>
            <div class="row"><div class="field"><label>Provvigione (% sulla merce pagata)</label><input type="number" step="0.5" min="0" max="100" id="ag-pct" value="${a.provvigione_pct}"></div><div class="field"><label>Codice (lettere e numeri)</label><input id="ag-cod" value="${esc(a.codice_agente || "")}" maxlength="12" style="text-transform:uppercase"></div></div>
            <div class="actions"><button class="btn" id="ag-attiva">${a.approvato ? "Salva" : "Salva e approva"}</button>${a.approvato ? '<button class="btn ghost" id="ag-sospendi">Sospendi</button>' : ""}</div>
            <p class="small muted" style="margin:.6rem 0 0">All'approvazione l'agente riceve un'email con percentuale, codice e link. Se cambi la percentuale, vale per gli ordini da ora in poi.</p>
          </div>
          <div class="card"><h2>Provvigioni per mese</h2>${provvTable(rows)}</div>
          <div class="card"><h2>Altro</h2>
            <div class="actions"><button class="btn ghost" id="ag-cliente">Riporta a cliente</button><button class="btn red" id="ag-elimina">Elimina account</button></div>
            <p class="small muted" style="margin:.6rem 0 0">"Riporta a cliente" toglie il ruolo agente: i suoi clienti restano ma senza agente. "Elimina" cancella l'account (i clienti restano).</p>
          </div>
        </div>
        <div>
          <div class="card"><h2>I suoi clienti <span class="muted small">(${clienti.length})</span></h2>
            ${clienti.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Cliente</th><th>Stato</th><th class="num">Ordini</th><th>Ultimo</th></tr></thead><tbody>
              ${clienti.map(({ c, s }) => `<tr class="click" data-go="#/cliente/${c.id}"><td><b>${esc(nome(c))}</b><br><span class="small muted">${TIPO[c.tipo]}${c.tipo !== "b2c" && !c.approvato ? ' · <span class="pill unpaid">da attivare</span>' : ""}</span></td><td><span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></td><td class="num">${s.n}</td><td class="nowrap">${s.ultimo ? dateS(s.ultimo) : "—"}</td></tr>`).join("")}
            </tbody></table></div>` : '<p class="muted small" style="margin:0">Nessun cliente collegato. Può registrarli dall\'app agenti o con il suo link; tu puoi collegarne uno dalla scheda cliente.</p>'}
          </div>
        </div>
      </div>`;
    bindRows(); bindLiq();
    el("ag-copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copiato", "ok"); } catch (e) { prompt("Copia il link:", link); } };
    el("ag-attiva").onclick = async () => {
      const pct = Number(el("ag-pct").value); if (!(pct >= 0 && pct <= 100)) { toast("Percentuale non valida", "err"); return; }
      const { error } = await db.rpc("admin_imposta_agente", { p_user_id: a.id, p_approvato: true, p_pct: pct, p_codice: el("ag-cod").value.trim() || null });
      if (error) toast(error.message, "err"); else { toast(a.approvato ? "Agente aggiornato" : "Agente approvato: gli arriva l'email", "ok"); refresh(); }
    };
    const sp = el("ag-sospendi"); if (sp) sp.onclick = async () => { const { error } = await db.rpc("admin_imposta_agente", { p_user_id: a.id, p_approvato: false }); if (error) toast(error.message, "err"); else { toast("Agente sospeso", "ok"); refresh(); } };
    el("ag-cliente").onclick = async () => { if (!confirm("Togliere il ruolo agente a " + nomeAg(a) + "?")) return; const { error } = await db.rpc("admin_cambia_ruolo", { p_user_id: a.id, p_ruolo: "cliente" }); if (error) toast(error.message, "err"); else { toast("Ora è un cliente normale", "ok"); location.hash = "#/agenti"; refresh(); } };
    el("ag-elimina").onclick = async () => {
      if (!confirm("Eliminare definitivamente l'account di " + nomeAg(a) + "? I suoi clienti restano, senza agente.")) return;
      if (prompt("Per confermare scrivi ELIMINA") !== "ELIMINA") return;
      const { error } = await db.rpc("admin_elimina_cliente", { p_user_id: a.id }); if (error) toast(error.message, "err"); else { toast("Agente eliminato", "ok"); location.hash = "#/agenti"; refresh(); }
    };
  }

  // ---------- ORDINI ----------
  let ordF = "attivi";
  function vOrdini() {
    const list = D.ordini.filter(o => ordF === "tutti" ? true : ordF === "attivi" ? (o.stato === "da_pagare" || o.stato === "da_spedire") : o.stato === ordF);
    const cli = id => D.tuttiProfili.find(x => x.id === id) || {};
    el("view").innerHTML = `
      <div class="page-title"><h1>Ordini</h1><span class="sub">${list.length} in elenco</span></div>
      <div class="seg">${[["attivi", "Da gestire"], ["da_pagare", "Da pagare"], ["da_spedire", "Da spedire"], ["spedito", "Spediti"], ["annullato", "Annullati"], ["tutti", "Tutti"]].map(([k, l]) => `<button class="${ordF === k ? "on" : ""}" data-of="${k}">${l}</button>`).join("")}</div>
      <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>N.</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th class="num">Cartoni</th><th class="num">Totale</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>
        ${list.map(o => { const c = cli(o.user_id); const a = o.indirizzo || {}; return `<tr class="${o.visto === false ? "nuovo" : ""}">
          <td><b>${o.numero}</b>${o.visto === false ? '<br><span class="pill rischio">Nuovo</span>' : ""}</td><td class="small nowrap">${dateL(o.created_at)}</td>
          <td><a href="#/cliente/${o.user_id}"><b>${esc(nome(Object.keys(c).length ? c : a))}</b></a><br><span class="small muted">${TIPO[o.tipo]} · ${esc(a.citta || "")}</span></td>
          <td>${PM[o.metodo_pagamento]}<br><span class="pill ${o.pagato ? "paid" : "unpaid"}">${o.pagato ? "Pagato" : "Non pagato"}</span></td>
          <td class="num">${o.cartoni}</td><td class="num"><b>${money(o.totale)}</b></td><td><span class="pill ${o.stato}">${ST[o.stato]}</span></td>
          <td><div class="actions">
            <button class="btn sm ghost" data-det="${o.id}">Dettagli</button>
            ${!o.pagato && o.stato !== "annullato" ? `<button class="btn sm" data-paid="${o.id}">Segna pagato</button>` : ""}
            ${o.stato === "da_spedire" ? `<button class="btn sm amber" data-ship="${o.id}">Segna spedito</button>` : ""}
            ${o.stato !== "annullato" && o.stato !== "spedito" ? `<button class="btn sm ghost" data-cancel="${o.id}">Annulla</button>` : ""}
          </div></td></tr>`; }).join("") || '<tr><td colspan="8" class="muted">Nessun ordine.</td></tr>'}
      </tbody></table></div></div>`;
    el("view").querySelectorAll("[data-of]").forEach(b => b.onclick = () => { ordF = b.getAttribute("data-of"); vOrdini(); });
    // gli ordini mostrati ora sono "visti": il lampeggio si spegne
    const daSegnare = list.filter(o => o.visto === false).map(o => o.id);
    if (daSegnare.length && !DEMO) { db.rpc("admin_segna_ordini_visti", { p_ids: daSegnare }).then(({ error }) => { if (!error) { daSegnare.forEach(id => { const o = D.ordini.find(x => x.id === id); if (o) o.visto = true; }); renderNav("ordini"); } }); }
    else if (daSegnare.length) { daSegnare.forEach(id => { const o = D.ordini.find(x => x.id === id); if (o) o.visto = true; }); setTimeout(() => renderNav("ordini"), 1500); }
    const upd = async (id, stato, pagato) => { const { error } = await db.rpc("admin_aggiorna_ordine", { p_id: id, p_stato: stato, p_pagato: pagato }); if (error) toast(error.message, "err"); else { toast("Ordine aggiornato", "ok"); await loadAll(); vOrdini(); } };
    el("view").querySelectorAll("[data-paid]").forEach(b => b.onclick = () => upd(b.getAttribute("data-paid"), null, true));
    el("view").querySelectorAll("[data-ship]").forEach(b => b.onclick = () => upd(b.getAttribute("data-ship"), "spedito", null));
    el("view").querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => { if (confirm("Annullare questo ordine?")) upd(b.getAttribute("data-cancel"), "annullato", null); });
    el("view").querySelectorAll("[data-det]").forEach(b => b.onclick = () => {
      const o = D.ordini.find(x => x.id === b.getAttribute("data-det")); const a = o.indirizzo || {}; const c = cli(o.user_id);
      modal(`<h2>Ordine ${o.numero}</h2><dl class="kv"><dt>Data</dt><dd>${dateL(o.created_at)}</dd><dt>Cliente</dt><dd>${esc(nome(Object.keys(c).length ? c : a))} · ${esc(c.email || "")} · ${esc(a.telefono || c.telefono || "")}</dd>
        <dt>Consegna</dt><dd>${esc([a.ragione_sociale, (a.nome || "") + " " + (a.cognome || ""), a.via, (a.cap || "") + " " + (a.citta || "") + " (" + (a.prov || "") + ")"].filter(x => x && x.trim()).join(", "))}</dd>
        <dt>Note</dt><dd>${esc(o.note || "—")}</dd><dt>Pagamento</dt><dd>${PM[o.metodo_pagamento]} · ${o.pagato ? "pagato" + (o.pagato_il ? " il " + dateL(o.pagato_il) : "") : "non pagato"}</dd>
        ${o.agente_id ? `<dt>Agente</dt><dd><a href="#/agente/${o.agente_id}">${esc(nomeAg(D.agenteBy[o.agente_id]))}</a> · provvigione ${o.provvigione_pct}% = <b>${money(o.provvigione)}</b>${o.provvigione_liquidata_il ? " (liquidata)" : ""}</dd>` : ""}</dl>
        <h3 style="margin-top:1rem">Prodotti</h3>${(o.righe || []).map(r => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px dashed var(--line)"><span>${r.qty} × ${esc(r.nome)} <span class="muted small">(${money(r.prezzo)} cad.)</span></span><b>${money(r.totale)}</b></div>`).join("")}
        <div style="display:flex;justify-content:space-between;padding:.3rem 0"><span>Spedizione</span><span>${money(o.spedizione)}</span></div>${Number(o.supplemento) ? `<div style="display:flex;justify-content:space-between;padding:.3rem 0"><span>Contrassegno</span><span>${money(o.supplemento)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;font-weight:700;font-size:1.15rem"><span>Totale</span><span style="color:var(--green-d)">${money(o.totale)}</span></div>
        <p class="right" style="margin:1rem 0 0"><button class="btn ghost sm" id="m-close">Chiudi</button></p>`);
      el("m-close").onclick = closeModal;
    });
  }

  // ---------- IMPOSTAZIONI ----------
  function vImpostazioni() {
    const cfg = D.cfg;
    el("view").innerHTML = `
      <div class="page-title"><h1>Impostazioni</h1></div>
      <div class="grid two">
        <div class="card"><h2>Regole degli avvisi</h2>
          <p class="small muted">Ogni cliente è valutato sul suo intervallo abituale (la mediana dei giorni tra un ordine e l'altro).</p>
          <div class="row"><div class="field"><label>In ritardo: oltre × volte l'intervallo</label><input type="number" step="0.1" id="a-ritardo" value="${cfg.ritardo_x}"></div><div class="field"><label>A rischio: oltre × volte</label><input type="number" step="0.1" id="a-rischio" value="${cfg.rischio_x}"></div></div>
          <div class="row"><div class="field"><label>Perso: oltre × volte</label><input type="number" step="0.1" id="a-perso" value="${cfg.perso_x}"></div><div class="field"><label>Perso comunque dopo (giorni)</label><input type="number" id="a-persog" value="${cfg.perso_giorni}"></div></div>
          <div class="row"><div class="field"><label>Nuovo cliente: avviso dopo (giorni)</label><input type="number" id="a-nuovo" value="${cfg.nuovo_giorni}"></div><div class="field"><label>In flessione: calo cartoni oltre (%)</label><input type="number" id="a-fless" value="${cfg.flessione_pct}"></div></div>
          <button class="btn" id="a-save">Salva regole</button>
        </div>
        <div>
          <div class="card"><h2>Cosa significano gli stati</h2>
            ${Object.entries(Stats.STATI).sort((a, b) => a[1].prio - b[1].prio).map(([k, v]) => `<p style="margin:.4rem 0"><span class="pill ${v.colore}">${v.label}</span> <span class="small">${esc(v.desc.replace(/\{(\w+)\}/g, (m, key) => cfg[key]))}</span></p>`).join("")}
          </div>
          <div class="card"><h2>Avvisi sul dispositivo <span class="muted small" style="font-weight:400">· versione ${CONFIG.VERSIONE}</span></h2>
            <p class="small">Il pulsante <b>Ordini</b> lampeggia con il numero degli ordini che non hai ancora aperto. In più, quando arriva un ordine, la dashboard suona e mostra un avviso. Se installi la dashboard sulla schermata Home, il numerino compare anche sull'icona.</p>
            <p class="small">Permesso del browser: <b>${!("Notification" in window) ? "non supportato" : Notification.permission === "granted" ? "concesso" : Notification.permission === "denied" ? "bloccato (sbloccalo dalle impostazioni del browser)" : "da concedere"}</b> · Push su questo dispositivo: <b id="i-push-stato">controllo…</b></p>
            ${isIOS() && !standalone() ? '<div class="notice warn">Su iPhone le notifiche funzionano solo dalla dashboard aggiunta alla schermata Home: Condividi → "Aggiungi alla schermata Home", poi apri l\'icona e attiva da lì.</div>' : ""}
            <div class="actions"><button class="btn" id="i-notif">Attiva le notifiche su questo dispositivo</button><button class="btn ghost" id="i-push-test">Invia una notifica di prova</button><button class="btn ghost" id="i-test">Prova il suono</button></div>
          </div>
          <div class="card"><h2>QR delle app</h2>
            <p class="small">Scegli quale far inquadrare: si apre grande, da solo, con il tasto per stamparlo. Ogni agente ha poi il suo QR personale nella sua scheda.</p>
            <div class="actions"><button class="btn red" id="i-qr-clienti">QR app clienti</button><button class="btn tel" id="i-qr-agenti">QR app agenti</button></div>
          </div>
          <div class="card"><h2>Altre impostazioni</h2><p class="small">IBAN per il bonifico, email degli avvisi, fasce di spedizione, prodotti e prezzi ai privati si gestiscono nel pannello del negozio.</p><a class="btn ghost" href="${CONFIG.SHOP_URL}/admin.html" target="_blank" rel="noopener">Apri il pannello del negozio</a></div>
        </div>
      </div>`;
    const inb = el("i-notif"); if (inb) inb.onclick = chiediPermessoNotifiche;
    const QR_APP = { clienti: { titolo: "App clienti (rossa)", img: "assets/img/qr-clienti.png", url: CONFIG.SHOP_URL, colore: "#c8452b" }, agenti: { titolo: "App agenti (blu)", img: "assets/img/qr-agenti.png", url: CONFIG.AGENTI_URL, colore: "#2c5f8a" } };
    const apriQr = k => { const q = QR_APP[k]; modal(`<div style="text-align:center"><h2 style="color:${q.colore}">${q.titolo}</h2><img src="${q.img}" alt="QR" style="width:min(320px,100%);image-rendering:pixelated;border-radius:10px;background:#fff"><p class="small" style="word-break:break-all;margin:.6rem 0">${esc(q.url)}</p><p class="small muted">Inquadra con la fotocamera. Per averla come app: Android → menu Chrome → "Aggiungi a schermata Home"; iPhone → Condividi → "Aggiungi alla schermata Home".</p><div class="actions" style="justify-content:center"><a class="btn" href="qr.html?app=${k}" target="_blank" rel="noopener">Stampa</a><button class="btn ghost" id="q-close">Chiudi</button></div></div>`); el("q-close").onclick = closeModal; };
    el("i-qr-clienti").onclick = () => apriQr("clienti"); el("i-qr-agenti").onclick = () => apriQr("agenti");
    el("i-push-test").onclick = provaPush;
    pushStato().then(st => { const x = el("i-push-stato"); if (x) x.textContent = { attivo: "attive (anche ad app chiusa)", spento: "non attive", non_supportato: "non supportate da questo browser" }[st]; });
    el("i-test").onclick = () => { beep(); toast("Così suona un nuovo ordine", "ok"); };
    el("a-save").onclick = async () => {
      const v = { ritardo_x: Number(el("a-ritardo").value), rischio_x: Number(el("a-rischio").value), perso_x: Number(el("a-perso").value), perso_giorni: Number(el("a-persog").value), nuovo_giorni: Number(el("a-nuovo").value), flessione_pct: Number(el("a-fless").value) };
      const { error } = await db.rpc("admin_salva_impostazione", { p_chiave: "avvisi", p_valore: v }); if (error) toast(error.message, "err"); else { toast("Regole salvate", "ok"); refresh(); }
    };
  }

  db.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { user = null; } });
  window.__dash = { get D() { return D; }, DEMO };
  boot().catch(e => { console.error("boot", e); toast("Errore: " + e.message, "err"); });
})();
