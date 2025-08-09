#!/bin/bash

echo "=== Forcer la publication des presets (format clé/valeur) ==="

# Récupérer les presets via l'API  
echo "📋 Récupération des presets via API..."
PRESETS=$(curl -s "http://localhost:3000/api/cameras/Camera%20Cours0/presets")

if [ "$?" -eq 0 ] && [ "$PRESETS" != "" ]; then
    echo "✅ Presets récupérés: $(echo $PRESETS | jq length) presets"
    
    # Convertir en format clé/valeur
    echo "🔄 Conversion en format clé/valeur..."
    PRESET_MAP=$(echo $PRESETS | jq -r 'reduce .[] as $item ({}; .[$item.name] = $item.token)')
    echo "📝 Format clé/valeur: $PRESET_MAP"
    
    # Publier manuellement sur le topic MQTT
    echo "📡 Publication sur onvif2mqtt/camera_cours0/presetListId..."
    echo "$PRESET_MAP" | mosquitto_pub -h localhost -t "onvif2mqtt/camera_cours0/presetListId" -r -l
    
    echo "✅ Liste des presets publiée!"
    
    # Vérification
    echo "🔍 Vérification - Topic publié:"
    mosquitto_sub -h localhost -t "onvif2mqtt/camera_cours0/presetListId" -C 1
    
    echo ""
    echo "📖 Format utilisable: chaque clé est le nom, chaque valeur est l'ID à utiliser pour goPreset"
    
else
    echo "❌ Impossible de récupérer les presets via l'API"
fi

echo "=== Fin du script ==="
