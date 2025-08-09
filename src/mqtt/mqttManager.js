const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class MqttManager {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isConnected = false;
        this.deviceConfig = {
            identifiers: [config.deviceId],
            name: config.deviceName,
            model: "ONVIF MQTT Controller",
            manufacturer: "Custom",
            sw_version: "1.0.0"
        };
        // Nouvelle structure ONVIF2MQTT
        this.onvif2mqttPrefix = 'onvif2mqtt';
    }

    async connect() {
        try {
            const options = {
                clientId: this.config.clientId || `onvif-controller-${uuidv4()}`,
                username: this.config.username,
                password: this.config.password,
                clean: true,
                reconnectPeriod: 5000,
                will: {
                    topic: `${this.config.discoveryPrefix}/status`,
                    payload: 'offline',
                    qos: 1,
                    retain: true
                }
            };

            this.client = mqtt.connect(this.config.brokerUrl, options);

            this.client.on('connect', () => {
                logger.info('Connecté au broker MQTT');
                this.isConnected = true;
                this.publishStatus('online');
            });

            this.client.on('error', (error) => {
                logger.error('Erreur MQTT:', error);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                logger.warn('Connexion MQTT fermée');
                this.isConnected = false;
            });

            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message.toString());
            });

        } catch (error) {
            logger.error('Erreur lors de la connexion MQTT:', error);
            throw error;
        }
    }

    publishStatus(status) {
        if (this.client && this.isConnected) {
            this.client.publish(`${this.config.discoveryPrefix}/status`, status, { retain: true });
        }
    }

    // === NOUVELLE STRUCTURE ONVIF2MQTT ===
    
    // Publier le statut LWT d'une caméra
    publishCameraLWT(camera, status) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        const topic = `${this.onvif2mqttPrefix}/${cameraId}/lwt`;
        
        if (this.client && this.isConnected) {
            this.client.publish(topic, status, { retain: true, qos: 1 });
            logger.debug(`LWT publié pour ${camera.name}: ${status}`);
        }
    }

    // Publier la liste des presets
    publishCameraPresets(camera, presets) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        const topic = `${this.onvif2mqttPrefix}/${cameraId}/presetListId`;
        
        if (this.client && this.isConnected) {
            // Convertir les presets en format clé/valeur utilisable
            let presetList = {};
            
            if (presets && typeof presets === 'object') {
                if (Array.isArray(presets)) {
                    // Format tableau: [{name: "Cours", token: 1}, ...]
                    presets.forEach(preset => {
                        const name = preset.name || preset.Name || `Preset ${preset.token || preset.Token}`;
                        const token = preset.token || preset.Token;
                        if (token !== undefined) {
                            presetList[name] = token;
                        }
                    });
                } else {
                    // Format objet: {"Cours": 1, "Terrasse": 2, ...}
                    presetList = presets;
                }
            }
            
            const payload = JSON.stringify(presetList);
            this.client.publish(topic, payload, { retain: true, qos: 1 });
            logger.debug(`Presets publiés pour ${camera.name}: ${payload}`);
        }
    }

    // S'abonner aux commandes onvif2mqtt pour toutes les caméras
    subscribeToOnvif2MqttCommands(cameras) {
        if (!this.client || !this.isConnected) return;

        cameras.forEach(camera => {
            const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
            
            // Topics de commande simplifiés
            const commandTopics = [
                `${this.onvif2mqttPrefix}/${cameraId}/cmd`,
                `${this.onvif2mqttPrefix}/${cameraId}/goPreset`
            ];

            commandTopics.forEach(topic => {
                this.client.subscribe(topic, { qos: 1 });
                logger.info(`Abonné aux commandes onvif2mqtt: ${topic}`);
            });
        });
    }

    // Publier la configuration de découverte automatique pour Home Assistant
    publishCameraDiscovery(camera) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        
        // Configuration pour le switch de la caméra
        const switchConfig = {
            name: `${camera.name} Power`,
            unique_id: `${this.config.deviceId}_${cameraId}_power`,
            state_topic: `${this.config.discoveryPrefix}/switch/${cameraId}_power/state`,
            command_topic: `${this.config.discoveryPrefix}/switch/${cameraId}_power/set`,
            device: {
                ...this.deviceConfig,
                name: camera.name
            },
            availability_topic: `${this.config.discoveryPrefix}/status`,
            payload_on: "ON",
            payload_off: "OFF"
        };

        // Configuration pour la caméra
        const cameraConfig = {
            name: `${camera.name} Stream`,
            unique_id: `${this.config.deviceId}_${cameraId}_camera`,
            topic: `${this.config.discoveryPrefix}/camera/${cameraId}/image`,
            device: {
                ...this.deviceConfig,
                name: camera.name
            },
            availability_topic: `${this.config.discoveryPrefix}/status`
        };

        // Configuration pour les capteurs de statut
        const statusConfig = {
            name: `${camera.name} Status`,
            unique_id: `${this.config.deviceId}_${cameraId}_status`,
            state_topic: `${this.config.discoveryPrefix}/sensor/${cameraId}_status/state`,
            device: {
                ...this.deviceConfig,
                name: camera.name
            },
            availability_topic: `${this.config.discoveryPrefix}/status`,
            icon: "mdi:camera"
        };

        // Publier les configurations
        this.client.publish(
            `${this.config.discoveryPrefix}/switch/${cameraId}_power/config`,
            JSON.stringify(switchConfig),
            { retain: true }
        );

        this.client.publish(
            `${this.config.discoveryPrefix}/camera/${cameraId}/config`,
            JSON.stringify(cameraConfig),
            { retain: true }
        );

        this.client.publish(
            `${this.config.discoveryPrefix}/sensor/${cameraId}_status/config`,
            JSON.stringify(statusConfig),
            { retain: true }
        );

        logger.info(`Configuration de découverte publiée pour la caméra: ${camera.name}`);
    }

    // Publier l'état d'une caméra
    publishCameraState(camera, state) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        
        // État du switch
        this.client.publish(
            `${this.config.discoveryPrefix}/switch/${cameraId}_power/state`,
            state.power ? 'ON' : 'OFF',
            { retain: true }
        );

        // État du capteur de statut
        this.client.publish(
            `${this.config.discoveryPrefix}/sensor/${cameraId}_status/state`,
            state.status,
            { retain: true }
        );
    }

    // Publier une image de caméra
    publishCameraImage(camera, imageBuffer) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        this.client.publish(
            `${this.config.discoveryPrefix}/camera/${cameraId}/image`,
            imageBuffer
        );
    }

    // S'abonner aux commandes
    subscribeToCommands(cameras) {
        cameras.forEach(camera => {
            const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
            const commandTopic = `${this.config.discoveryPrefix}/switch/${cameraId}_power/set`;
            this.client.subscribe(commandTopic);
            logger.info(`Abonné aux commandes pour: ${commandTopic}`);
        });
    }

    handleMessage(topic, message) {
        logger.debug(`Message reçu - Topic: ${topic}, Message: ${message}`);
        
        // Gestion des commandes onvif2mqtt
        if (topic.startsWith(this.onvif2mqttPrefix)) {
            this.handleOnvif2MqttCommand(topic, message);
            return;
        }
        
        // Gestion des commandes Home Assistant (existant)
        const topicParts = topic.split('/');
        if (topicParts.length >= 4 && topicParts[0] === this.config.discoveryPrefix.replace('homeassistant', '').replace('/', '')) {
            const deviceType = topicParts[1];
            const deviceId = topicParts[2];
            const command = topicParts[3];

            if (deviceType === 'switch' && command === 'set') {
                const cameraId = deviceId.replace('_power', '');
                const powerState = message === 'ON';
                
                // Émettre un événement pour que l'application gère la commande
                this.emit('cameraCommand', {
                    cameraId,
                    command: 'power',
                    value: powerState
                });
            }
        }
    }

    // Nouvelle méthode pour gérer les commandes onvif2mqtt
    handleOnvif2MqttCommand(topic, message) {
        const topicParts = topic.split('/');
        // Format: onvif2mqtt/{cam_id}/{command}
        
        if (topicParts.length >= 3) {
            const cameraId = topicParts[1];
            const command = topicParts[2];
            
            logger.debug(`Commande onvif2mqtt reçue - Caméra: ${cameraId}, Commande: ${command}, Message: ${message}`);
            
            switch (command) {
                case 'cmd':
                    // message: move-left, move-right, move-up, move-down, zoom-in, zoom-out
                    this.handlePtzCmd(cameraId, message);
                    break;
                    
                case 'goPreset':
                    // message: preset ID
                    this.emit('ptzCommand', {
                        cameraId,
                        command: 'preset',
                        presetId: message
                    });
                    break;
                    
                default:
                    logger.warn(`Commande onvif2mqtt inconnue: ${command}`);
            }
        }
    }

    // Gérer les commandes PTZ via le topic cmd
    handlePtzCmd(cameraId, cmdMessage) {
        const cmdParts = cmdMessage.split('-');
        
        if (cmdParts.length >= 2) {
            const action = cmdParts[0]; // move ou zoom
            const direction = cmdParts[1]; // left, right, up, down, in, out
            
            if (action === 'move') {
                // move-left, move-right, move-up, move-down
                if (['left', 'right', 'up', 'down'].includes(direction)) {
                    const defaultSpeed = parseFloat(process.env.PTZ_DEFAULT_SPEED) || 0.5;
                    this.emit('ptzCommand', {
                        cameraId,
                        command: 'move',
                        direction: direction,
                        speed: defaultSpeed
                    });
                } else {
                    logger.warn(`Direction de mouvement invalide: ${direction}`);
                }
            } else if (action === 'zoom') {
                // zoom-in, zoom-out
                if (['in', 'out'].includes(direction)) {
                    const defaultSpeed = parseFloat(process.env.PTZ_DEFAULT_SPEED) || 0.5;
                    this.emit('ptzCommand', {
                        cameraId,
                        command: 'zoom',
                        direction: direction,
                        speed: defaultSpeed
                    });
                } else {
                    logger.warn(`Direction de zoom invalide: ${direction}`);
                }
            } else {
                logger.warn(`Action PTZ inconnue: ${action}`);
            }
        } else {
            logger.warn(`Format de commande PTZ invalide: ${cmdMessage}. Attendu: action-direction (ex: move-left, zoom-in)`);
        }
    }

    // Méthodes pour émettre des événements (pattern EventEmitter)
    emit(event, data) {
        if (this.listeners && this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    on(event, callback) {
        if (!this.listeners) {
            this.listeners = {};
        }
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    disconnect() {
        if (this.client) {
            this.publishStatus('offline');
            this.client.end();
            this.isConnected = false;
            logger.info('Déconnecté du broker MQTT');
        }
    }
}

module.exports = MqttManager;
