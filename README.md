# Cycle

Suivi de sommeil, mobile first. Site statique, aucun build, aucune dependance.

- `index.html` : toute l'app
- `manifest.webmanifest` + `icon.svg` + `icon-180.png` : installation sur l'ecran d'accueil
- `sw.js` : cache hors ligne

Les donnees sont stockees dans le localStorage du navigateur. Rien ne sort du telephone.

## Deploiement Vercel
Framework Preset : Other. Aucune commande de build. Racine du depot.
