# ONVIF MQTT Controller

Application Node.js pour contrôler des caméras ONVIF et les intégrer à Home Assistant via MQTT.

## Fonctionnalités

- 🎥 **Contrôle des caméras ONVIF** : Connexion, déconnexion, statuts
- 🔄 **Intégration MQTT** : Communication avec Home Assistant
- 🎛️ **Contrôles PTZ** : Pan, Tilt, Zoom pour les caméras compatibles
- 📸 **Snapshots et Streams** : Capture d'images et flux vidéo
- 🔍 **Découverte automatique** : Recherche des caméras sur le réseau
- 🌐 **Interface web** : Interface de contrôle simple
- 🏠 **Home Assistant** : Découverte automatique des entités

## Installation

1. Clonez ou téléchargez le projet
2. Installez les dépendances :
```bash
npm install
```

3. Copiez le fichier de configuration :
```bash
cp .env.example .env
```

4. Modifiez le fichier `.env` avec vos paramètres

## Configuration

### Variables d'environnement principales

```env
# Configuration MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=votre_utilisateur
MQTT_PASSWORD=votre_mot_de_passe

# Configuration Home Assistant
HA_DISCOVERY_PREFIX=homeassistant
HA_DEVICE_NAME=ONVIF Controller

# Configuration des caméras
CAMERA_1_NAME=Camera Salon
CAMERA_1_HOST=192.168.1.100
CAMERA_1_USERNAME=admin
CAMERA_1_PASSWORD=password

CAMERA_2_NAME=Camera Jardin
CAMERA_2_HOST=192.168.1.101
CAMERA_2_USERNAME=admin
CAMERA_2_PASSWORD=password
```

### Configuration MQTT pour Home Assistant

1. Assurez-vous que MQTT est configuré dans Home Assistant
2. L'application créera automatiquement les entités suivantes pour chaque caméra :
   - **Switch** : `switch.camera_xxx_power` - Contrôle marche/arrêt
   - **Camera** : `camera.camera_xxx_stream` - Flux vidéo
   - **Sensor** : `sensor.camera_xxx_status` - Statut de la caméra

## Utilisation

### Démarrage de l'application

```bash
# Mode production
npm start

# Mode développement (avec redémarrage automatique)
npm run dev
```

### Interface web

Une fois démarrée, l'application est accessible via :
- **Interface web** : http://localhost:3000
- **API REST** : http://localhost:3000/api/

### API REST

#### Caméras

- `GET /api/cameras` - Liste toutes les caméras
- `GET /api/cameras/:name` - Informations d'une caméra
- `POST /api/cameras` - Ajouter une caméra
- `DELETE /api/cameras/:name` - Supprimer une caméra
- `POST /api/cameras/:name/connect` - Reconnecter une caméra

#### Images et flux

- `GET /api/cameras/:name/snapshot` - Capturer une image
- `GET /api/cameras/:name/stream` - Obtenir l'URI du flux

#### Contrôles PTZ

- `POST /api/cameras/:name/ptz/move` - Déplacer la caméra
- `POST /api/cameras/:name/ptz/stop` - Arrêter le mouvement
- `GET /api/cameras/:name/presets` - Liste des presets
- `POST /api/cameras/:name/presets/:preset` - Aller à un preset

#### Découverte

- `POST /api/discover` - Rechercher des caméras sur le réseau

### Exemples d'utilisation

#### Ajouter une caméra via API

```bash
curl -X POST http://localhost:3000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Camera Bureau",
    "host": "192.168.1.102",
    "username": "admin",
    "password": "password123"
  }'
```

#### Contrôler le PTZ

```bash
# Déplacer vers le haut
curl -X POST http://localhost:3000/api/cameras/Camera%20Bureau/ptz/move \
  -H "Content-Type: application/json" \
  -d '{"direction": "up", "speed": 0.5}'

# Arrêter le mouvement
curl -X POST http://localhost:3000/api/cameras/Camera%20Bureau/ptz/stop
```

#### Capturer une image

```bash
curl http://localhost:3000/api/cameras/Camera%20Bureau/snapshot \
  --output snapshot.jpg
```

## Integration Home Assistant

### Configuration automatique

L'application publie automatiquement la configuration de découverte MQTT. Les entités apparaîtront dans Home Assistant sous :

- **Entités** → Filtrer par "ONVIF"
- **Appareils** → "ONVIF Controller"

### Utilisation dans Home Assistant

#### Automatisations

```yaml
# Exemple d'automatisation
automation:
  - alias: "Activer caméra en cas de mouvement"
    trigger:
      - platform: state
        entity_id: binary_sensor.detecteur_mouvement
        to: 'on'
    action:
      - service: switch.turn_on
        target:
          entity_id: switch.camera_salon_power
```

#### Cartes Lovelace

```yaml
# Carte caméra simple
type: picture-entity
entity: camera.camera_salon_stream
camera_image: camera.camera_salon_stream

# Carte avec contrôles
type: vertical-stack
cards:
  - type: picture-entity
    entity: camera.camera_salon_stream
  - type: entities
    entities:
      - switch.camera_salon_power
      - sensor.camera_salon_status
```

## Structure du projet

```
src/
├── app.js              # Application principale
├── utils/
│   └── logger.js       # Gestion des logs
├── mqtt/
│   └── mqttManager.js  # Gestionnaire MQTT
├── onvif/
│   ├── onvifCamera.js  # Classe caméra ONVIF
│   └── onvifManager.js # Gestionnaire des caméras
└── http/
    └── httpServer.js   # Serveur HTTP/API
```

## Dépannage

### Problèmes de connexion MQTT

1. Vérifiez les paramètres de connexion dans `.env`
2. Assurez-vous que le broker MQTT est accessible
3. Consultez les logs : `tail -f logs/app.log`

### Caméras non détectées

1. Vérifiez que les caméras sont sur le même réseau
2. Testez la connexion manuelle via l'interface web
3. Vérifiez les credentials ONVIF de la caméra

### Problèmes PTZ

1. Assurez-vous que la caméra supporte ONVIF PTZ
2. Vérifiez les permissions utilisateur de la caméra
3. Testez avec des vitesses différentes (0.1 à 1.0)

## Logs

Les logs sont stockés dans le dossier `logs/` :
- `app.log` : Logs généraux
- `error.log` : Erreurs uniquement

Niveaux de log configurables via `LOG_LEVEL` : error, warn, info, debug

## Licence

MIT License - Voir le fichier LICENSE pour plus de détails.
