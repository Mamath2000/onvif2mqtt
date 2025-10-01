# 🚀 Système de Versioning et Build Automatique

## 📋 Vue d'ensemble

Le projet onvif2mqtt dispose maintenant d'un système complet de versioning automatique et de publication Docker, inspiré des meilleures pratiques DevOps.

## ✨ Fonctionnalités

- ✅ **Incrémentation automatique** de version à chaque publication
- ✅ **Publication Docker Hub** avec tags multiples
- ✅ **Métadonnées git** intégrées dans les images Docker
- ✅ **Commit automatique** des versions
- ✅ **Vérifications de sécurité** avant publication
- ✅ **Scripts Makefile** pour faciliter l'utilisation

## 🚀 Quick Start

### 1. Configuration initiale
```bash
make setup          # Configure l'environnement
# Modifiez config.conf avec vos paramètres
```

### 2. Développement local
```bash
make start          # Lancer l'application
make dev            # Mode développement avec redémarrage auto
```

### 3. Test local avec Docker
```bash
make docker-compose-up    # Build + Deploy local avec Docker Compose
```

### 4. Publication finale
```bash
git add .
git commit -m "feat: nouvelle fonctionnalité"
make docker-build-push    # Build + Publication + Version++ + Commit
git push origin main      # Push des changements
```

## 🔄 Workflow de développement recommandé

### Développement d'une fonctionnalité
```bash
# 1. Créer une branche feature
git checkout -b feature/ma-nouvelle-fonctionnalite

# 2. Développer et tester localement
make dev                  # Tests en développement
make docker-compose-up    # Tests avec Docker

# 3. Commit des changements
git add .
git commit -m "feat: ajouter support pour nouvelles caméras"

# 4. Merge vers main
git checkout main
git merge feature/ma-nouvelle-fonctionnalite
```

### Publication
```bash
# 5. Publication avec versioning automatique
make docker-build-push
# → Version 1.0.1 → 1.0.2 automatiquement
# → Images Docker publiées sur Docker Hub
# → Commit de version automatique

# 6. Push final
git push origin main
```

## 🐳 Images Docker générées

Chaque publication crée 3 tags :

| Tag | Description | Exemple |
|-----|-------------|---------|
| `latest` | Dernière version stable | `mamath2000/onvif2mqtt:latest` |
| `version` | Version sémantique | `mamath2000/onvif2mqtt:1.0.2` |
| `git-hash` | Hash du commit git | `mamath2000/onvif2mqtt:a1b2c3d` |

## 📦 Structure des versions

Le système utilise le **versioning sémantique** :

```
MAJOR.MINOR.PATCH
1.0.2
```

- **PATCH** : Incrémentation automatique à chaque `make docker-build-push`
- **MINOR** : Incrémentation manuelle pour nouvelles fonctionnalités
- **MAJOR** : Incrémentation manuelle pour changements incompatibles

### Incrémenter manuellement
```bash
# Patch (1.0.2 → 1.0.3)
make version-bump

# Minor (1.0.3 → 1.1.0)
# Éditez package.json manuellement

# Major (1.1.0 → 2.0.0)  
# Éditez package.json manuellement
```

## 🛠️ Commandes disponibles

### Développement
```bash
make help              # Aide complète avec menu coloré
make setup             # Configuration initiale automatique
make dev               # Mode développement avec hot-reload
make start             # Mode production
make check-env         # Vérifier la configuration
```

### Docker local
```bash
make docker-build         # Build image locale
make docker-compose-up    # Build + Deploy avec Docker Compose
make docker-run           # Lancer conteneur simple
make docker-stop          # Arrêter conteneur
make docker-logs          # Voir les logs
```

### Publication et versioning
```bash
make docker-build-push    # Publication complète + version++
make version-bump         # Incrémenter version manuellement
```

### Service système
```bash
make service-install      # Installer service systemd
make service-start        # Démarrer service
make service-stop         # Arrêter service
make service-logs         # Logs du service
```

## 🔧 Configuration

### Variables à modifier

Dans `scripts/build-docker-image.sh` :
```bash
DOCKER_USER="votre-username-dockerhub"  # Votre nom d'utilisateur Docker Hub
```

### Prérequis système
- Node.js 18+
- Docker + docker-compose  
- Git
- jq (installé automatiquement)
- Compte Docker Hub

## 📁 Structure des fichiers

```
onvif2mqtt/
├── scripts/
│   ├── build-docker-image.sh    # Publication Docker Hub + version++
│   ├── build-and-up.sh         # Build local + Docker Compose
│   ├── setup-env.sh            # Configuration environnement
│   └── README.md               # Documentation scripts
├── Makefile                    # Commandes make améliorées
├── Dockerfile                  # Image Docker avec métadonnées
├── docker-compose.yml          # Configuration Docker Compose
├── package.json               # Version et dépendances
└── config.conf               # Configuration application
```

## 🎯 Bonnes pratiques

### Avant publication
1. ✅ **Tester localement** : `make docker-compose-up`
2. ✅ **Working directory propre** : commit tous les changements
3. ✅ **Vérifier config** : `make check-env`
4. ✅ **Connecté Docker Hub** : `docker login`

### Messages de commit
Utilisez les conventions pour un changelog automatique :
```bash
feat: nouvelle fonctionnalité
fix: correction de bug  
docs: mise à jour documentation
refactor: refactoring code
test: ajout de tests
```

### Gestion des erreurs
```bash
# Erreur "Not logged to Docker Hub"
docker login

# Erreur "Working directory not clean"  
git status && git add . && git commit -m "fix: ..."

# Erreur "jq not found"
sudo apt install jq

# Fichier config.conf manquant
make setup
```

## 🔄 Intégration CI/CD

Ce système peut être intégré dans une pipeline CI/CD :

```yaml
# .github/workflows/publish.yml
name: Build and Publish
on:
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup environment
        run: make setup
      - name: Login Docker Hub
        run: echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
      - name: Build and publish
        run: make docker-build-push
```

## 📊 Monitoring et logs

```bash
# Logs application locale
tail -f logs/app.log

# Logs Docker Compose
docker-compose logs -f

# Logs service systemd
make service-logs

# Statut conteneurs
docker-compose ps
```

## 🆘 Support

- 📖 Documentation complète : `make help`
- 🐛 Issues : [GitHub Issues](https://github.com/Mamath2000/onvif2mqtt/issues)
- 💬 Discussions : [GitHub Discussions](https://github.com/Mamath2000/onvif2mqtt/discussions)