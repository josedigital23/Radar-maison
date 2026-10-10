/* Radar Maison — script de fond, version Chrome (Manifest V3).
   Mêmes deux rôles que la version Firefox :
   1. au clic sur l'icône, ouvrir (ou refermer) le panneau — la pastille flottante fait la même chose ;
   2. porter les appels réseau, pour échapper à la politique de sécurité (CSP) des sites d'annonces.

   Ce qui change par rapport à Firefox : Chrome n'accepte plus de code passé en texte
   (executeScript({code})), et sa messagerie attend `sendResponse` + `return true`
   plutôt qu'une promesse renvoyée. La logique, elle, ne bouge pas. */

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.__radarMaison) { window.__radarMaison.basculer(); return true; }
        return false;
      }
    });
    if (!r || !r.result) {
      // le script de contenu ne tournait pas sur cette page : on l'injecte, puis on ouvre
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["compat.js", "moteur/collecte.js", "moteur/notation.js", "moteur/regles.js", "rapport.js", "content.js"] });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { window.__radarMaison && window.__radarMaison.basculer(); }
      });
    }
  } catch (e) {
    console.error("Radar Maison :", e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "fetch" && msg.type !== "texte") return false;
  (async () => {
    try {
      const r = await fetch(msg.url);
      if (!r.ok) return sendResponse({ erreur: "HTTP " + r.status });
      sendResponse(msg.type === "texte" ? { texte: await r.text() } : { data: await r.json() });
    } catch (e) {
      sendResponse({ erreur: String(e) });
    }
  })();
  return true;   // la réponse arrive plus tard : on garde le canal ouvert
});
