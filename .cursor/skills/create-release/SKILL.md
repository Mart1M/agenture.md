---
name: create-release
description: Prépare et publie une release de l’app desktop Tauri (GitHub Actions, signature updater, tag semver). Utiliser quand l’utilisateur veut sortir une version, pousser une release GitHub, débloquer le workflow Release, ou vérifier signing/updater.
disable-model-invocation: true
---

# Créer une release (Agenture — Tauri + GitHub Actions)

## Prérequis dans le repo

- Workflow : `.github/workflows/release.yml` (matrix macOS arm64/x64, Ubuntu, Windows, `tauri-apps/tauri-action@v0`).
- Updater : `src-tauri/tauri.conf.json` → `bundle.createUpdaterArtifacts: true`, `plugins.updater.pubkey`, `plugins.updater.endpoints`.

## Avant de taguer

1. **Aligner les versions** : même numéro dans `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` [package], et idéalement `package.json` si tu les synchronises.
2. **Clé publique** : `plugins.updater.pubkey` doit être le **Base64 standard** du **contenu UTF-8 complet** du fichier `*.key.pub` (ligne `untrusted comment:…`, ligne `RWS…`, saut de ligne final comme sur disque). Ce n’est **pas** la seule 2ᵉ ligne seule. Générer :  
   `node -e "console.log(Buffer.from(require('fs').readFileSync('src-tauri/signing/agenture.key.pub','utf8')).toString('base64'))"`  
   (adapter le chemin). Une seule chaîne base64 dans le JSON, sans espaces ni retours ligne.
3. **Secrets GitHub** (Settings → Secrets and variables → Actions) :
   - `TAURI_SIGNING_PRIVATE_KEY` : contenu **complet** du fichier `.key` (multiligne).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : **à supprimer** si la clé a été générée avec un mot de passe vide (`tauri signer generate … --password ''`). Tauri utilise le format **rsign** : la clé reste libellée « encrypted » mais sans passphrase ; si ce secret existe avec une valeur erronée, le build échoue. En **local**, pour éviter le prompt interactif : exporter `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=` (vide) ou utiliser `pnpm run tauri:build:signed`.
4. **Permissions** : Settings → Actions → General → Workflow permissions → **Read and write**.

## Déclencher la release

- Pousser un tag **`v` + version** (ex. version `0.2.0` → `v0.2.0`), cohérent avec `tauri-action` / `tagName: v__VERSION__` :

```bash
git tag v0.2.0
git push origin v0.2.0
```

- Ou : **Actions** → workflow **Release** → **Run workflow**.

## Après la release

- Vérifier les assets sur GitHub : binaires, `.sig`, **`latest.json`** à l’URL configurée dans `endpoints` (`.../releases/latest/download/latest.json`).
- Rotation de clé : mettre à jour `pubkey`, secret `TAURI_SIGNING_PRIVATE_KEY`, rebuild ; les installs déjà en prod ne suivront les updates **que** s’ils ont été buildés avec la même paire qu’actuellement publiée.

## Pannes fréquentes

| Erreur | Cause probable |
|--------|----------------|
| `Invalid symbol 32, offset 9` (pubkey) | `pubkey` est le texte du `.pub` collé tel quel dans le JSON : il faut **une** chaîne Base64 du fichier entier. |
| `invalid utf-8 sequence` (base64 → utf8) | `pubkey` n’est que la 2ᵉ ligne minisign : le CLI décode d’abord en Base64, le résultat doit être le **texte** `.pub` complet (2 lignes). |
| `Wrong password for that key` | Mot de passe secret incorrect, ou secret mot de passe présent alors que la clé n’est pas chiffrée. |
| Resource not accessible | Token workflow sans droit d’écriture sur le repo. |

## Release locale (sans CI)

Possible avec **`gh release create`** après `tauri build` signé ; éviter de doubler involontairement CI + upload manuel sur le même tag sans stratégie claire.

## Clé privée hors repo

Fichiers typiques ignorés par git : `src-tauri/signing/*.key`. Copie de travail possible sous `~/.tauri/agenture.key` ; ne jamais committer la clé privée.
