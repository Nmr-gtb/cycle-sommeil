# Cycle

Suivi de sommeil, mobile first. Site statique, aucun build, aucune dependance.

- `index.html` : toute l'app
- `manifest.webmanifest` + `icon.svg` + `icon-180.png` : installation sur l'ecran d'accueil
- `sw.js` : cache hors ligne

Les donnees sont stockees dans le localStorage du navigateur. Rien ne sort du telephone.

## Deploiement Vercel
Framework Preset : Other. Aucune commande de build. Racine du depot.

## Bilan automatique

La route `api/bilan.mjs` genere un bilan a partir des nuits stockees dans Supabase.
Elle necessite la variable d environnement ANTHROPIC_API_KEY cote Vercel.
