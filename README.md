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
- 📡 **Événements ONVIF** : Détection de mouvement, sabotage, etc.

## Installation

### Installation classique

1. Clonez ou téléchargez le projet
2. Installez les dépendances :
```bash
npm install
```

3. Copiez le fichier de configuration :
```bash
cp config.conf.example config.conf
```

4. Modifiez le fichier `config.conf` avec vos paramètres

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
cp config.conf.example config.conf
# Modifiez le fichier config.conf avec vos paramètres
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
cp config.conf.example config.conf
# Modifiez le fichier config.conf avec vos paramètres MQTT et caméras
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
- `./config.conf:/app/config.conf:ro` : Fichier de configuration (lecture seule)

**Important** : Assurez-vous que le fichier `config.conf` existe avant de lancer Docker.

## Configuration

L'application utilise maintenant un fichier de configuration `config.conf` au format INI pour une meilleure organisation et lisibilité.

### Format du fichier config.conf

Le fichier de configuration est organisé en sections avec une syntaxe simple :

```ini
[section]
key = value

# Les commentaires commencent par #
[camera.nom_camera]
name = Nom affiché
host = 192.168.1.100
```

### Sections principales

```ini
[mqtt]
broker_url = mqtt://192.168.1.190:1883
username = votre_utilisateur
password = votre_mot_de_passe
client_id = onvif-gateway

[homeassistant]
discovery_enabled = true
discovery_prefix = homeassistant
device_name = ONVIF Gateway
base_topic = onvif2mqtt

[ptz]
move_step = 0.1
zoom_step = 0.15
default_speed = 0.5

[events]
# Activer la surveillance des événements ONVIF (détection de mouvement, etc.)
enabled = true
# Intervalle de polling des événements (en millisecondes)
pull_interval = 1000
# Timeout pour le pull des messages (en millisecondes)
pull_timeout = 60000
# Liste des types d'événements à surveiller (séparés par des virgules)
# Types disponibles: motion, tamper, field_detection, line_crossing, digital_input, audio_detection, face_detection, people_counting
# Utilisez "all" ou laissez vide pour surveiller tous les types
event_types = motion, people, vehicle, pet

# Configuration des caméras
[camera.salon]
name = Caméra Salon
host = 192.168.1.100
port = 2020
username = admin
password = password123
event_types = motion, tamper

[camera.jardin]
name = Caméra Jardin
host = 192.168.1.101
port = 2020
username = admin
password = password456
event_types = motion
```

### Configuration des caméras

Chaque caméra est définie dans une section `[camera.identifiant]` :
- **identifiant** : Nom unique pour la caméra (utilisé en interne)
- **name** : Nom affiché dans Home Assistant
- **host** : Adresse IP de la caméra
- **port** : Port ONVIF (généralement 2020, 80 ou 8080)
- **username/password** : Identifiants de connexion

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

L'application communique uniquement via **MQTT** avec Home Assistant. Aucune interface web n'est fournie.

## Utilisation via MQTT

### Topics de commande

L'application écoute les commandes MQTT sur les topics suivants :

**Format des topics de commande :**
- `{base_topic}/camera/{camera_id}/ptz/{command}`
- `{base_topic}/camera/{camera_id}/preset/{preset_id}`

**Exemples avec base_topic = "onvif2mqtt" :**
- `onvif2mqtt/camera/camera_salon/ptz/move`
- `onvif2mqtt/camera/camera_salon/ptz/stop`
- `onvif2mqtt/camera/camera_salon/preset/1`

### Payload des commandes PTZ

#### Mouvement PTZ
```json
{
  "direction": "up|down|left|right",
  "speed": 0.5
}
```

#### Zoom
```json
{
  "direction": "in|out", 
  "speed": 0.5
}
```

#### Arrêt
```json
{
  "command": "stop"
}
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
| `onvif2mqtt/{cam_id}/goPreset` | Commande | Aller à un preset | ID du preset | `onvif2mqtt/camera_salon/goPreset` |
| `onvif2mqtt/{cam_id}/event/{event_type}` | Événement | État d'un événement | `ON` / `OFF` | `onvif2mqtt/camera_salon/event/motion` |
| `onvif2mqtt/{cam_id}/event/{event_type}/json` | Événement | Données complètes d'événement | JSON object | `onvif2mqtt/camera_salon/event/motion/json` |

### Événements ONVIF supportés

L'application surveille et publie les événements ONVIF configurés. Vous pouvez sélectionner les types d'événements à surveiller dans la configuration.

#### Configuration des événements à surveiller

Dans le fichier `config.conf`, section `[events]` :
```ini
[events]
enabled = true
pull_interval = 1000
pull_timeout = 60000
# Liste des types d'événements à surveiller (séparés par des virgules)
event_types = motion, people, vehicle, pet
```

**Types d'événements disponibles :**

**Événements standard :**
- **motion** : Détection de mouvement (MotionAlarm, CellMotionDetector, MotionRegionDetector)
- **tamper** : Détection de sabotage ou altération de la caméra
- **field_detection** : Détection d'objets dans un champ défini
- **line_crossing** : Franchissement d'une ligne virtuelle
- **digital_input** : Changement d'état d'une entrée digitale
- **audio_detection** : Détection de son/bruit
- **face_detection** : Détection de visage
- **people_counting** : Comptage de personnes

**Événements IA (TP-Link TAPO C120, C540, etc.) :**
- **people** : Détection de personne avec IA
- **vehicle** : Détection de véhicule
- **pet** : Détection d'animal/animal domestique

**Options de configuration :**
- Listez les types séparés par des virgules : `event_types = motion, people, vehicle`
- Utilisez `all` pour tous les types : `event_types = all`
- Laissez vide pour tous les types : `event_types = `

**Note :** Seuls les événements supportés par vos caméras seront effectivement détectés. Les événements non supportés seront simplement ignorés.

**Pour les caméras TP-Link :** Les événements IA (people, vehicle, pet) sont regroupés dans un événement générique `TPSmartEventDetector` qui est automatiquement décomposé en événements individuels.

#### Format des événements publiés

**Topic simple :**
```
onvif2mqtt/camera_salon/event/motion
Payload: ON ou OFF
```

**Topic JSON (données complètes) :**
```
onvif2mqtt/camera_salon/event/motion/json
Payload: {
  "camera": "Caméra Salon",
  "eventType": "motion",
  "state": "ON",
  "data": {
    "State": "true",
    "IsMotion": "true"
  },
  "timestamp": "2025-11-04T10:23:45.123Z"
}
```

### Configuration des amplitudes PTZ

Les amplitudes de déplacement PTZ sont configurables dans le fichier `config.conf` :

#### Configuration dans config.conf
```ini
[ptz]
move_step = 0.1          # Amplitude pour les mouvements (0.01-1.0)
zoom_step = 0.15         # Amplitude pour le zoom (0.01-1.0)  
default_speed = 0.5      # Vitesse par défaut (0.01-1.0)
```

**Redémarrage requis** : Les modifications de configuration nécessitent un redémarrage de l'application.
| `onvif2mqtt/{cam_id}/goPreset` | Commande | Aller à un preset | ID du preset | `onvif2mqtt/camera_salon/goPreset` |

#### Exemples d'utilisation ONVIF2MQTT

```bash
# Surveiller le statut d'une caméra
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/lwt"

# Voir la liste des presets disponibles
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/presetListId"

# Surveiller les événements de mouvement
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/event/motion"

# Surveiller tous les événements d'une caméra (avec détails JSON)
mosquitto_sub -h localhost -t "onvif2mqtt/camera_salon/event/+/json"

# Surveiller tous les événements de toutes les caméras
mosquitto_sub -h localhost -t "onvif2mqtt/+/event/#"

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
    # S'abonner aux événements
    client.subscribe("onvif2mqtt/+/event/+")
    client.subscribe("onvif2mqtt/+/event/+/json")

def on_message(client, userdata, message):
    topic_parts = message.topic.split('/')
    camera_id = topic_parts[1]
    
    if len(topic_parts) >= 4 and topic_parts[2] == "event":
        event_type = topic_parts[3]
        payload = message.payload.decode()
        
        if len(topic_parts) == 5 and topic_parts[4] == "json":
            # Message JSON avec détails complets
            event_data = json.loads(payload)
            print(f"Événement {event_type} pour {camera_id}:")
            print(f"  État: {event_data['state']}")
            print(f"  Timestamp: {event_data['timestamp']}")
            print(f"  Données: {event_data['data']}")
            
            # Déclencher une action si mouvement détecté
            if event_type == "motion" and event_data['state'] == "ON":
                print(f"🚨 MOUVEMENT DÉTECTÉ sur {camera_id}!")
                # Ajouter votre logique ici (notification, enregistrement, etc.)
        else:
            # Message simple ON/OFF
            print(f"Événement {event_type} pour {camera_id}: {payload}")
    
    elif topic_parts[2] == "lwt":
        payload = message.payload.decode()
        print(f"Caméra {camera_id} est {payload}")
    elif topic_parts[2] == "presetListId":
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

# Exemple 4: Notification détection de mouvement ONVIF
automation:
  - alias: "Alerte mouvement détecté"
    trigger:
      - platform: mqtt
        topic: "onvif2mqtt/camera_salon/event/motion"
        payload: "ON"
    action:
      - service: notify.mobile_app
        data:
          message: "Mouvement détecté par la caméra Salon"
          title: "🚨 Détection de mouvement"

# Exemple 5: Enregistrement vidéo sur détection
automation:
  - alias: "Enregistrer sur mouvement"
    trigger:
      - platform: mqtt
        topic: "onvif2mqtt/+/event/motion"
        payload: "ON"
    action:
      - service: camera.record
        data_template:
          entity_id: "camera.{{ trigger.topic.split('/')[1] }}_stream"
          filename: "/config/recordings/{{ now().strftime('%Y%m%d_%H%M%S') }}_{{ trigger.topic.split('/')[1] }}.mp4"
          duration: 30
```

#### Scripts pour contrôle PTZ

```yaml
# Script pour aller à un preset via API REST
script:
  camera_preset_cours:
    alias: "Caméra - Vue Cours"
    sequence:
      - service: onvif2mqtt.camera_preset
        data:
          camera: "Camera Cours0"
          preset: "1"

# Les commandes REST ne sont plus supportées
# Utilisez uniquement les commandes MQTT
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
   # Redémarrer l'application
   npm start
   ```

### Caméras non détectées

1. **Vérifiez que les caméras sont sur le même réseau**
   ```bash
   # Test de ping
   ping 192.168.1.100
   
   # Test de port ONVIF
   telnet 192.168.1.100 80
   ```

2. **Vérifiez la configuration dans config.conf**
   - Assurez-vous que l'adresse IP est correcte
   - Vérifiez les identifiants (username/password)
   - Vérifiez le port ONVIF (généralement 80, 2020 ou 8080)

3. **Testez la connexion ONVIF**
   ```bash
   # Vérifiez les logs de l'application
   tail -f logs/app.log
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
   # Testez via MQTT avec différentes vitesses
   mosquitto_pub -h localhost -t "onvif2mqtt/camera/camera_salon/ptz/move" \
     -m '{"direction": "up", "speed": 0.5}'
   ```
### Problèmes de presets

1. **Les presets ne s'affichent pas**
   - Vérifiez que la caméra a des presets configurés
   - Consultez les logs : `tail -f logs/app.log | grep preset`

2. **Échec d'activation des presets**
   ```bash
   # Consultez les logs pour voir les erreurs
   tail -f logs/app.log | grep -i preset
   
   # Testez via MQTT
   mosquitto_pub -h localhost -t "onvif2mqtt/camera/camera_cours0/preset/1" -m "{}"
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
