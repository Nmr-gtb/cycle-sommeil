// Fonction serverless Vercel.
// La cle API reste ici, cote serveur : elle n'est jamais envoyee au navigateur.
// Le client s'identifie avec sa cle de synchronisation, la meme que pour Supabase.

const SB_URL = 'https://hnvforrduqynytrzkwnu.supabase.co';
const SB_KEY = 'sb_publishable_yZj7yvVnytRLy3rN4xpkWw_ns15xtWE';
const DELAI_MS = 6 * 60 * 60 * 1000; // un bilan toutes les 6 h maximum

const pad = n => String(n).padStart(2, '0');
const toMin = t => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const dur = n => { let x = toMin(n.wake) - toMin(n.bed); return x <= 0 ? x + 1440 : x; };
const ax = t => { const m = toMin(t) - 1080; return m < 0 ? m + 1440 : m; };
const clock = m => { const v = ((Math.round(m) + 1080) % 1440 + 1440) % 1440; return pad(Math.floor(v / 60)) + ':' + pad(v % 60); };
const hm = m => { const s = m < 0 ? '-' : ''; m = Math.abs(Math.round(m)); return s + Math.floor(m / 60) + 'h' + pad(m % 60); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sd = a => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };

async function sb(path, opts, key) {
  const o = opts || {};
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'x-sync-key': key,
      'Content-Type': 'application/json',
      ...(o.headers || {})
    },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()));
  return r.status === 204 ? null : r.json();
}

// Tout le calcul est fait ici, pas par le modele : les chiffres doivent etre exacts.
function stats(nights, cible) {
  const tri = [...nights].sort((a, b) => a.date < b.date ? -1 : 1);
  const d = tri.map(dur);
  const beds = tri.map(n => ax(n.bed));
  const wakes = tri.map(n => ax(n.wake));
  const nat = tri.filter(n => n.wakeType === 'naturel').map(dur).sort((a, b) => b - a);

  // Alternance d'une nuit a l'autre : negatif = yoyo.
  let alt = 0;
  if (d.length > 2) {
    const m = avg(d);
    const den = d.reduce((s, x) => s + (x - m) ** 2, 0);
    if (den > 0) alt = d.slice(0, -1).reduce((s, _, i) => s + (d[i] - m) * (d[i + 1] - m), 0) / den;
  }
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const we = tri.filter(n => [0, 6].includes(new Date(n.date + 'T12:00').getDay()));
  const sem = tri.filter(n => ![0, 6].includes(new Date(n.date + 'T12:00').getDay()));
  const mid = n => { const a = ax(n.bed); return a + (ax(n.wake) - a) / 2; };

  return {
    nb: tri.length,
    periode: tri[0].date + ' au ' + tri[tri.length - 1].date,
    moyenne: hm(avg(d)),
    cible: hm(cible),
    dette: hm(d.reduce((s, x) => s + x - cible, 0)),
    sous_objectif: d.filter(x => x < cible).length,
    sous_six_heures: d.filter(x => x < 360).length,
    coucher_moyen: clock(avg(beds)),
    coucher_variation_min: Math.round(sd(beds)),
    reveil_moyen: clock(avg(wakes)),
    reveil_variation_min: Math.round(sd(wakes)),
    couchers_avant_minuit: tri.filter(n => toMin(n.bed) >= 1320 && toMin(n.bed) < 1440).length,
    reveils_naturels: nat.length,
    besoin_estime: nat.length >= 5 ? hm(avg(nat.slice(0, Math.max(2, Math.ceil(nat.length / 3))))) : null,
    nuits_avec_reveils: tri.filter(n => (n.awak || 0) > 0).length,
    alternance: alt.toFixed(2),
    decalage_weekend_min: (we.length >= 2 && sem.length >= 3)
      ? Math.round(Math.abs(avg(we.map(mid)) - avg(sem.map(mid)))) : null,
    nuits: tri.map(n => ({
      date: n.date,
      jour: jours[new Date(n.date + 'T12:00').getDay()],
      coucher: n.bed, reveil: n.wake, duree: hm(dur(n)),
      reveil_naturel: n.wakeType === 'naturel',
      reveils_nocturnes: n.awak || 0
    }))
  };
}

const SYSTEME = `Tu analyses les donnees de sommeil d'un utilisateur de l'application Cycle.

Ton: direct, humain, tutoiement. Phrases courtes. Pas de tirets cadratins. Pas de langue de bois,
quitte a le challenger. Ne le felicite pas pour rien.

Regles absolues:
- N'invente aucun chiffre. Utilise uniquement ceux fournis dans les donnees.
- Tu ne poses aucun diagnostic et tu ne prescris rien. Tu decris ce que montrent les donnees.
- Si un motif inquietant persiste, tu peux suggerer d'en parler a un medecin, sans dramatiser.
- Une nuit isolee tres courte est souvent une soiree, pas un trouble du sommeil. Ne conclus pas dessus.
- Distingue toujours "dormir mal" (fragmente, difficile) de "dormir peu" (trop court). Ce n'est pas pareil.

Structure ta reponse en 3 parties courtes, en markdown avec des titres en gras:
1. Ce que disent tes chiffres (2 a 3 phrases, les faits marquants)
2. Ce que j'y vois (l'interpretation, le mecanisme, le point le plus important)
3. Cette semaine (UNE seule action concrete et mesurable, pas une liste)

Maximum 300 mots. Va a l'essentiel.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'methode non autorisee' });

  const key = req.headers['x-sync-key'];
  if (!key || key.length < 24) return res.status(401).json({ erreur: 'cle de synchronisation absente ou invalide' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erreur: "La cle API n'est pas configuree sur le serveur." });

  try {
    // 1. Les donnees sont relues depuis Supabase, jamais recues du client :
    //    la RLS garantit qu'on ne voit que les nuits de cette cle.
    const rows = await sb('cycle_nights?select=*&order=night_date.desc&limit=60', {}, key);
    if (!rows || rows.length < 7) {
      return res.status(400).json({ erreur: 'Il faut au moins 7 nuits enregistrees. Tu en as ' + (rows ? rows.length : 0) + '.' });
    }

    const prefs = await sb('cycle_prefs?select=*&limit=1', {}, key);
    const p = (prefs && prefs[0]) || {};
    const cible = p.target || 480;

    // 2. Garde-fou : un bilan toutes les 6 h, sinon on renvoie celui en cache.
    const force = req.body && req.body.force === true;
    if (p.bilan && p.bilan_at && Date.now() - new Date(p.bilan_at).getTime() < DELAI_MS && !force) {
      return res.status(200).json({ bilan: p.bilan, cache: true, genere_le: p.bilan_at });
    }

    const donnees = stats(rows.map(r => ({
      date: r.night_date, bed: r.bed.slice(0, 5), wake: r.wake.slice(0, 5),
      wakeType: r.wake_type, awak: r.awak
    })), cible);

    // 3. Appel du modele.
    const ia = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 900,
        system: SYSTEME,
        messages: [{ role: 'user', content: 'Voici mes donnees de sommeil :' + String.fromCharCode(10,10) + JSON.stringify(donnees, null, 1) }]
      })
    });

    if (!ia.ok) {
      const detail = await ia.text();
      console.error('anthropic', ia.status, detail);
      return res.status(502).json({ erreur: "Le service d'analyse n'a pas repondu.", statut: ia.status });
    }

    const out = await ia.json();
    const texte = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join(String.fromCharCode(10)).trim();
    if (!texte) return res.status(502).json({ erreur: 'Reponse vide.' });

    // 4. Mise en cache pour relecture sans nouvel appel.
    await sb('cycle_prefs?on_conflict=sync_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: [{
        sync_key: key, target: cible, theme: p.theme || 'light',
        bilan: texte, bilan_at: new Date().toISOString(),
        bilan_count: (p.bilan_count || 0) + 1, updated_at: new Date().toISOString()
      }]
    }, key).catch(e => console.error('cache', e));

    return res.status(200).json({ bilan: texte, cache: false, genere_le: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erreur: 'Erreur interne.' });
  }
}
