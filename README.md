# Carminello Dashboard

Pannello riservato al titolare: cruscotto, clienti da chiamare, statistiche per cliente (privati, locali, rivenditori), ordini, regole degli avvisi.

- Stesso database e stesso login del negozio (entra solo chi ha ruolo `admin` in `profiles`).
- Nessun build: HTML/CSS/JS puro, pubblicabile su GitHub Pages.
- `index.html?demo=1` mostra la dashboard con dati finti, per provarla senza database.
- Le regole degli avvisi sono in `assets/js/stats.js` e le soglie in `impostazioni.avvisi` (modificabili dalla pagina Impostazioni).

Richiede la migrazione `supabase/migrazione-02-rivenditori-dashboard.sql` del repository del negozio.
