const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class MqttManager {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isConnected = false;
        this.baseTopic = config.baseTopic || 'onvif2mqtt';
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
            this.client.publish(`${this.baseTopic}/lwt`, status, { retain: true });
        }
    }

    // === NOUVELLE STRUCTURE ONVIF2MQTT ===

    // // Publier le statut LWT d'une caméra
    // publishCameraLWT(camera, status) {
    //     const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
    //     const topic = `${this.baseTopic}/${cameraId}/lwt`;

    //     if (this.client && this.isConnected) {
    //         this.client.publish(topic, status, { retain: true, qos: 1 });
    //         logger.debug(`LWT publié pour ${camera.name}: ${status}`);
    //     }
    // }

    // // Publier la liste des presets
    // publishCameraPresets(camera, presets) {
    //     const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
    //     const topic = `${this.baseTopic}/${cameraId}/presetListId`;

    //     if (this.client && this.isConnected) {
    //         // Convertir les presets en format clé/valeur utilisable
    //         let presetList = {};

    //         if (presets && typeof presets === 'object') {
    //             if (Array.isArray(presets)) {
    //                 // Format tableau: [{name: "Cours", token: 1}, ...]
    //                 presets.forEach(preset => {
    //                     const name = preset.name || preset.Name || `Preset ${preset.token || preset.Token}`;
    //                     const token = preset.token || preset.Token;
    //                     if (token !== undefined) {
    //                         presetList[name] = token;
    //                     }
    //                 });
    //             } else {
    //                 // Format objet: {"Cours": 1, "Terrasse": 2, ...}
    //                 presetList = presets;
    //             }
    //         }

    //         const payload = JSON.stringify(presetList);
    //         this.client.publish(topic, payload, { retain: true, qos: 1 });
    //         logger.debug(`Presets publiés pour ${camera.name}: ${payload}`);
    //     }
    // }

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
        this.client.publish(
            `${this.baseTopic}/${cameraId}/lwt`,
            (camera.isConnected ? 'online' : 'offline'),
            { retain: true }
        );
        if (camera.isConnected) {

            // Capabilities - PTZ
            this.client.publish(
                `${this.baseTopic}/${cameraId}/capabilities/ptz`,
                (camera.hasPTZ ? 'true' : 'false'),
                { retain: true }
            );

            if (camera.hasPTZ) {
                const payload = JSON.stringify(camera.presets);
                this.client.publish(
                    `${this.baseTopic}/${cameraId}/presets`,
                    payload,
                    { retain: true, qos: 1 }
                );
                logger.debug(`Presets publiés pour ${camera.name}: ${payload}`);
            }
        }
    }

    // Publier une image de caméra
    publishCameraImage(camera, imageBuffer) {
        const cameraId = camera.name.toLowerCase().replace(/\s+/g, '_');
        this.client.publish(
            `${this.config.discoveryPrefix}/camera/${cameraId}/image`,
            imageBuffer
        );
    }

    handleMessage(topic, message) {
        logger.debug(`Message reçu - Topic: ${topic}, Message: ${message}`);

        // Gestion des commandes onvif2mqtt
        const topicParts = topic.split('/');
        if (topicParts.length >= 3) {
            const [, cameraId, command] = topicParts;
            if (command === 'cmd' || command === 'goPreset') {

                logger.debug(`Commande reçue - Caméra: ${cameraId}, Commande: ${command}, Message: ${message}`);

                switch (command) {
                    case 'cmd':
                        // message: move-left, move-right, move-up, move-down, zoom-in, zoom-out
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
}

module.exports = MqttManager;
