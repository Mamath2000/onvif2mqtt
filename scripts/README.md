# 🚀 Scripts de Build et Versioning onvif2mqtt

Ce dossier contient les scripts automatisés pour le build, la publication et le versioning de l'application onvif2mqtt.

## 📋 Scripts disponibles

### 1. `setup-env.sh` - Préparation de l'environnement
Installe les dépendances manquantes et configure l'environnement initial.

```bash
./scripts/setup-env.sh
# ou
make setup
```

**Fonctionnalités :**
- Installe `jq` si manquant
- Crée `config.conf` depuis `config.conf.example`
- Crée le répertoire `logs`
- Installe les dépendances npm
- Vérifie Docker et docker-compose

### 2. `build-docker-image.sh` - Build et Publication Docker Hub
Build l'image Docker, la publie sur Docker Hub et incrémente automatiquement la version.

```bash
./scripts/build-docker-image.sh
# ou  
make build-and-publish
```

**Fonctionnalités :**
- ✅ Build de l'image Docker avec métadonnées git
- ✅ Publication sur Docker Hub avec 3 tags : `latest`, `version`, `git-ref`
- ✅ **Incrémentation automatique** de la version patch dans `package.json`
- ✅ Commit automatique de la nouvelle version
- ✅ Vérifications de sécurité (working directory propre, Docker login)

### 3. `build-and-up.sh` - Build local et déploiement
Build l'image avec la référence git et lance docker-compose.

```bash
./scripts/build-and-up.sh
# ou
make docker-compose-up
```

**Fonctionnalités :**
- Build avec référence git injectée
- Arrêt propre des conteneurs existants
- Déploiement avec docker-compose
- Affichage des logs et statuts

## 🔄 Workflow de versioning

### Version automatique (recommandé)
```bash
# 1. Développez vos fonctionnalités
git add .
git commit -m "feat: nouvelle fonctionnalité"

# 2. Build et publication avec auto-increment
make build-and-publish
# Version 1.0.0 → 1.0.1 automatiquement
# + Publication Docker Hub
# + Commit de version

# 3. Push des changements
git push origin main
```

### Version manuelle
```bash
# Incrémenter manuellement la version
make version-bump
# 1.0.0 → 1.0.1

# Puis build sans auto-increment
make docker-build
```

## 🐳 Tags Docker générés

Chaque build génère 3 tags :

1. **`latest`** - Dernière version stable
2. **`x.y.z`** - Version spécifique (ex: `1.0.1`)  
3. **`git-hash`** - Hash du commit git (ex: `a1b2c3d`)

Exemple :
```bash
mamath2000/onvif2mqtt:latest
mamath2000/onvif2mqtt:1.0.1
mamath2000/onvif2mqtt:a1b2c3d
```

## ⚙️ Configuration

### Variables d'environnement

Dans `build-docker-image.sh`, modifiez :
```bash
DOCKER_USER="votre-username-dockerhub"
```

### Prérequis

- ✅ Node.js 18+
- ✅ Docker + docker-compose
- ✅ Git
- ✅ jq (installé automatiquement)
- ✅ Compte Docker Hub (pour publication)

## 📊 Commandes Make disponibles

```bash
make help                 # Aide complète
make setup                # Configuration initiale
make check-env           # Vérifier l'environnement
make build-and-publish   # Build + Publication + Version++
make docker-compose-up   # Build local + Deploy
make version-bump        # Increment version manuellement
```

## 🔧 Dépannage

### Erreur "jq not found"
```bash
sudo apt install jq  # Ubuntu/Debian
```

### Erreur "Not logged to Docker Hub"
```bash
docker login
```

### Erreur "Working directory not clean"
```bash
git status              # Voir les changements
git add . && git commit # Ou commiter les changements
```

### Fichier config.conf manquant
```bash
cp config.conf.example config.conf
# Puis modifiez config.conf
```

## 🎯 Bonnes pratiques

1. **Toujours tester localement** avant publication :
   ```bash
   make docker-compose-up
   ```

2. **Vérifier l'environnement** avant build :
   ```bash
   make check-env
   ```

3. **Working directory propre** avant publication pour traçabilité
4. **Messages de commit clairs** pour le changelog automatique