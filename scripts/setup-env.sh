#!/bin/bash

# Script de préparation de l'environnement pour onvif2mqtt
# Installe les dépendances manquantes et configure l'environnement

set -e

echo "🔧 Préparation de l'environnement onvif2mqtt"

# Vérifier et installer jq si nécessaire
if ! command -v jq >/dev/null 2>&1; then
    echo "📦 Installation de jq..."
    if command -v apt >/dev/null 2>&1; then
        sudo apt update && sudo apt install -y jq
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y jq
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S jq
    else
        echo "❌ Impossible d'installer jq automatiquement"
        echo "💡 Installez jq manuellement selon votre distribution"
        exit 1
    fi
    echo "✅ jq installé avec succès"
else
    echo "✅ jq est déjà installé"
fi

# Créer le fichier config.conf s'il n'existe pas
if [ ! -f "config.conf" ]; then
    echo "📝 Création du fichier config.conf..."
    cp config.conf.example config.conf
    echo "✅ Fichier config.conf créé"
    echo "💡 N'oubliez pas de modifier config.conf avec vos paramètres"
else
    echo "✅ Fichier config.conf existe déjà"
fi

# Créer le répertoire logs s'il n'existe pas
if [ ! -d "logs" ]; then
    echo "📁 Création du répertoire logs..."
    mkdir -p logs
    echo "✅ Répertoire logs créé"
else
    echo "✅ Répertoire logs existe déjà"
fi

# Installer les dépendances npm
if [ -f "package.json" ]; then
    echo "📦 Installation des dépendances npm..."
    npm install
    echo "✅ Dépendances npm installées"
fi

# Vérifier Docker
if ! command -v docker >/dev/null 2>&1; then
    echo "⚠️ Docker n'est pas installé"
    echo "💡 Installez Docker: https://docs.docker.com/get-docker/"
else
    echo "✅ Docker est disponible"
fi

# Vérifier docker-compose
if ! command -v docker-compose >/dev/null 2>&1; then
    echo "⚠️ docker-compose n'est pas installé"
    echo "💡 Installez docker-compose: https://docs.docker.com/compose/install/"
else
    echo "✅ docker-compose est disponible"
fi

echo ""
echo "🎉 Environnement prêt !"
echo ""
echo "📋 Prochaines étapes :"
echo "1. Modifiez config.conf avec vos paramètres MQTT et caméras"
echo "2. Lancez l'application avec: make start"
echo "3. Ou utilisez Docker avec: make docker-compose-up"
echo ""
echo "💡 Commandes utiles :"
echo "  make help                 # Voir toutes les commandes disponibles"
echo "  make check-env           # Vérifier la configuration"
echo "  make build-and-publish   # Build et publier sur Docker Hub"