#!/bin/bash

echo "=== Exemple d'utilisation ONVIF2MQTT avec presets ==="

# Récupérer la liste des presets
echo "📋 Récupération de la liste des presets disponibles..."
PRESET_LIST=$(mosquitto_sub -h localhost -t "onvif2mqtt/camera_cours0/presetListId" -C 1 2>/dev/null)

if [ "$PRESET_LIST" != "" ]; then
    echo "✅ Presets disponibles:"
    echo "$PRESET_LIST" | jq -r 'to_entries[] | "  - \(.key): ID \(.value)"'
    
    echo ""
    echo "💡 Exemple d'utilisation:"
    echo "Pour aller au preset 'Terrasse', utiliser:"
    echo "mosquitto_pub -h localhost -t 'onvif2mqtt/camera_cours0/goPreset' -m '2'"
    
    echo ""
    echo "🎯 Test automatique - Cycle à travers quelques presets:"
    
    # Aller au preset Cours (ID: 1)
    echo "📍 Aller au preset 'Cours' (ID: 1)..."
    mosquitto_pub -h localhost -t "onvif2mqtt/camera_cours0/goPreset" -m "1"
    sleep 3
    
    # Aller au preset Terrasse (ID: 2) 
    echo "📍 Aller au preset 'Terrasse' (ID: 2)..."
    mosquitto_pub -h localhost -t "onvif2mqtt/camera_cours0/goPreset" -m "2"
    sleep 3
    
    # Aller au preset Potager (ID: 3)
    echo "📍 Aller au preset 'Potager' (ID: 3)..."
    mosquitto_pub -h localhost -t "onvif2mqtt/camera_cours0/goPreset" -m "3"
    
    echo "✅ Tests terminés!"
    
else
    echo "❌ Impossible de récupérer la liste des presets"
    echo "Assurez-vous que l'application ONVIF est démarrée et que les presets sont publiés."
fi

echo ""
echo "📊 Structure ONVIF2MQTT complète:"
echo "  🔗 LWT: $(mosquitto_sub -h localhost -t "onvif2mqtt/camera_cours0/lwt" -C 1 2>/dev/null || echo 'Non disponible')"
echo "  📋 Presets: Disponibles en format clé/valeur"
echo "  🎮 Commandes: move, zoom, goPreset"
