#!/bin/bash

# Script de build avec ref git et déploiement Docker Compose pour onvif2mqtt
# Injecte la référence git et lance docker-compose

set -e

echo "🚀 Build et déploiement onvif2mqtt avec Docker Compose"

# Vérifications des prérequis
command -v git >/dev/null 2>&1 || { echo "❌ Git est requis mais non installé."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker est requis mais non installé."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ docker-compose est requis mais non installé."; exit 1; }

# Vérifier que le fichier docker-compose.yml existe
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Fichier docker-compose.yml non trouvé dans le répertoire courant"
    exit 1
fi

# Vérifier que le fichier config.conf existe
if [ ! -f "config.conf" ]; then
    echo "❌ Fichier config.conf non trouvé"
    echo "💡 Créez le fichier de configuration:"
    echo "   cp config.conf.example config.conf"
    echo "   # Puis modifiez config.conf avec vos paramètres"
    exit 1
fi

# Récupère le hash court du commit git
GIT_REF=$(git rev-parse --short HEAD)
echo "🔀 Référence git utilisée pour le build: $GIT_REF"

# Récupère la version du package.json
if [ -f "package.json" ]; then
    VERSION=$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
    echo "📦 Version application: $VERSION"
fi

# Build avec la ref git injectée
echo "🔨 Construction de l'image Docker avec la ref git..."
export GIT_REF=$GIT_REF
export BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Arrêter les conteneurs existants s'ils tournent
echo "🛑 Arrêt des conteneurs existants..."
docker-compose down 2>/dev/null || true

# Build de l'image
docker-compose build \
    --build-arg GIT_REF=$GIT_REF \
    --build-arg BUILD_DATE="$BUILD_DATE"

echo "✅ Build terminé avec succès"

# Lancement de docker-compose up
echo "🚀 Lancement de docker-compose up -d..."
docker-compose up -d

# Attendre quelques secondes pour que les conteneurs démarrent
echo "⏳ Attente du démarrage des conteneurs..."
sleep 5

# Vérifier le statut des conteneurs
echo "📊 Statut des conteneurs:"
docker-compose ps

# Afficher les logs récents
echo ""
echo "📝 Logs récents (10 dernières lignes):"
docker-compose logs --tail=10

echo ""
echo "✅ Déploiement terminé avec succès!"
echo "🏷️  Version déployée: $VERSION (git: $GIT_REF)"
echo "🕐 Date de build: $BUILD_DATE"
echo ""
echo "📋 Commandes utiles:"
echo "   docker-compose logs -f           # Voir les logs en temps réel"
echo "   docker-compose ps                # Statut des conteneurs"
echo "   docker-compose down              # Arrêter l'application"
echo "   docker-compose restart           # Redémarrer l'application"
echo ""
echo "🔧 Configuration:"
echo "   Fichier: config.conf"
echo "   Logs: ./logs/"