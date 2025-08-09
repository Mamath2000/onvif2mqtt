#!/bin/bash

echo "=== Test ONVIF2MQTT avec topic cmd unifié ==="

CAMERA_ID="camera_cours0"

echo "1. Vérification des topics d'état..."

echo "📡 LWT (Last Will Testament):"
mosquitto_sub -h localhost -t "onvif2mqtt/$CAMERA_ID/lwt" -C 1 2>/dev/null || echo "Pas encore publié"

echo "📋 Liste des presets:"
mosquitto_sub -h localhost -t "onvif2mqtt/$CAMERA_ID/presetListId" -C 1 2>/dev/null || echo "Pas encore publié"

echo ""
echo "2. Test des nouvelles commandes PTZ via topic 'cmd'..."

echo "⬆️ Test move-up:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-up"
sleep 1

echo "⬅️ Test move-left:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-left"
sleep 1

echo "➡️ Test move-right:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-right"
sleep 1

echo "⬇️ Test move-down:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-down"
sleep 1

echo "🔍 Test zoom-in:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "zoom-in"
sleep 1

echo "🔍 Test zoom-out:"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "zoom-out"
sleep 1

echo "🎯 Test preset 1 (Cours):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/goPreset" -m "1"
sleep 2

echo "🎯 Test preset 2 (Terrasse):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/goPreset" -m "2"

echo ""
echo "3. Test de commandes invalides..."

echo "❌ Test commande invalide (move-invalid):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "move-invalid"
sleep 1

echo "❌ Test format invalide (wrongformat):"
mosquitto_pub -h localhost -t "onvif2mqtt/$CAMERA_ID/cmd" -m "wrongformat"

echo ""
echo "=== Structure ONVIF2MQTT finale ==="
echo "Topics d'état:"
echo "  📡 onvif2mqtt/$CAMERA_ID/lwt"
echo "  📋 onvif2mqtt/$CAMERA_ID/presetListId" 
echo ""
echo "Topics de commande:"
echo "  🎮 onvif2mqtt/$CAMERA_ID/cmd (move-up/down/left/right, zoom-in/out)"
echo "  🎯 onvif2mqtt/$CAMERA_ID/goPreset (preset ID)"
echo ""
echo "=== Test terminé ==="
echo "Consultez les logs de l'application pour voir le traitement des commandes."
