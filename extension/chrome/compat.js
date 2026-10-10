/* Radar Maison — pont Firefox → Chrome.
   content.js a été écrit pour Firefox, qui expose l'API des extensions sous le nom `browser`.
   Chrome l'appelle `chrome`. Ce fichier, chargé juste avant content.js, fait le lien :
   content.js reste strictement identique d'un navigateur à l'autre. */
if (typeof globalThis.browser === "undefined") {
  globalThis.browser = chrome;
}
