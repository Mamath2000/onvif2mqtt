# Documentation des Événements ONVIF

## Vue d'ensemble

Ce système implémente la gestion des événements ONVIF basée sur le protocole **Pull Point Subscription**, inspiré du projet [dmitrif/onvif2mqtt](https://github.com/dmitrif/onvif2mqtt).

## Architecture

### Composants principaux

1. **OnvifEventSubscriber** (`src/onvif/onvifEventSubscriber.js`)
   - Gère la souscription aux événements via Pull Point
   - Poll périodiquement les messages d'événements
   - Parse et catégorise les événements ONVIF

2. **OnvifCamera** (`src/onvif/onvifCamera.js`)
   - Intègre le gestionnaire d'événements
   - S'abonne automatiquement lors de la connexion
   - Transmet les événements via callback

3. **OnvifManager** (`src/onvif/onvifManager.js`)
   - Centralise la gestion des événements
   - Distribue les événements aux callbacks enregistrés
   - Support pour plusieurs types d'événements

4. **MqttManager** (`src/mqtt/mqttManager.js`)
   - Publie les événements sur MQTT
   - Format simple (ON/OFF) et JSON détaillé

## Types d'événements supportés

### Événements de mouvement (motion)
- `RuleEngine/MotionRegionDetector/Motion`
- `RuleEngine/CellMotionDetector/Motion`
- `VideoSource/MotionAlarm`

**Exemple de données :**
```json
{
  "State": "true",
  "IsMotion": "true"
}
```

### Événements de sabotage (tamper)
- `RuleEngine/TamperDetector/Tamper`

**Utilisation :** Détection de tentative de sabotage de la caméra (couverture d'objectif, déplacement forcé, etc.)

### Détection de champ (field_detection)
- `RuleEngine/FieldDetector/ObjectsInside`

**Utilisation :** Détection d'objets dans une zone définie

### Entrée digitale (digital_input)
- `Device/Trigger/DigitalInput`

**Utilisation :** Changement d'état d'une entrée digitale (bouton, capteur externe, etc.)

### Franchissement de ligne (line_crossing)
- `RuleEngine/LineDetector/Crossed`

**Utilisation :** Détection du franchissement d'une ligne virtuelle configurée sur la caméra

## Configuration

### Activation des événements

Dans `config.conf` :

```ini
[events]
# Activer/désactiver la surveillance des événements
enabled = true

# Intervalle de polling (ms) - temps entre chaque vérification
pull_interval = 1000

# Timeout pour le pull (ms) - durée max d'attente de nouveaux événements
pull_timeout = 60000
```

### Paramètres recommandés

| Paramètre | Valeur par défaut | Recommandation |
|-----------|-------------------|----------------|
| `enabled` | `true` | `true` pour activer |
| `pull_interval` | `1000` ms | 500-2000 ms selon la charge |
| `pull_timeout` | `60000` ms | 30000-120000 ms |

**Note :** Un `pull_interval` trop faible peut surcharger le réseau et la caméra. Un timeout trop élevé peut ralentir la détection de reconnexion.

## Topics MQTT

### Topics d'événements

#### Format simple
```
onvif2mqtt/{camera_id}/event/{event_type}
Payload: ON | OFF
```

**Exemple :**
```
onvif2mqtt/camera_salon/event/motion
Payload: ON
```

#### Format JSON détaillé
```
onvif2mqtt/{camera_id}/event/{event_type}/json
```

**Exemple de payload :**
```json
{
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

### Wildcards pour surveillance

```bash
# Tous les événements de toutes les caméras
mosquitto_sub -t "onvif2mqtt/+/event/#"

# Tous les événements JSON
mosquitto_sub -t "onvif2mqtt/+/event/+/json"

# Événements de mouvement uniquement
mosquitto_sub -t "onvif2mqtt/+/event/motion"

# Tous les événements d'une caméra spécifique
mosquitto_sub -t "onvif2mqtt/camera_salon/event/#"
```

## Intégration Home Assistant

### Configuration de capteurs binaires

```yaml
# configuration.yaml
binary_sensor:
  - platform: mqtt
    name: "Mouvement Caméra Salon"
    state_topic: "onvif2mqtt/camera_salon/event/motion"
    payload_on: "ON"
    payload_off: "OFF"
    device_class: motion
    
  - platform: mqtt
    name: "Sabotage Caméra Salon"
    state_topic: "onvif2mqtt/camera_salon/event/tamper"
    payload_on: "ON"
    payload_off: "OFF"
    device_class: tamper
```

### Automatisations

#### Notification sur mouvement
```yaml
automation:
  - alias: "Alerte mouvement caméra"
    trigger:
      - platform: state
        entity_id: binary_sensor.mouvement_camera_salon
        to: 'on'
    action:
      - service: notify.mobile_app
        data:
          message: "Mouvement détecté dans le salon"
          title: "🚨 Détection de mouvement"
          data:
            tag: "motion_salon"
            actions:
              - action: "VIEW_CAMERA"
                title: "Voir caméra"
```

#### Enregistrement automatique
```yaml
automation:
  - alias: "Enregistrer sur mouvement"
    trigger:
      - platform: state
        entity_id: binary_sensor.mouvement_camera_salon
        to: 'on'
    action:
      - service: camera.record
        target:
          entity_id: camera.camera_salon_stream
        data:
          filename: "/config/recordings/{{ now().strftime('%Y%m%d_%H%M%S') }}_salon.mp4"
          duration: 30
```

#### Allumer lumières sur mouvement nocturne
```yaml
automation:
  - alias: "Lumières sur mouvement nocturne"
    trigger:
      - platform: state
        entity_id: binary_sensor.mouvement_camera_jardin
        to: 'on'
    condition:
      - condition: sun
        after: sunset
        before: sunrise
    action:
      - service: light.turn_on
        target:
          entity_id: light.jardin
        data:
          brightness: 255
      - delay: "00:05:00"
      - service: light.turn_off
        target:
          entity_id: light.jardin
```

## Dépannage

### Les événements ne sont pas détectés

1. **Vérifier que les événements sont activés**
   ```ini
   [events]
   enabled = true
   ```

2. **Vérifier que la caméra supporte les événements ONVIF**
   - Consultez la documentation de votre caméra
   - Vérifiez dans l'interface web de la caméra que la détection est activée

3. **Consulter les logs**
   ```bash
   tail -f logs/app.log | grep -i event
   ```

4. **Tester avec mosquitto_sub**
   ```bash
   # Surveiller tous les événements
   mosquitto_sub -h localhost -t "onvif2mqtt/+/event/#" -v
   ```

### Les événements sont détectés mais pas publiés

1. **Vérifier la connexion MQTT**
   ```bash
   mosquitto_sub -h localhost -t "onvif2mqtt/#" -v
   ```

2. **Vérifier les logs MQTT**
   ```bash
   tail -f logs/app.log | grep -i mqtt
   ```

### Les événements arrivent en retard

1. **Réduire l'intervalle de polling**
   ```ini
   [events]
   pull_interval = 500  # Réduire de 1000 à 500ms
   ```

2. **Vérifier la latence réseau**
   ```bash
   ping <camera_ip>
   ```

### Trop d'événements (faux positifs)

1. **Ajuster la sensibilité de détection sur la caméra**
   - Accédez à l'interface web de la caméra
   - Réduire la sensibilité de détection de mouvement

2. **Filtrer dans Home Assistant**
   ```yaml
   binary_sensor:
     - platform: mqtt
       name: "Mouvement Caméra Salon"
       state_topic: "onvif2mqtt/camera_salon/event/motion"
       payload_on: "ON"
       payload_off: "OFF"
       device_class: motion
       # Ignorer les changements trop rapides
       off_delay: 5
   ```

## Limitations connues

1. **Pull Point uniquement**
   - Cette implémentation utilise Pull Point Subscription
   - Certaines caméras peuvent préférer Base Notification
   - Consultez la documentation de votre caméra pour les méthodes supportées

2. **Latence de détection**
   - Dépend de l'intervalle de polling (`pull_interval`)
   - Minimum de latence : `pull_interval` ms
   - Pour une détection quasi instantanée, réduire à 200-500ms

3. **Types d'événements**
   - Seuls les événements standards ONVIF sont reconnus
   - Les événements propriétaires de certains fabricants peuvent ne pas être catégorisés

4. **Charge réseau**
   - Un polling fréquent génère du trafic réseau constant
   - À considérer pour les installations avec beaucoup de caméras

## Compatibilité caméras

### Caméras testées
- EZViz (avec firmware ONVIF standard)
- Hikvision (modèles supportant Pull Point)
- Dahua (modèles récents)
- Reolink (série E1 et autres)

### Recommandations fabricants
- **Hikvision** : Bien supporté, activer "Event Notification" dans l'interface web
- **Dahua** : Activer "IVS" (Intelligent Video Surveillance) pour les événements avancés
- **Axis** : Excellente compatibilité ONVIF
- **Reolink** : Vérifier que le firmware est à jour

## Références

- [Spécification ONVIF Core](https://www.onvif.org/specs/core/ONVIF-Core-Specification.pdf)
- [Dépôt source d'inspiration](https://github.com/dmitrif/onvif2mqtt)
- [Bibliothèque node-onvif](https://github.com/agsh/onvif)

## Support

Pour tout problème ou question :
1. Consultez les logs : `tail -f logs/app.log`
2. Vérifiez la configuration dans `config.conf`
3. Testez avec mosquitto_sub pour isoler les problèmes MQTT
4. Créez une issue sur GitHub avec les logs pertinents
