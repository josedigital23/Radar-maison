/* Radar Maison — script de fond.
   Deux rôles :
   1. au clic sur l'icône, ouvrir (ou refermer) le panneau — la pastille flottante fait la même chose ;
   2. porter les appels réseau, pour échapper à la politique de sécurité (CSP) des sites d'annonces. */

browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.executeScript(tab.id, {
    code: "window.__radarMaison ? window.__radarMaison.basculer() : null;"
  }).then(([r]) => {
    if (r === null || r === undefined) {
      // le script de contenu ne tournait pas sur cette page : on l'injecte
      const fichiers = ["moteur/collecte.js", "moteur/notation.js", "moteur/regles.js", "rapport.js", "content.js"];
      return fichiers.reduce((p, f) => p.then(() => browser.tabs.executeScript(tab.id, { file: f })), Promise.resolve())
        .then(() => browser.tabs.executeScript(tab.id, {
          code: "window.__radarMaison && window.__radarMaison.basculer();"
        }));
    }
  }).catch(e => console.error("Radar Maison :", e));
});

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.type !== "fetch" && msg.type !== "texte") return;
  try {
    const r = await fetch(msg.url);
    if (!r.ok) return { erreur: "HTTP " + r.status };
    return msg.type === "texte" ? { texte: await r.text() } : { data: await r.json() };
  } catch (e) {
    return { erreur: String(e) };
  }
});
