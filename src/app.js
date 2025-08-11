require('dotenv').config();
const logger = require('./utils/logger');
const MqttManager = require('./mqtt/mqttManager');
const OnvifManager = require('./onvif/onvifManager');
const HADiscoveryHelper = require('./ha/HADiscoveryHelper');

class OnvifMqttGateway {
    constructor() {
        this.mqttManager = null;
        this.onvifManager = null;
        this.haHelper = null;
        this.isRunning = false;
        this.isDiscoveryEnabled = process.env.HA_DISCOVERY_ENABLED === 'true';
    }

    async init() {
        try {
            logger.info('Initialisation de la gateway ONVIF-MQTT...');

            // Configuration MQTT
            const mqttConfig = {
                brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
                username: process.env.MQTT_USERNAME,
                password: process.env.MQTT_PASSWORD,
                clientId: `${process.env.MQTT_CLIENT_ID || 'onvif-gateway'}-${Math.random().toString().slice(2, 6)}`,
                baseTopic: process.env.HA_BASE_TOPIC || 'onvif2mqtt',
                deviceName: process.env.HA_DEVICE_NAME || 'ONVIF Gateway',
                deviceId: process.env.HA_DEVICE_ID || 'onvif_gateway'
            };

            // Initialiser les gestionnaires
            this.mqttManager = new MqttManager(mqttConfig);
            this.onvifManager = new OnvifManager();

            // Configurer les événements MQTT
            // this.mqttManager.on('cameraCommand', this.handleMqttCommand.bind(this));
            this.mqttManager.on('ptzCommand', this.handlePtzCommand.bind(this));

            // Charger les caméras depuis les variables d'environnement
            const cameras = this.getCamerasFromEnv();
            // Se connecter au broker MQTT en passant la liste des caméras
            await this.mqttManager.connect();
            // Ajouter les caméras à l'onvifManager
            cameras.forEach(camConfig => {
                this.onvifManager.addCamera(camConfig);
            });
            // Connecter les caméras et lancer la suite
            await this.connectAndSetupCameras();

            // Démarrer la surveillance des statuts avec l'intervalle configuré
            const updateInterval = parseInt(process.env.STATUS_UPDATE_INTERVAL) || 30000;
            this.onvifManager.startStatusMonitoring(updateInterval, this.onStatusUpdate.bind(this));

            // Démarrer la découverte des appareils Home Assistant
            this.haHelper = new HADiscoveryHelper(this.mqttManager.client, {
                isDiscoveryEnabled: this.isDiscoveryEnabled,
                discoveryPrefix: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
                baseTopic: mqttConfig.baseTopic
            });
            this.haHelper.publishGatewayDevice(
                mqttConfig.deviceId,
                mqttConfig.deviceName
            );

            const cameraStatuses = this.onvifManager.getAllCameraStatuses();
            Object.values(cameraStatuses).forEach(camStatus => {
                this.haHelper.publishCameraDevice(mqttConfig.deviceId, camStatus);
            });

            this.isRunning = true;
            logger.info('Contrôleur ONVIF-MQTT démarré avec succès');

        } catch (error) {
            logger.error('Erreur lors de l\'initialisation:', error);
            throw error;
        }
    }

    getCamerasFromEnv() {
        const cameras = [];
        let cameraIndex = 1;
        while (true) {
            const name = process.env[`CAMERA_${cameraIndex}_NAME`];
            const host = process.env[`CAMERA_${cameraIndex}_HOST`];
            const port = process.env[`CAMERA_${cameraIndex}_PORT`];
            const username = process.env[`CAMERA_${cameraIndex}_USERNAME`];
            const password = process.env[`CAMERA_${cameraIndex}_PASSWORD`];
            if (!name || !host || !username || !password) break;
            cameras.push({
                name,
                host,
                port: parseInt(port) || 80,
                username,
                password
            });
            cameraIndex++;
        }
        return cameras;
    }

    async connectAndSetupCameras() {
        const cameras = this.onvifManager.getAllCameras();
        if (cameras.length > 0) {
            logger.info(`Chargement de ${cameras.length} caméra(s) depuis la configuration`);
            await this.onvifManager.connectAllCameras();
            // Publier la configuration de découverte pour Home Assistant
            for (const camera of cameras) {
                this.mqttManager.publishCameraState(camera);
            }
            // S'abonner aux commandes MQTT (Home Assistant + onvif2mqtt)
            this.mqttManager.subscribeToOnvifCommands(cameras);
        } else {
            logger.info('Aucune caméra configurée dans les variables d\'environnement');
        }
    }

    async handlePtzCommand(command) {
        try {
            logger.debug('Commande onvif reçue:', command);

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

            if (!camera.hasPTZ) {
                logger.warn(`Caméra ne supporte pas PTZ: ${camera.name}`);
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
