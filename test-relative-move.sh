#!/bin/bash

# Script de test rapide pour PTZ avec relativeMove
CAMERA_ID="camera_cours0"

echo "🧪 Tests PTZ avec relativeMove vs continuousMove"
echo "==============================================="
echo

# Démarrer l'application en arrière-plan
echo "🚀 Démarrage de l'application..."
cd /root/onvif
npm start &
APP_PID=$!

# Attendre que l'application démarre
sleep 5

echo "🧪 Test 1: Mouvement gauche (relativeMove si disponible)"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-left"
sleep 2

echo "🧪 Test 2: Mouvement droite"  
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-right"
sleep 2

echo "🧪 Test 3: Zoom in"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "zoom-in"
sleep 2

echo "🧪 Test 4: Zoom out"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "zoom-out"
sleep 2

echo "✅ Tests terminés"
echo
echo "Vérifiez les logs pour voir si relativeMove ou continuousMove a été utilisé"
echo "Si relativeMove fonctionne, les mouvements s'arrêtent automatiquement"
echo "Si continuousMove est utilisé, un arrêt automatique après 200ms est appliqué"

# Arrêter l'application
kill $APP_PID
wait $APP_PID 2>/dev/null

echo "🔚 Application arrêtée"
