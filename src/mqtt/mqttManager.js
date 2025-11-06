const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class MqttManager {
    constructor(config, onvifManager = null) {
        this.config = config;
        this.client = null;
        this.isConnected = false;
        this.baseTopic = config.baseTopic || 'onvif2mqtt';
        this.onvifManager = onvifManager; // Référence au gestionnaire ONVIF
        this.deviceConfig = {
            identifiers: [config.deviceId],
            name: config.deviceName,
            model: "ONVIF MQTT Controller",
            manufacturer: "Custom",
            sw_version: "1.0.0"
        };
    }

    async connect() {
        try {
            const options = {
                clientId: this.config.clientId,
                username: this.config.username,
                password: this.config.password,
                clean: true,
                reconnectPeriod: 5000,
                connectTimeout: 30000,
                keepalive: 300,
                will: {
                    topic: `${this.baseTopic}/lwt`,
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

            // ✅ Amélioration : meilleure gestion des reconnexions
            this.client.on('reconnect', () => {
                logger.info('Reconnexion MQTT en cours...');
            });

            this.client.on('error', (error) => {
                logger.error('Erreur MQTT:', error);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                logger.warn('Connexion MQTT fermée');
                this.isConnected = false;
            });

            // ✅ Ajout gestion offline
            this.client.on('offline', () => {
                logger.warn('Client MQTT hors ligne');
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
            this.publishRaw(
                `${this.baseTopic}/lwt`, 
                status, 
                { retain: true });
        }
    }

    // S'abonner aux commandes onvif2mqtt pour toutes les caméras
    subscribeToOnvifCommands(cameras) {
        if (!this.client || !this.isConnected) return;

        cameras.forEach(camera => {
            const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');

            // Topics de commande simplifiés
            const commandTopics = [
                `${this.baseTopic}/${cameraId}/cmd`,
                `${this.baseTopic}/${cameraId}/goPreset`
            ];

            commandTopics.forEach(topic => {
                this.client.subscribe(topic, { qos: 1 });
                logger.info(`Abonné aux commandes onvif2mqtt: ${topic}`);
            });
        });
    }

    // Publier l'état d'une caméra
    publishCameraState(camera) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');

        // État du LWT
        this.publishRaw(
            `${this.baseTopic}/${cameraId}/lwt`,
            (camera.isConnected ? 'online' : 'offline'),
            { retain: true }
        );
        if (camera.isConnected) {

            // Capabilities - PTZ
            this.publishRaw(
                `${this.baseTopic}/${cameraId}/capabilities/ptz`,
                (camera.hasPTZ ? 'true' : 'false'),
                { retain: true }
            );

            if (camera.hasPTZ) {
                const payload = JSON.stringify(camera.presets);
                this.publishRaw(
                    `${this.baseTopic}/${cameraId}/presets`,
                    payload,
                    { retain: true, qos: 1 }
                );
                logger.debug(`Presets publiés pour ${camera.name}: ${payload}`);
            }
        }
    }

    /**
     * Publier un événement de caméra (motion, tamper, etc.)
     * @param {string} cameraName - Nom de la caméra
     * @param {string} eventType - Type d'événement (motion, tamper, etc.)
     * @param {object} eventData - Données de l'événement
     */
    publishCameraEvent(cameraName, eventType, eventData) {
        const cameraId = cameraName.toLowerCase().replace(/\s+/g, '_');
        
        // Déterminer la valeur de l'événement (ON/OFF pour les binaires)
        let eventValue = 'ON';

        // Pour les événements de mouvement
        if (eventType === 'motion' && eventData.IsMotion !== undefined) {
            eventValue = eventData.IsMotion === 'true' || eventData.IsMotion === true ? 'ON' : 'OFF';

        } else if (eventType === 'tamper' && eventData.IsTamper !== undefined) {
            eventValue = eventData.IsTamper === 'true' || eventData.IsTamper === true ? 'ON' : 'OFF';

        } else if (eventType === 'people' && eventData.IsPeople !== undefined) {
            eventValue = eventData.IsPeople === 'true' || eventData.IsPeople === true ? 'ON' : 'OFF';

        } else if (eventType === 'vehicle' && eventData.IsVehicle !== undefined) {
            eventValue = eventData.IsVehicle === 'true' || eventData.IsVehicle === true ? 'ON' : 'OFF';

        } else if (eventType === 'pet' && eventData.IsPet !== undefined) {
            eventValue = eventData.IsPet === 'true' || eventData.IsPet === true ? 'ON' : 'OFF';

        } else if (eventData.State !== undefined) {
            eventValue = eventData.State === 'true' || eventData.State === true ? 'ON' : 'OFF';
        }

            // Publier l'état simple (ON/OFF)
        this.publishRaw(
            `${this.baseTopic}/${cameraId}/event/${eventType}`,
            eventValue,
            { retain: true, qos: 1 }
        );
        
        // Publier les données complètes en JSON
        this.publishRaw(
            `${this.baseTopic}/${cameraId}/event/${eventType}/json`,
            JSON.stringify({
                camera: cameraName,
                eventType: eventType,
                state: eventValue,
                data: eventData,
                timestamp: new Date().toISOString()
            }),
            { retain: false, qos: 1 }
        );
        
        logger.info(`📡 Événement ${eventType} publié pour ${cameraName}: ${eventValue}`);
        
    }

    // // Publier une image de caméra
    // publishCameraImage(camera, imageBuffer) {
    //     const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
    //     this.publishRaw(
    //         `${this.config.discoveryPrefix}/camera/${cameraId}/image`,
    //         imageBuffer
    //     );
    // }

    handleMessage(topic, message) {
        logger.debug(`Message reçu - Topic: ${topic}, Message: ${message}`);

        const topicParts = topic.split('/');
        if (topicParts.length >= 3) {
            const [, cameraId, command] = topicParts;
            if (command === 'cmd' || command === 'goPreset') {
                logger.debug(`Commande reçue - Caméra: ${cameraId}, Commande: ${command}, Message: ${message}`);

                switch (command) {
                    case 'cmd':
                        const [action, direction] = message.split('-');
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
                        } else if (message === 'stop') {
                            this.emit('ptzCommand', {
                                cameraId,
                                command: 'stop'
                            });
                        } else {
                            logger.warn(`Action PTZ inconnue: ${action}`);
                        }
                        break;
                        
                    case 'goPreset':
                        this.emit('ptzCommand', {
                            cameraId,
                            command: 'preset',
                            presetId: message
                        });
                        break;

                    default:
                        logger.warn(`Commande onvif inconnue: ${command}`);
                }
            }
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

    publishRaw(topic, payload, options = {}) {
        if (this.client && this.isConnected) {
            this.client.publish(topic, payload, options);
            logger.debug(`Message brut publié - Topic: ${topic}`);
        } else {
            logger.warn(`Impossible de publier sur ${topic} - MQTT non connecté`);
        }
    }
}

module.exports = MqttManager;
