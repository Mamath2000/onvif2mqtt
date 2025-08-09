# Configuration Home Assistant pour ONVIF MQTT Controller

## Exemple de configuration MQTT dans Home Assistant

```yaml
# configuration.yaml
mqtt:
  broker: localhost
  port: 1883
  username: votre_utilisateur
  password: votre_mot_de_passe
  discovery: true
  discovery_prefix: homeassistant
```

## Automatisations d'exemple

### 1. Activer la caméra lors de la détection de mouvement

```yaml
# automations.yaml
- id: 'camera_motion_activation'
  alias: 'Activer caméra salon - mouvement détecté'
  trigger:
    - platform: state
      entity_id: binary_sensor.detecteur_mouvement_salon
      to: 'on'
  condition:
    - condition: state
      entity_id: switch.camera_salon_power
      state: 'off'
  action:
    - service: switch.turn_on
      target:
        entity_id: switch.camera_salon_power
    - service: notify.mobile_app
      data:
        message: "Mouvement détecté - Caméra salon activée"
```

### 2. Rotation automatique de la caméra PTZ

```yaml
- id: 'camera_ptz_patrol'
  alias: 'Patrouille caméra PTZ'
  trigger:
    - platform: time_pattern
      minutes: '/15'  # Toutes les 15 minutes
  condition:
    - condition: state
      entity_id: switch.camera_jardin_power
      state: 'on'
  action:
    - service: rest_command.camera_ptz_preset_1
    - delay: '00:00:30'
    - service: rest_command.camera_ptz_preset_2
    - delay: '00:00:30'
    - service: rest_command.camera_ptz_preset_3
```

### 3. Sauvegarde automatique de snapshots

```yaml
- id: 'camera_snapshot_backup'
  alias: 'Sauvegarde snapshot caméras'
  trigger:
    - platform: time
      at: '02:00:00'  # Tous les jours à 2h du matin
  action:
    - service: rest_command.camera_salon_snapshot
    - service: rest_command.camera_jardin_snapshot
```

## Commandes REST personnalisées

Ajoutez ces commandes dans votre `configuration.yaml` :

```yaml
rest_command:
  # Snapshots
  camera_salon_snapshot:
    url: 'http://localhost:3000/api/cameras/Camera%20Salon/snapshot'
    method: GET
    
  camera_jardin_snapshot:
    url: 'http://localhost:3000/api/cameras/Camera%20Jardin/snapshot'
    method: GET

  # Contrôles PTZ
  camera_ptz_up:
    url: 'http://localhost:3000/api/cameras/{{ camera_name }}/ptz/move'
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"direction": "up", "speed": 0.5}'
    
  camera_ptz_down:
    url: 'http://localhost:3000/api/cameras/{{ camera_name }}/ptz/move'
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"direction": "down", "speed": 0.5}'
    
  camera_ptz_left:
    url: 'http://localhost:3000/api/cameras/{{ camera_name }}/ptz/move'
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"direction": "left", "speed": 0.5}'
    
  camera_ptz_right:
    url: 'http://localhost:3000/api/cameras/{{ camera_name }}/ptz/move'
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"direction": "right", "speed": 0.5}'
    
  camera_ptz_stop:
    url: 'http://localhost:3000/api/cameras/{{ camera_name }}/ptz/stop'
    method: POST

  # Presets PTZ
  camera_ptz_preset_1:
    url: 'http://localhost:3000/api/cameras/Camera%20Jardin/presets/preset1'
    method: POST
    
  camera_ptz_preset_2:
    url: 'http://localhost:3000/api/cameras/Camera%20Jardin/presets/preset2'
    method: POST
```

## Cartes Lovelace personnalisées

### Carte caméra avec contrôles

```yaml
# Carte pour contrôler une caméra PTZ
type: vertical-stack
cards:
  - type: picture-entity
    entity: camera.camera_jardin_stream
    name: "Caméra Jardin"
    
  - type: horizontal-stack
    cards:
      - type: button
        entity: switch.camera_jardin_power
        name: "Power"
        icon: mdi:power
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_jardin_snapshot
        name: "Snapshot"
        icon: mdi:camera
        
  - type: grid
    columns: 3
    cards:
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_up
        icon: mdi:arrow-up
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_stop
        icon: mdi:stop
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_preset_1
        name: "P1"
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_left
        icon: mdi:arrow-left
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_down
        icon: mdi:arrow-down
        
      - type: button
        tap_action:
          action: call-service
          service: rest_command.camera_ptz_right
        icon: mdi:arrow-right
```

### Dashboard de surveillance

```yaml
type: grid
columns: 2
cards:
  - type: picture-entity
    entity: camera.camera_salon_stream
    name: "Salon"
    
  - type: picture-entity
    entity: camera.camera_jardin_stream
    name: "Jardin"
    
  - type: entities
    title: "Statuts Caméras"
    entities:
      - entity: sensor.camera_salon_status
        name: "Salon"
      - entity: sensor.camera_jardin_status
        name: "Jardin"
      - entity: switch.camera_salon_power
        name: "Power Salon"
      - entity: switch.camera_jardin_power
        name: "Power Jardin"
        
  - type: logbook
    entities:
      - switch.camera_salon_power
      - switch.camera_jardin_power
      - sensor.camera_salon_status
      - sensor.camera_jardin_status
    hours_to_show: 24
```

## Capteurs personnalisés

Créez des capteurs pour surveiller l'état de l'application :

```yaml
# sensors.yaml
- platform: rest
  name: "ONVIF Controller Status"
  resource: "http://localhost:3000/health"
  method: GET
  value_template: "{{ value_json.status }}"
  json_attributes:
    - timestamp
    - mqtt
    - cameras
  scan_interval: 60

- platform: template
  sensors:
    onvif_cameras_count:
      friendly_name: "Nombre de caméras connectées"
      value_template: "{{ state_attr('sensor.onvif_controller_status', 'cameras') | int }}"
      unit_of_measurement: "caméras"
      icon: mdi:camera-outline
      
    onvif_mqtt_status:
      friendly_name: "Statut MQTT ONVIF"
      value_template: >
        {% if state_attr('sensor.onvif_controller_status', 'mqtt') %}
          Connecté
        {% else %}
          Déconnecté
        {% endif %}
      icon: mdi:mqtt
```

## Notifications et alertes

```yaml
# Alertes en cas de problème
- id: 'onvif_controller_offline'
  alias: 'Alerte - Contrôleur ONVIF hors ligne'
  trigger:
    - platform: state
      entity_id: sensor.onvif_controller_status
      to: 'unavailable'
      for: '00:05:00'
  action:
    - service: notify.admin
      data:
        message: "⚠️ Le contrôleur ONVIF est hors ligne depuis 5 minutes"
        
- id: 'camera_offline_alert'
  alias: 'Alerte - Caméra hors ligne'
  trigger:
    - platform: state
      entity_id: 
        - sensor.camera_salon_status
        - sensor.camera_jardin_status
      to: 'offline'
      for: '00:02:00'
  action:
    - service: notify.admin
      data:
        message: "📹 Caméra {{ trigger.to_state.attributes.friendly_name }} hors ligne"
```
