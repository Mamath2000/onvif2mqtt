# onvif2mqtt

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

### Installation classique

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

### Installation avec Docker 🐳

#### Option 1 : Docker simple

1. **Construire l'image Docker** :
```bash
npm run docker:build
# ou directement
docker build -t onvif2mqtt .
```

2. **Configurer les variables d'environnement** :
```bash
cp .env.docker .env
# Modifiez le fichier .env avec vos paramètres
```

3. **Lancer le conteneur** :
```bash
# En premier plan
npm run docker:run

# En arrière-plan
npm run docker:run-detached
```

#### Option 2 : Docker Compose (recommandé)

1. **Configurer les variables d'environnement** :
```bash
cp .env.docker .env
# Modifiez le fichier .env avec vos paramètres MQTT et caméras
```

2. **Lancer avec Docker Compose** :
```bash
npm run docker:compose
# ou directement
docker-compose up -d
```

3. **Voir les logs** :
```bash
npm run docker:compose-logs
# ou
docker-compose logs -f
```

#### Scripts Docker disponibles

```bash
npm run docker:build          # Construire l'image
npm run docker:run             # Lancer en premier plan
npm run docker:run-detached    # Lancer en arrière-plan
npm run docker:stop            # Arrêter le conteneur
npm run docker:logs            # Voir les logs
npm run docker:compose         # Lancer avec docker-compose
npm run docker:compose-logs    # Logs docker-compose
```

#### Configuration spéciale pour Docker

Le conteneur utilise le réseau de l'hôte (`network_mode: host`) pour accéder aux caméras locales. Si vous préférez un réseau isolé, modifiez le fichier `docker-compose.yml` et exposez les ports nécessaires.

**Volumes persistants** :
- `./logs:/app/logs` : Logs de l'application
- Vous pouvez ajouter d'autres volumes selon vos besoins

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

# Configuration PTZ
PTZ_MOVE_DURATION=500     # Durée des mouvements en ms
PTZ_ZOOM_DURATION=300     # Durée du zoom en ms
```

### Configuration PTZ

Les mouvements PTZ sont automatiquement arrêtés après une durée configurable pour éviter les mouvements continus :

- **PTZ_MOVE_DURATION** : Durée des mouvements pan/tilt en millisecondes (défaut: 500ms)
- **PTZ_ZOOM_DURATION** : Durée des mouvements de zoom en millisecondes (défaut: 300ms)

💡 **Ajustez ces valeurs selon vos besoins :**
- Valeurs faibles (200-400ms) : Mouvements précis, petits pas
- Valeurs moyennes (500-800ms) : Équilibre entre précision et rapidité  
- Valeurs élevées (1000ms+) : Mouvements plus amples

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

## Intégration MQTT

### Topics MQTT disponibles

L'application utilise le protocole MQTT pour l'intégration avec Home Assistant et permet le contrôle à distance via des topics standardisés.

#### Structure des topics

Tous les topics suivent le format : `{discovery_prefix}/{component_type}/{device_id}/{action}`

**Exemple avec une caméra "Camera Salon" :**
- Prefix de découverte : `homeassistant`
- ID de la caméra : `camera_salon` (nom en minuscules, espaces remplacés par _)

#### Topics de commande (Command Topics)

| Topic | Type | Description | Payload |
|-------|------|-------------|---------|
| `homeassistant/switch/{camera_id}_power/set` | Commande | Contrôle alimentation caméra | `ON` / `OFF` |

**Exemple :**
```bash
# Allumer la caméra
mosquitto_pub -h localhost -t "homeassistant/switch/camera_salon_power/set" -m "ON"

# Éteindre la caméra  
mosquitto_pub -h localhost -t "homeassistant/switch/camera_salon_power/set" -m "OFF"
```

#### Topics d'état (State Topics)

| Topic | Type | Description | Payload |
|-------|------|-------------|---------|
| `homeassistant/switch/{camera_id}_power/state` | État | État alimentation caméra | `ON` / `OFF` |
| `homeassistant/sensor/{camera_id}_status/state` | Capteur | Statut connexion caméra | `online` / `offline` / `error` |

### Structure ONVIF2MQTT

En plus de l'intégration Home Assistant, l'application propose une structure MQTT dédiée pour un contrôle avancé des caméras ONVIF.

#### Topics ONVIF2MQTT disponibles

| Topic | Type | Description | Payload | Exemple |
|-------|------|-------------|---------|---------|
| `onvif2mqtt/{cam_id}/lwt` | État | Statut en ligne de la caméra | `online` / `offline` | `onvif2mqtt/camera_salon/lwt` |
| `onvif2mqtt/{cam_id}/presetListId` | État | Liste des presets (nom/ID) | JSON object | `{"Cours":1,"Terrasse":2,"Potager":3}` |
| `onvif2mqtt/{cam_id}/cmd` | Commande | Commandes PTZ unifiées | `move-left` / `move-right` / `move-up` / `move-down` / `zoom-in` / `zoom-out` | `onvif2mqtt/camera_salon/cmd` |

### Configuration des amplitudes PTZ

Les amplitudes de déplacement PTZ sont configurables via des variables d'environnement ou l'API REST :

#### Variables d'environnement
```bash
PTZ_MOVE_STEP=0.1          # Amplitude pour les mouvements (0.01-1.0)
PTZ_ZOOM_STEP=0.15         # Amplitude pour le zoom (0.01-1.0)  
PTZ_DEFAULT_SPEED=0.5      # Vitesse par défaut (0.01-1.0)
```

#### API REST
- **GET** `/api/ptz/config` - Récupérer la configuration actuelle
- **POST** `/api/ptz/config` - Modifier la configuration

Exemple de modification :
```bash
curl -X POST http://localhost:3000/api/ptz/config \
  -H "Content-Type: application/json" \
  -d '{"moveStep": 0.2, "zoomStep": 0.1, "defaultSpeed": 0.6}'
```

#### Interface Web
Une section **Configuration PTZ** est disponible dans l'interface web (`http://localhost:3000`) pour ajuster les paramètres en temps réel.
| `onvif2mqtt/{cam_id}/goPreset` | Commande | Aller à un preset | ID du preset | `onvif2mqtt/camera_salon/goPreset` |

#### Exemples d'utilisation ONVIF2MQTT

```bash
# Surveiller le statut d'une caméra
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/lwt"

# Voir la liste des presets disponibles
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/presetListId"

# Contrôler le mouvement PTZ
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "move-up"
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "move-left"
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "move-right"
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "move-down"

# Contrôler le zoom
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "zoom-in"
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/cmd" -m "zoom-out"

# Aller à un preset
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/goPreset" -m "1"
mosquitto_pub -h localhost -t "onvif2mqtt/camera_salon/goPreset" -m "3"
```

#### Intégration avec d'autres systèmes

```python
# Exemple Python - Contrôle PTZ via ONVIF2MQTT
import paho.mqtt.client as mqtt
import json

def on_connect(client, userdata, flags, rc):
    print(f"Connecté avec le code {rc}")
    # S'abonner aux statuts
    client.subscribe("onvif2mqtt/+/lwt")
    client.subscribe("onvif2mqtt/+/presetListId")

def on_message(client, userdata, message):
    topic_parts = message.topic.split('/')
    camera_id = topic_parts[1]
    command = topic_parts[2]
    payload = message.payload.decode()
    
    if command == "lwt":
        print(f"Caméra {camera_id} est {payload}")
    elif command == "presetListId":
        presets = json.loads(payload)
        print(f"Presets disponibles pour {camera_id}:")
        for name, preset_id in presets.items():
            print(f"  - {name}: ID {preset_id}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect("localhost", 1883, 60)

# Exemples de commandes
client.publish("onvif2mqtt/camera_salon/cmd", "move-up")
client.publish("onvif2mqtt/camera_salon/cmd", "zoom-in")
client.publish("onvif2mqtt/camera_salon/goPreset", "1")  # Utiliser l'ID du preset souhaité

client.loop_forever()
```

#### Topics de configuration (Discovery)

L'application publie automatiquement la configuration Home Assistant Discovery :

| Topic | Description |
|-------|-------------|
| `homeassistant/switch/{camera_id}_power/config` | Configuration switch alimentation |
| `homeassistant/camera/{camera_id}_camera/config` | Configuration entité caméra |
| `homeassistant/sensor/{camera_id}_status/config` | Configuration capteur statut |

#### Topic de disponibilité

| Topic | Description | Payload |
|-------|-------------|---------|
| `homeassistant/status` | Statut application | `online` / `offline` |

### Exemples d'utilisation MQTT

#### Surveillance avec mosquitto_sub

```bash
# Surveiller tous les topics ONVIF
mosquitto_sub -h localhost -t "homeassistant/+/camera_+/+"

# Surveiller l'état d'une caméra spécifique
mosquitto_sub -h localhost -t "homeassistant/switch/camera_salon_power/state"

# Surveiller le statut de connexion
mosquitto_sub -h localhost -t "homeassistant/sensor/camera_salon_status/state"
```

#### Contrôle via mosquitto_pub

```bash
# Contrôler l'alimentation
mosquitto_pub -h localhost -t "homeassistant/switch/camera_salon_power/set" -m "ON"
mosquitto_pub -h localhost -t "homeassistant/switch/camera_salon_power/set" -m "OFF"
```

#### Intégration avec d'autres systèmes

```python
# Exemple Python avec paho-mqtt
import paho.mqtt.client as mqtt

def on_message(client, userdata, message):
    topic = message.topic
    payload = message.payload.decode()
    print(f"Caméra état changé: {topic} = {payload}")

client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883, 60)
client.loop_forever()
```

### Configuration MQTT avancée

#### Authentification

```env
MQTT_USERNAME=votre_utilisateur
MQTT_PASSWORD=votre_mot_de_passe
```

#### Topics personnalisés

```env
# Changer le préfixe de découverte
HA_DISCOVERY_PREFIX=mon_domotique

# Résultat: mon_domotique/switch/camera_salon_power/set
```

#### Qualité de service (QoS)

- **QoS 0** : Topics d'état (par défaut)
- **QoS 1** : Topics de commande et configuration
- **Retain** : Activé pour les topics de configuration et de statut

### Limitations actuelles

⚠️ **Fonctionnalités disponibles uniquement via API REST :**
- Contrôles PTZ (Pan/Tilt/Zoom)
- Gestion des presets
- Capture de snapshots à la demande
- Découverte de caméras

💡 **Pour utiliser ces fonctionnalités, utilisez l'API REST ou l'interface web.**

## Integration Home Assistant

### Configuration automatique

L'application publie automatiquement la configuration de découverte MQTT. Les entités apparaîtront dans Home Assistant sous :

- **Entités** → Filtrer par "ONVIF"
- **Appareils** → "ONVIF Controller"

### Utilisation dans Home Assistant

#### Automatisations

```yaml
# Exemple 1: Activer caméra en cas de mouvement
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

# Exemple 2: Notification si caméra hors ligne
automation:
  - alias: "Alerte caméra hors ligne"
    trigger:
      - platform: state
        entity_id: sensor.camera_salon_status
        to: 'offline'
        for: "00:02:00"
    action:
      - service: notify.mobile_app
        data:
          message: "Caméra Salon hors ligne depuis 2 minutes"
          title: "🚨 Problème caméra"

# Exemple 3: Cycle d'alimentation automatique
automation:
  - alias: "Redémarrage caméra planifié"
    trigger:
      - platform: time
        at: "03:00:00"
    action:
      - service: switch.turn_off
        target:
          entity_id: switch.camera_salon_power
      - delay: "00:00:30"
      - service: switch.turn_on
        target:
          entity_id: switch.camera_salon_power
```

#### Scripts pour contrôle PTZ

```yaml
# Script pour aller à un preset via API REST
script:
  camera_preset_cours:
    alias: "Caméra - Vue Cours"
    sequence:
      - service: rest_command.camera_preset
        data:
          camera: "Camera Cours0"
          preset: "1"

# Configuration REST command
rest_command:
  camera_preset:
    url: "http://localhost:3000/api/cameras/{{ camera }}/presets/{{ preset }}"
    method: POST
```

#### Cartes Lovelace

```yaml
# Carte caméra simple avec contrôles
type: vertical-stack
cards:
  - type: picture-entity
    entity: camera.camera_salon_stream
    camera_image: camera.camera_salon_stream
    tap_action:
      action: more-info
  - type: entities
    entities:
      - entity: switch.camera_salon_power
        name: "Alimentation"
        icon: mdi:power
      - entity: sensor.camera_salon_status
        name: "Statut"
        icon: mdi:camera-enhance

# Carte avec boutons de presets personnalisés
type: vertical-stack
cards:
  - type: picture-entity
    entity: camera.camera_cours0_stream
  - type: horizontal-stack
    cards:
      - type: button
        name: "Cours"
        tap_action:
          action: call-service
          service: rest_command.camera_preset
          service_data:
            camera: "Camera Cours0"
            preset: "1"
      - type: button
        name: "Terrasse"
        tap_action:
          action: call-service
          service: rest_command.camera_preset
          service_data:
            camera: "Camera Cours0"
            preset: "2"
```

#### Dashboard complet

```yaml
# Vue dédiée aux caméras ONVIF
title: Caméras ONVIF
path: cameras-onvif
cards:
  - type: grid
    columns: 2
    square: false
    cards:
      - type: vertical-stack
        cards:
          - type: picture-entity
            entity: camera.camera_salon_stream
            name: "Caméra Salon"
          - type: glance
            entities:
              - switch.camera_salon_power
              - sensor.camera_salon_status
      
      - type: vertical-stack  
        cards:
          - type: picture-entity
            entity: camera.camera_cours0_stream
            name: "Caméra Cours"
          - type: glance
            entities:
              - switch.camera_cours0_power
              - sensor.camera_cours0_status
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

1. **Vérifiez les paramètres de connexion dans `.env`**
   ```bash
   # Test de connexion manuelle
   mosquitto_pub -h YOUR_MQTT_HOST -p 1883 -u YOUR_USERNAME -P YOUR_PASSWORD -t "test" -m "hello"
   ```

2. **Vérifiez que le broker MQTT est accessible**
   ```bash
   # Test de connectivité réseau
   telnet YOUR_MQTT_HOST 1883
   ```

3. **Consultez les logs MQTT**
   ```bash
   # Logs de l'application
   tail -f logs/app.log | grep MQTT
   
   # Surveiller tous les messages MQTT
   mosquitto_sub -h YOUR_MQTT_HOST -t "#" -v
   ```

4. **Problèmes d'authentification**
   - Vérifiez les credentials MQTT dans `.env`
   - Testez avec mosquitto_pub/sub
   - Vérifiez les ACL du broker MQTT

### Messages MQTT non reçus

1. **Vérifiez les topics**
   ```bash
   # Lister tous les topics actifs
   mosquitto_sub -h localhost -t "homeassistant/#" -v
   
   # Vérifier un topic spécifique
   mosquitto_sub -h localhost -t "homeassistant/switch/camera_salon_power/state"
   ```

2. **Problèmes de QoS et Retain**
   - Les topics de configuration utilisent retain=true
   - Redémarrez l'application pour republier la découverte

3. **Problèmes Home Assistant Discovery**
   ```bash
   # Forcer la republication de la découverte
   # Redémarrer l'application ou reconnecter une caméra
   curl -X POST http://localhost:3000/api/cameras/Camera%20Salon/connect
   ```

### Caméras non détectées

1. **Vérifiez que les caméras sont sur le même réseau**
   ```bash
   # Test de ping
   ping 192.168.1.100
   
   # Test de port ONVIF
   telnet 192.168.1.100 80
   ```

2. **Testez la connexion manuelle via l'interface web**
   - Ouvrez http://localhost:3000
   - Utilisez la fonction "Découverte automatique"
   - Ajoutez manuellement via l'interface

3. **Vérifiez les credentials ONVIF de la caméra**
   ```bash
   # Test API direct
   curl -X POST http://localhost:3000/api/cameras \
     -H "Content-Type: application/json" \
     -d '{"name":"Test","host":"192.168.1.100","username":"admin","password":"password"}'
   ```

### Problèmes PTZ

1. **Assurez-vous que la caméra supporte ONVIF PTZ**
   - Vérifiez dans l'interface caméra que PTZ est activé
   - Consultez la documentation de votre caméra

2. **Vérifiez les permissions utilisateur de la caméra**
   - L'utilisateur ONVIF doit avoir les droits PTZ
   - Testez avec un compte administrateur

3. **Testez avec des vitesses différentes (0.1 à 1.0)**
   ```bash
   # Test PTZ via API
   curl -X POST http://localhost:3000/api/cameras/Camera%20Salon/ptz/move \
     -H "Content-Type: application/json" \
     -d '{"direction": "up", "speed": 0.5}'
   ```

### Problèmes de presets

1. **Les presets ne s'affichent pas**
   - Vérifiez que la caméra a des presets configurés
   - Consultez les logs : `tail -f logs/app.log | grep preset`

2. **Échec d'activation des presets**
   ```bash
   # Test direct de l'API presets
   curl "http://localhost:3000/api/cameras/Camera%20Cours0/presets"
   
   # Test activation d'un preset
   curl -X POST "http://localhost:3000/api/cameras/Camera%20Cours0/presets/1"
   ```

### Performance et stabilité

1. **Application qui s'arrête**
   ```bash
   # Vérifier les erreurs système
   journalctl -u your-app-service -f
   
   # Surveiller l'utilisation mémoire
   top -p $(pgrep -f "node src/app.js")
   ```

2. **Connexions ONVIF instables**
   - Réduisez l'intervalle de surveillance dans la configuration
   - Vérifiez la stabilité réseau vers les caméras
   - Utilisez un réseau dédié pour les caméras si possible

## Logs

Les logs sont stockés dans le dossier `logs/` :
- `app.log` : Logs généraux
- `error.log` : Erreurs uniquement

Niveaux de log configurables via `LOG_LEVEL` : error, warn, info, debug

## Licence

MIT License - Voir le fichier LICENSE pour plus de détails.
