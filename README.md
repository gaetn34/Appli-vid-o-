# 🎬 Clipou Studio

Application **personnelle** (PWA) à installer sur ton téléphone pour **créer et monter des vidéos courtes pour enfants** au format vertical **9:16** (TikTok, YouTube Shorts), à partir d'un simple prompt.

L'IA (Claude, d'Anthropic) fonctionne avec **ta propre clé API**, stockée uniquement sur ton téléphone.

## Ce que fait l'app

| Écran | Fonctions |
|---|---|
| ✨ **Créer** | Prompt libre, idées générées par l'IA, choix de l'âge (2–4 / 4–7 / 7–10 ans), durée (15–60 s), style visuel et langue (FR / EN / ES). L'IA écrit le scénario, découpe les scènes, choisit décors, personnages, effets, transitions, musique, titre, description et hashtags. |
| 🎬 **Montage** | Aperçu 9:16 en direct, timeline de scènes (ajouter, dupliquer, déplacer, supprimer), texte à l'écran façon karaoké, durée, décor, effets (confettis, bulles, étoiles…), caméra (zoom, travelling), transitions, fonds en dégradé. **Glisse les personnages directement sur l'image.** Annuler ↶. Affichage de la zone sûre TikTok (▦). |
| 🐰 **Persos** | Ajout d'emojis-personnages, animation (rebond, flotte, saute, marche…), entrée (pop, glissé, tombe du ciel…), taille. |
| 🎵 **Son** | Musique générée automatiquement (joyeux, comptine, calme, aventure, mystère, fête), tempo, volumes. **Enregistre ta voix** scène par scène : elle est mixée dans la vidéo et la musique baisse pendant que tu parles. |
| 🤖 **IA** | Retouche par la parole : « rends-la plus drôle », « ajoute un quiz à la fin », « traduis en anglais »… sur toute la vidéo ou une seule scène. |
| 🚀 **Publier** | Titre, description et hashtags à copier, check-list (YouTube « conçue pour les enfants », etc.), export **MP4 vertical** (720p ou 1080p), téléchargement ou partage direct vers TikTok / YouTube. |
| ⚙️ **Réglages** | Clé API, choix du modèle, nom de chaîne en filigrane, **code PIN** pour que l'app reste à toi, effacement des données. |

Garde-fous enfants intégrés au prompt de l'IA : contenu bienveillant, aucun personnage sous droits (Disney, Pokémon…), aucune donnée personnelle, pas d'incitation à l'achat.

## Installer sur ton téléphone

1. **Fusionne** cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
3. Le workflow « Publier sur GitHub Pages » met l'app en ligne sur `https://<ton-pseudo>.github.io/Appli-vid-o-/`.
4. Ouvre cette adresse sur ton téléphone :
   - **iPhone** : Safari → Partager → **Sur l'écran d'accueil**
   - **Android** : Chrome → ⋮ → **Installer l'application**
5. Dans l'app : **Réglages → colle ta clé API** (`sk-ant-…`, créée sur [console.anthropic.com](https://console.anthropic.com)) → **Tester la connexion**.
6. (Conseillé) Définis un **code PIN**.

> Le site est public mais ne contient **aucune clé** : sans ta clé (enregistrée seulement dans ton téléphone), l'IA ne fonctionne pas pour les autres visiteurs.

## Comment ça marche

- 100 % côté téléphone : HTML / CSS / JavaScript, aucun serveur, aucune étape de build.
- L'IA est appelée directement depuis le téléphone vers `api.anthropic.com` avec le SDK officiel `@anthropic-ai/sdk` (version 1.6.0 embarquée dans `js/vendor/`). Les réponses sont en **sorties structurées JSON** (schéma strict) puis nettoyées avant affichage.
- Modèle par défaut : **Claude Opus 5.5** (Sonnet 5.5 et Haiku 5.5 disponibles dans Réglages pour aller plus vite / moins cher). Le repli serveur automatique en cas de refus est activé.
- Le moteur vidéo dessine chaque image sur un `<canvas>` 1080×1920 ; la musique est synthétisée avec Web Audio ; l'export enregistre canvas + audio avec `MediaRecorder` (MP4 sur iPhone et Chrome récent, sinon WebM).
- Projets dans `localStorage`, voix enregistrées dans IndexedDB.

| Fichier | Rôle |
|---|---|
| `index.html`, `css/styles.css` | Interface mobile |
| `js/app.js` | Écrans, montage, lecture, export |
| `js/ai.js` | Appels à Claude, prompts, schémas JSON |
| `js/renderer.js` | Dessin des scènes, personnages, effets, textes, transitions |
| `js/audio.js` | Musique générée, mixage des voix |
| `js/storage.js` | Stockage local |
| `sw.js`, `manifest.webmanifest` | Installation et ouverture hors ligne |

## Limites connues

- L'export se fait **en temps réel** (30 s de vidéo = 30 s d'export) : garde l'écran allumé et l'app au premier plan.
- La **voix de synthèse** ne sert qu'à l'aperçu (les navigateurs ne permettent pas de l'enregistrer). Pour une narration dans la vidéo : enregistre ta voix, ou utilise la « synthèse vocale » de TikTok / CapCut sur le texte.
- Les visuels sont des emojis animés et des décors dessinés : pas de génération d'images ou de vidéo réaliste (Claude écrit et met en scène, il ne génère pas d'images).
- La clé est utilisée depuis le navigateur : réserve-la à ton propre téléphone et fixe une limite de dépense dans la console Anthropic.

## Tester en local

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```
