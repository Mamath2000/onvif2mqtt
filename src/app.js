require('dotenv').config();
const logger = require('./utils/logger');
const MqttManager = require('./mqtt/mqttManager');
const OnvifManager = require('./onvif/onvifManager');

class OnvifMqttGateway {
    constructor() {
        this.mqttManager = null;
        this.onvifManager = null;
        this.isRunning = false;
    }

    async init() {
        try {
            logger.info('Initialisation de la gateway ONVIF-MQTT...');

            // Configuration MQTT
            const mqttConfig = {
                brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
                username: process.env.MQTT_USERNAME,
                password: process.env.MQTT_PASSWORD,
                clientId: process.env.MQTT_CLIENT_ID || 'onvif-gateway',
                discoveryPrefix: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
                deviceName: process.env.HA_DEVICE_NAME || 'ONVIF Gateway',
                deviceId: process.env.HA_DEVICE_ID || 'onvif_gateway'
            };

            // Initialiser les gestionnaires
            this.mqttManager = new MqttManager(mqttConfig);
            this.onvifManager = new OnvifManager();

            // Configurer les événements MQTT
            this.mqttManager.on('cameraCommand', this.handleMqttCommand.bind(this));
            this.mqttManager.on('ptzCommand', this.handlePtzCommand.bind(this));

            // Se connecter au broker MQTT
            await this.mqttManager.connect();

            // Charger les caméras depuis les variables d'environnement
            this.loadCamerasFromEnv();
            
            // Démarrer la surveillance des statuts avec l'intervalle configuré
            const updateInterval = parseInt(process.env.STATUS_UPDATE_INTERVAL) || 30000;
            this.onvifManager.startStatusMonitoring(updateInterval, this.onStatusUpdate.bind(this));

            this.isRunning = true;
            logger.info('Contrôleur ONVIF-MQTT démarré avec succès');

        } catch (error) {
            logger.error('Erreur lors de l\'initialisation:', error);
            throw error;
        }
    }

    loadCamerasFromEnv() {
        const cameras = [];
        let cameraIndex = 1;

        // Charger les caméras depuis les variables d'environnement
        while (true) {
            const name = process.env[`CAMERA_${cameraIndex}_NAME`];
            const host = process.env[`CAMERA_${cameraIndex}_HOST`];
            const port = process.env[`CAMERA_${cameraIndex}_PORT`];
            const username = process.env[`CAMERA_${cameraIndex}_USERNAME`];
            const password = process.env[`CAMERA_${cameraIndex}_PASSWORD`];

            if (!name || !host || !username || !password) {
                break;
            }

            cameras.push({
                name,
                host,
                port: parseInt(port) || 80,
                username,
                password
            });

            cameraIndex++;
        }

        if (cameras.length > 0) {
            logger.info(`Chargement de ${cameras.length} caméra(s) depuis la configuration`);
            
            cameras.forEach(config => {
                this.onvifManager.addCamera(config);
            });

            // Connecter toutes les caméras
            this.onvifManager.connectAllCameras().then(async () => {
                // Publier la configuration de découverte pour Home Assistant
                this.onvifManager.getAllCameras().forEach(async camera => {
                    if (camera.isConnected) {
                        // Home Assistant Discovery
                        this.mqttManager.publishCameraDiscovery(camera);
                        this.mqttManager.publishCameraState(camera, camera.getStatus());
                        
                        // ONVIF2MQTT Structure
                        this.mqttManager.publishCameraLWT(camera, 'online');
                        
                        // Publier les presets si la caméra supporte PTZ
                        if (camera.hasPTZ) {
                            try {
                                const presets = await this.onvifManager.getCameraPresets(camera.name);
                                this.mqttManager.publishCameraPresets(camera, presets);
                            } catch (error) {
                                logger.warn(`Impossible de charger les presets pour ${camera.name}:`, error.message);
                            }
                        }
                    } else {
                        // Publier LWT offline pour les caméras non connectées
                        this.mqttManager.publishCameraLWT(camera, 'offline');
                    }
                });

                // S'abonner aux commandes MQTT (Home Assistant + onvif2mqtt)
                this.mqttManager.subscribeToCommands(this.onvifManager.getAllCameras());
                this.mqttManager.subscribeToOnvif2MqttCommands(this.onvifManager.getAllCameras());
            });
        } else {
            logger.info('Aucune caméra configurée dans les variables d\'environnement');
        }
    }

    async handleMqttCommand(command) {
        try {
            logger.debug('Commande MQTT reçue:', command);

            const { cameraId, command: cmd, value } = command;
            
            // Trouver la caméra correspondante
            const cameras = this.onvifManager.getAllCameras();
            const camera = cameras.find(cam => 
                cam.name.toLowerCase().replace(/\s+/g, '_') === cameraId
            );

            if (!camera) {
                logger.warn(`Caméra non trouvée pour l'ID: ${cameraId}`);
                return;
            }

            switch (cmd) {
                case 'power':
                    if (value && !camera.isConnected) {
                        // Allumer la caméra (reconnecter)
                        const connected = await camera.connect();
                        if (connected) {
                            this.mqttManager.publishCameraState(camera, camera.getStatus());
                        }
                    } else if (!value && camera.isConnected) {
                        // Éteindre la caméra (déconnecter)
                        camera.disconnect();
                        this.mqttManager.publishCameraState(camera, camera.getStatus());
                    }
                    break;

                default:
                    logger.warn(`Commande non reconnue: ${cmd}`);
            }

        } catch (error) {
            logger.error('Erreur lors du traitement de la commande MQTT:', error);
        }
    }

    async handlePtzCommand(command) {
        try {
            logger.debug('Commande PTZ onvif2mqtt reçue:', command);

            const { cameraId, command: cmd, direction, speed, presetId } = command;
            
            // Trouver la caméra correspondante
            const cameras = this.onvifManager.getAllCameras();
            const camera = cameras.find(cam => 
                cam.name.toLowerCase().replace(/\s+/g, '_') === cameraId
            );

            if (!camera) {
                logger.warn(`Caméra non trouvée pour l'ID PTZ: ${cameraId}`);
                return;
            }

            if (!camera.isConnected) {
                logger.warn(`Caméra non connectée pour commande PTZ: ${cameraId}`);
                return;
            }

            switch (cmd) {
                case 'move':
                    // direction: left/right/up/down
                    logger.info(`PTZ Move ${direction} pour ${camera.name}`);
                    const moveResult = await this.onvifManager.moveCameraPTZ(camera.name, direction, speed || 0.5);
                    if (!moveResult) {
                        logger.warn(`Échec du mouvement PTZ ${direction} pour ${camera.name}`);
                    }
                    break;

                case 'zoom':
                    // direction: in/out
                    logger.info(`PTZ Zoom ${direction} pour ${camera.name}`);
                    const zoomDirection = direction === 'in' ? 'zoom_in' : 'zoom_out';
                    const zoomResult = await this.onvifManager.moveCameraPTZ(camera.name, zoomDirection, speed || 0.5);
                    if (!zoomResult) {
                        logger.warn(`Échec du zoom PTZ ${direction} pour ${camera.name}`);
                    }
                    break;

                case 'preset':
                    logger.info(`PTZ Preset ${presetId} pour ${camera.name}`);
                    const presetResult = await this.onvifManager.gotoCameraPreset(camera.name, presetId);
                    if (!presetResult) {
                        logger.warn(`Échec de l'activation du preset ${presetId} pour ${camera.name}`);
                    }
                    break;

                default:
                    logger.warn(`Commande PTZ non reconnue: ${cmd}`);
            }

        } catch (error) {
            logger.error('Erreur lors du traitement de la commande PTZ onvif2mqtt:', error);
        }
    }

    onStatusUpdate(statuses) {
        // Publier les statuts mis à jour via MQTT
        Object.values(statuses).forEach(status => {
            const camera = this.onvifManager.getCamera(status.name);
            if (camera) {
                // Home Assistant state
                this.mqttManager.publishCameraState(camera, status);
                
                // ONVIF2MQTT LWT
                this.mqttManager.publishCameraLWT(camera, status.isConnected ? 'online' : 'offline');
            }
        });
    }

    async shutdown() {
        logger.info('Arrêt de la gateway ONVIF-MQTT...');
        
        this.isRunning = false;

        if (this.onvifManager) {
            this.onvifManager.disconnectAllCameras();
        }

        if (this.mqttManager) {
            this.mqttManager.disconnect();
        }

        logger.info('Gateway ONVIF-MQTT arrêtée');
    }
    }
// Fonction principale
async function main() {
    const gateway = new OnvifMqttGateway();

    // Gestion des signaux d'arrêt
    process.on('SIGINT', async () => {
        logger.info('Signal SIGINT reçu, arrêt en cours...');
        await gateway.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Signal SIGTERM reçu, arrêt en cours...');
        await gateway.shutdown();
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        logger.error('Exception non gérée:', error);
        gateway.shutdown().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Promesse rejetée non gérée:', reason);
        gateway.shutdown().then(() => process.exit(1));
    });

    try {
        await gateway.init();
        logger.info('Gateway ONVIF-MQTT démarrée avec succès');
        logger.info('Passerelle prête à recevoir des commandes MQTT');
    } catch (error) {
        logger.error('Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

// Démarrer l'application si ce fichier est exécuté directement
if (require.main === module) {
    main();
}

module.exports = OnvifMqttGateway;
