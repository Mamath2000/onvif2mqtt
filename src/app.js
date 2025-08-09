require('dotenv').config();
const logger = require('./utils/logger');
const MqttManager = require('./mqtt/mqttManager');
const OnvifManager = require('./onvif/onvifManager');
const HttpServer = require('./http/httpServer');

class OnvifMqttController {
    constructor() {
        this.mqttManager = null;
        this.onvifManager = null;
        this.httpServer = null;
        this.isRunning = false;
    }

    async init() {
        try {
            logger.info('Initialisation du contrôleur ONVIF-MQTT...');

            // Configuration MQTT
            const mqttConfig = {
                brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
                username: process.env.MQTT_USERNAME,
                password: process.env.MQTT_PASSWORD,
                clientId: process.env.MQTT_CLIENT_ID || 'onvif-controller',
                discoveryPrefix: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
                deviceName: process.env.HA_DEVICE_NAME || 'ONVIF Controller',
                deviceId: process.env.HA_DEVICE_ID || 'onvif_controller'
            };

            // Initialiser les gestionnaires
            this.mqttManager = new MqttManager(mqttConfig);
            this.onvifManager = new OnvifManager();
            this.httpServer = new HttpServer(this.onvifManager, this.mqttManager);

            // Configurer les événements MQTT
            this.mqttManager.on('cameraCommand', this.handleMqttCommand.bind(this));

            // Se connecter au broker MQTT
            await this.mqttManager.connect();

            // Charger les caméras depuis les variables d'environnement
            this.loadCamerasFromEnv();

            // Démarrer le serveur HTTP
            const httpPort = process.env.HTTP_PORT || 3000;
            await this.httpServer.start(httpPort);

            // Démarrer la surveillance des statuts
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
            this.onvifManager.connectAllCameras().then(() => {
                // Publier la configuration de découverte pour Home Assistant
                this.onvifManager.getAllCameras().forEach(camera => {
                    if (camera.isConnected) {
                        this.mqttManager.publishCameraDiscovery(camera);
                        this.mqttManager.publishCameraState(camera, camera.getStatus());
                    }
                });

                // S'abonner aux commandes MQTT
                this.mqttManager.subscribeToCommands(this.onvifManager.getAllCameras());
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

    onStatusUpdate(statuses) {
        // Publier les statuts mis à jour via MQTT
        Object.values(statuses).forEach(status => {
            if (status.isConnected) {
                const camera = this.onvifManager.getCamera(status.name);
                if (camera) {
                    this.mqttManager.publishCameraState(camera, status);
                }
            }
        });
    }

    async shutdown() {
        logger.info('Arrêt du contrôleur ONVIF-MQTT...');
        
        this.isRunning = false;

        if (this.onvifManager) {
            this.onvifManager.disconnectAllCameras();
        }

        if (this.mqttManager) {
            this.mqttManager.disconnect();
        }

        if (this.httpServer) {
            this.httpServer.stop();
        }

        logger.info('Contrôleur ONVIF-MQTT arrêté');
    }
}

// Fonction principale
async function main() {
    const controller = new OnvifMqttController();

    // Gestion des signaux d'arrêt
    process.on('SIGINT', async () => {
        logger.info('Signal SIGINT reçu, arrêt en cours...');
        await controller.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Signal SIGTERM reçu, arrêt en cours...');
        await controller.shutdown();
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        logger.error('Exception non gérée:', error);
        controller.shutdown().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Promesse rejetée non gérée:', reason);
        controller.shutdown().then(() => process.exit(1));
    });

    try {
        await controller.init();
        logger.info('Application démarrée avec succès');
        logger.info(`Interface web disponible sur: http://localhost:${process.env.HTTP_PORT || 3000}`);
    } catch (error) {
        logger.error('Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

// Démarrer l'application si ce fichier est exécuté directement
if (require.main === module) {
    main();
}

module.exports = OnvifMqttController;
