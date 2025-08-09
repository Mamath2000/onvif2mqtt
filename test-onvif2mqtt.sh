#!/bin/bash

echo "=== Test de la structure ONVIF2MQTT ==="

CAMERA_ID="camera_cours0"

echo "1. Test des topics d'état..."

echo "📡 LWT (Last Will Testament):"
mosquitto_sub -h localhost -t "onvif2mqtt/$CAMERA_ID/lwt" -C 1 2>/dev/null || echo "Pas encore publié"

echo "📋 Liste des presets:"
mosquitto_sub -h localhost -t "onvif2mqtt/$CAMERA_ID/presetListId" -C 1 2>/dev/null || echo "Pas encore publié"

echo ""
echo "2. Test des commandes PTZ..."

echo "⬆️ Test mouvement UP:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/move" -m "up"
sleep 1

echo "⬅️ Test mouvement LEFT:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/move" -m "left"
sleep 1

echo "🔍 Test zoom IN:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/zoom" -m "+"
sleep 1

echo "🔍 Test zoom OUT:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/zoom" -m "-"
sleep 1

echo "🎯 Test preset 1 (Cours):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/goPreset" -m "1"
sleep 2

echo "🎯 Test preset 2 (Terrasse):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/goPreset" -m "2"

echo ""
echo "3. Surveillance en temps réel..."
echo "Surveillance des topics onvif2mqtt pendant 10 secondes:"
echo "Appuyez sur Ctrl+C pour arrêter plus tôt."

timeout 10s mosquitto_sub -h localhost -t "onvif2mqtt/$CAMERA_ID/+" -v 2>/dev/null || echo "Fin de la surveillance"

echo ""
echo "=== Test terminé ==="
echo "Les commandes PTZ ont été envoyées. Vérifiez les logs de l'application pour voir les résultats."
