#!/bin/bash

echo "=== Test de l'application ONVIF ==="

echo "1. Vérification que l'application fonctionne..."
if curl -s http://localhost:3000/ > /dev/null; then
    echo "✅ Application accessible sur localhost:3000"
else
    echo "❌ Application non accessible"
    exit 1
fi

echo "2. Test de l'API des caméras..."
cameras=$(curl -s http://localhost:3000/api/cameras)
echo "Caméras détectées: $(echo $cameras | jq -r 'keys[]')"

echo "3. Test de l'API des presets..."
presets=$(curl -s "http://localhost:3000/api/cameras/Camera%20Cours0/presets")
preset_count=$(echo $presets | jq '. | length')
echo "Nombre de presets trouvés: $preset_count"

if [ "$preset_count" -gt 0 ]; then
    echo "✅ Presets disponibles:"
    echo "$presets" | jq -r '.[] | "  - \(.name) (token: \(.token))"'
else
    echo "❌ Aucun preset trouvé"
fi

echo "4. Test de l'interface web..."
echo "Interface web disponible sur: http://localhost:3000"
echo "Vous pouvez maintenant vérifier que les presets s'affichent correctement dans l'interface web."

echo "=== Fin du test ==="
