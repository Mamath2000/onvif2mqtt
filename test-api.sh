#!/bin/bash

echo "=== Test de l'application ONVIF MQTT Controller ==="
echo

# Vérifier si l'application fonctionne
echo "1. Test de l'état de santé de l'application..."
if curl -s -f http://localhost:3000/health > /dev/null; then
    echo "✅ Application en ligne"
    curl -s http://localhost:3000/health | jq .
else
    echo "❌ Application hors ligne"
    exit 1
fi

echo
echo "2. Test de la liste des caméras..."
curl -s http://localhost:3000/api/cameras | jq .

echo
echo "3. Test de l'API des presets..."
curl -s "http://localhost:3000/api/cameras/Camera%20Cours0/presets" | jq .

echo
echo "4. Test d'un preset (token 1)..."
curl -s -X POST "http://localhost:3000/api/cameras/Camera%20Cours0/presets/1" | jq .

echo
echo "=== Tests terminés ==="
