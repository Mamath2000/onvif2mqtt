#!/bin/bash

# Script de test pour la configuration PTZ
CAMERA_ID="camera_cours0"

echo "🔧 Test de configuration des amplitudes PTZ"
echo "=============================================="
echo

# Fonction pour afficher la config actuelle
show_config() {
    echo "📋 Configuration PTZ actuelle:"
    curl -s http://localhost:3000/api/ptz/config | jq '.'
    echo
}

# Fonction pour tester un mouvement
test_movement() {
    local direction=$1
    echo "➡️ Test mouvement $direction avec la config actuelle:"
    mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-$direction"
    sleep 2
}

# Afficher la config initiale
show_config

# Test avec config par défaut
echo "🧪 Test avec configuration par défaut (moveStep=0.1):"
test_movement "left"

# Modifier la configuration pour des mouvements plus amples
echo "⚙️ Modification de la configuration PTZ (moveStep=0.3, zoomStep=0.25):"
curl -s -X POST http://localhost:3000/api/ptz/config \
    -H "Content-Type: application/json" \
    -d '{"moveStep": 0.3, "zoomStep": 0.25, "defaultSpeed": 0.6}' | jq '.'
echo

# Afficher la nouvelle config
show_config

# Test avec nouvelle config
echo "🧪 Test avec configuration modifiée (moveStep=0.3):"
test_movement "right"

echo "🧪 Test zoom avec nouvelle config (zoomStep=0.25):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "zoom-in"
sleep 2

# Remettre une config plus conservative
echo "⚙️ Retour à une configuration conservative:"
curl -s -X POST http://localhost:3000/api/ptz/config \
    -H "Content-Type: application/json" \
    -d '{"moveStep": 0.15, "zoomStep": 0.1, "defaultSpeed": 0.4}' | jq '.'
echo

# Afficher la config finale
show_config

echo "✅ Tests de configuration PTZ terminés"
echo
echo "💡 Vous pouvez maintenant:"
echo "   - Consulter la config: curl http://localhost:3000/api/ptz/config"
echo "   - Modifier la config: curl -X POST http://localhost:3000/api/ptz/config -H 'Content-Type: application/json' -d '{\"moveStep\": 0.2}'"
echo "   - Les valeurs doivent être entre 0.01 et 1.0"
