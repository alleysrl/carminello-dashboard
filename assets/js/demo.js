/* Dati finti per provare la dashboard senza database: apri index.html?demo=1 */
const Demo = (function () {
  let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const NOMI = ["Pizzeria Da Gigi", "Ristorante Il Forno", "Bar Centrale", "Trattoria La Nonna", "Pub The Corner", "Osteria del Ponte", "Pizzeria Bella Napoli", "Ristorante Sole", "Bar Sport", "Pizzeria Vesuvio", "Locanda Toscana", "Birreria Nord"];
  const RIV = ["Alimentari Rossi Srl", "Grossista Toscana Food", "Distribuzione Bianchi", "Rappresentanza Verdi", "CateringPlus Srl"];
  const PRIV = ["Giulia Moretti", "Marco Rossi", "Elena Bianchi", "Luca Verdi", "Sara Conti", "Paolo Neri", "Anna Russo", "Davide Galli", "Chiara Ferri", "Matteo Costa", "Laura Fontana", "Simone Mancini", "Francesca Rizzo", "Andrea Greco", "Valentina Bruno"];
  const CITTA = ["Firenze", "Prato", "Sesto Fiorentino", "Pistoia", "Empoli", "Scandicci", "Lucca", "Pisa"];
  function genera() {
    const now = Date.now(), DAY = 86400000; const profili = [], ordini = [], note = []; let num = 1001;
    function cliente(nomeStr, tipo, i, ritmo, dal, cartoniMedi, prezzo, pattern) {
      const id = tipo + "-" + i; const creato = now - dal * DAY;
      const p = { id, email: nomeStr.toLowerCase().replace(/[^a-z]+/g, ".") + "@esempio.it", tipo, ruolo: "cliente", nome: tipo === "b2c" ? nomeStr.split(" ")[0] : "Titolare", cognome: tipo === "b2c" ? nomeStr.split(" ")[1] : "", telefono: "3" + Math.floor(rnd() * 899999999 + 100000000), ragione_sociale: tipo === "b2c" ? null : nomeStr, piva: tipo === "b2c" ? null : String(Math.floor(rnd() * 9e10 + 1e10)), indirizzo: { via: "Via Roma " + Math.floor(rnd() * 90 + 1), citta: pick(CITTA), cap: "50100", prov: "FI" }, approvato: tipo !== "b2c", created_at: new Date(creato).toISOString(), prezzi_cliente: tipo === "b2c" ? [] : [{ product_id: "base-33-cartone-20", prezzo }] };
      profili.push(p);
      if (!ritmo) return;
      let t = creato + 2 * DAY; let k = 0;
      while (t < now - pattern(k, dal) * DAY) {
        const cart = Math.max(1, Math.round(cartoniMedi * (0.6 + rnd() * 0.8) * (pattern === calo && t > now - 90 * DAY ? 0.5 : 1)));
        const unit = tipo === "b2c" ? 14.99 : prezzo; const sub = +(cart * unit).toFixed(2); const sped = cart >= 10 ? 0 : cart >= 4 ? 24.99 : [0, 6.99, 15.98, 20.97][cart];
        const metodo = tipo === "b2c" ? pick(["carta", "carta", "bonifico"]) : pick(["bonifico", "contrassegno", "carta"]);
        ordini.push({ id: "o" + num, numero: num++, user_id: id, tipo, stato: t < now - 3 * DAY ? "spedito" : (metodo === "bonifico" ? "da_pagare" : "da_spedire"), metodo_pagamento: metodo, pagato: t < now - 3 * DAY || metodo === "carta", cartoni: cart, subtotale: sub, spedizione: sped, supplemento: metodo === "contrassegno" ? 5 : 0, totale: +(sub + sped + (metodo === "contrassegno" ? 5 : 0)).toFixed(2), indirizzo: Object.assign({ nome: p.nome, cognome: p.cognome, telefono: p.telefono, ragione_sociale: p.ragione_sociale }, p.indirizzo), righe: [{ product_id: tipo === "b2c" ? "base-33-cartone-8" : "base-33-cartone-20", nome: tipo === "b2c" ? "Base Pizza Carminello 33 cm — cartone da 8" : "Base Pizza Carminello 33 cm — cartone da 20", qty: cart, prezzo: unit, totale: sub }], created_at: new Date(t).toISOString() });
        t += ritmo * DAY * (0.7 + rnd() * 0.6); k++;
      }
    }
    const reg = () => 0, ritardo = () => 0, calo = () => 0;
    // locali: ritmi diversi e stati diversi (l'ultimo argomento decide da quanti giorni non ordinano)
    const stopL = [0, 0, 12, 0, 25, 0, 40, 0, 0, 100, 3, 0];
    NOMI.forEach((n, i) => cliente(n, "b2b", i, [7, 10, 14, 7, 10, 21, 7, 14, 10, 14, 7, 30][i], 300 + i * 10, [4, 3, 2, 5, 3, 2, 6, 2, 3, 2, 4, 1][i], 30 + (i % 4), i === 3 || i === 7 ? calo : () => stopL[i]));
    RIV.forEach((n, i) => cliente(n, "rivenditore", i, [14, 21, 30, 14, 45][i], 250 + i * 20, [15, 20, 25, 10, 30][i], 27 + i, i === 1 ? calo : () => [0, 0, 70, 0, 0][i]));
    PRIV.forEach((n, i) => cliente(n, "b2c", i, i === 14 ? 0 : [30, 45, 60, 20, 90, 30, 40, 60, 30, 120, 45, 30, 75, 50, 0][i], 200 + i * 5, 1 + (i % 2), 14.99, () => [0, 0, 0, 0, 0, 0, 130, 0, 60, 0, 0, 0, 0, 0, 0][i]));
    // qualche locale registrato da attivare e qualche nota
    profili.push({ id: "b2b-new-1", email: "nuovo@locale.it", tipo: "b2b", ruolo: "cliente", nome: "Mario", cognome: "Esposito", telefono: "3331234567", ragione_sociale: "Pizzeria Nuova Apertura", piva: "01234567890", indirizzo: { citta: "Firenze" }, approvato: false, created_at: new Date(now - 2 * DAY).toISOString(), prezzi_cliente: [] });
    note.push({ id: "n1", user_id: "b2b-4", tipo: "chiamata", testo: "Ha finito le scorte solo ora, riordina la prossima settimana", esito: "riordina", created_at: new Date(now - 2 * DAY).toISOString() });
    note.push({ id: "n2", user_id: "b2b-9", tipo: "whatsapp", testo: "Ha cambiato fornitore per il prezzo. Riproviamo a settembre.", esito: "perso", created_at: new Date(now - 40 * DAY).toISOString() });
    return { profili, ordini: ordini.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), note, imp: { avvisi: {} } };
  }
  return { genera };
})();
