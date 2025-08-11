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
        this.healthCheckInterval = null; // ✅ AJOUT
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
            this.haHelper = new HADiscoveryHelper(this.mqttManager, {
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
                // ✅ AJOUT : Tentative de reconnexion avant de refuser la commande
                logger.info(`Tentative de reconnexion de ${camera.name} avant commande PTZ...`);
                const reconnected = await this.onvifManager.attemptReconnection(camera, 1);
                if (!reconnected) {
                    logger.error(`Impossible de reconnecter ${camera.name} pour la commande PTZ`);
                    return;
                }
            }

            if (!camera.hasPTZ) {
                logger.warn(`Caméra ne supporte pas PTZ: ${camera.name}`);
                return;
            }

            let commandResult = false;

            switch (cmd) {
                case 'move':
                    logger.info(`PTZ Move ${direction} pour ${camera.name}`);
                    commandResult = await this.onvifManager.moveCameraPTZ(camera.name, direction, speed || 0.5);
                    break;

                case 'zoom':
                    logger.info(`PTZ Zoom ${direction} pour ${camera.name}`);
                    const zoomDirection = direction === 'in' ? 'zoom_in' : 'zoom_out';
                    commandResult = await this.onvifManager.moveCameraPTZ(camera.name, zoomDirection, speed || 0.5);
                    break;

                case 'preset':
                    logger.info(`PTZ Preset ${presetId} pour ${camera.name}`);
                    commandResult = await this.onvifManager.gotoCameraPreset(camera.name, presetId);
                    break;

                case 'stop':
                    logger.info(`PTZ Stop pour ${camera.name}`);
                    commandResult = await this.onvifManager.stopCameraPTZ(camera.name);
                    break;

                default:
                    logger.warn(`Commande PTZ non reconnue: ${cmd}`);
                    return;
            }

            // ✅ AJOUT : Logger le résultat de la commande
            if (commandResult) {
                logger.debug(`✅ Commande PTZ ${cmd} réussie pour ${camera.name}`);
            } else {
                logger.warn(`❌ Échec de la commande PTZ ${cmd} pour ${camera.name}`);
            }

        } catch (error) {
            logger.error('Erreur lors du traitement de la commande PTZ onvif2mqtt:', error);
        }
    }

    async ptzCommand(data) {
        try {
            const camera = this.onvifManager.getCamera(data.cameraId);
            if (!camera) {
                logger.warn(`Caméra non trouvée: ${data.cameraId}`);
                return;
            }

            // ✅ Vérification de connexion avant commande PTZ
            if (!camera.isConnected) {
                logger.warn(`Caméra ${data.cameraId} non connectée, commande PTZ ignorée`);
                return;
            }

            let result = false;

            switch (data.command) {
                case 'move':
                    switch (data.direction) {
                        case 'up':
                            result = await camera.moveUp(data.speed);
                            break;
                        case 'down':
                            result = await camera.moveDown(data.speed);
                            break;
                        case 'left':
                            result = await camera.moveLeft(data.speed);
                            break;
                        case 'right':
                            result = await camera.moveRight(data.speed);
                            break;
                        default:
                            logger.warn(`Direction de mouvement invalide: ${data.direction}`);
                            return;
                    }
                    break;

                case 'zoom':
                    switch (data.direction) {
                        case 'in':
                            result = await camera.zoomIn(data.speed);
                            break;
                        case 'out':
                            result = await camera.zoomOut(data.speed);
                            break;
                        default:
                            logger.warn(`Direction de zoom invalide: ${data.direction}`);
                            return;
                    }
                    break;

                case 'stop':
                    result = await camera.ptzStop();
                    break;

                case 'preset':
                    result = await camera.gotoPreset(data.presetId);
                    break;

                default:
                    logger.warn(`Commande PTZ inconnue: ${data.command}`);
                    return;
            }

            // ✅ Publier le résultat de la commande
            if (result) {
                logger.debug(`Commande PTZ réussie pour ${data.cameraId}: ${data.command}`);
            } else {
                logger.warn(`Commande PTZ échouée pour ${data.cameraId}: ${data.command}`);
            }

        } catch (error) {
            logger.error('Erreur lors de l\'exécution de la commande PTZ:', error);
            // ✅ Ne pas faire crasher l'application sur une erreur PTZ
        }
    }

    onStatusUpdate(statuses) {
        try {
            Object.values(statuses).forEach(async (status) => {
                const camera = this.onvifManager.getCamera(status.name);
                if (camera) {
                    // Publier l'état Home Assistant
                    this.mqttManager.publishCameraState(camera);
                    
                    // ✅ Amélioration : vérifier d'abord l'état de connexion
                    if (!camera.isConnected && !camera.isConnecting) {
                        logger.warn(`Caméra ${camera.name} déconnectée, tentative de reconnexion...`);
                        
                        this.onvifManager.attemptReconnection(camera, 1).catch(error => {
                            logger.error(`Échec de reconnexion pour ${camera.name}:`, error);
                        });
                    }
                }
            });
        } catch (error) {
            logger.error('Erreur lors de la publication des statuts MQTT:', error);
        }
    }

    // ✅ NOUVELLE MÉTHODE : Surveillance de santé globale
    startHealthCheck() {
        const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000;
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                // Vérifier la connexion MQTT
                if (!this.mqttManager.isConnected) {
                    logger.warn('MQTT déconnecté - reconnexion automatique en cours...');
                }

                // Vérifier les caméras
                const totalCameras = this.onvifManager.cameras.size;
                const connectedCameras = Array.from(this.onvifManager.cameras.values())
                    .filter(camera => camera.isConnected).length;

                logger.debug(`Santé du système - MQTT: ${this.mqttManager.isConnected ? '✅' : '❌'}, Caméras: ${connectedCameras}/${totalCameras}`);

                // Statistiques détaillées si pas toutes connectées
                if (connectedCameras < totalCameras) {
                    const disconnected = Array.from(this.onvifManager.cameras.values())
                        .filter(camera => !camera.isConnected)
                        .map(camera => camera.name);
                    logger.warn(`Caméras déconnectées: ${disconnected.join(', ')}`);
                }

            } catch (error) {
                logger.error('Erreur lors de la vérification de santé:', error);
            }
        }, healthCheckInterval);

        logger.info(`Surveillance de santé démarrée (intervalle: ${healthCheckInterval}ms)`);
    }

    async shutdown() {
        logger.info('Arrêt de la gateway ONVIF-MQTT...');

        this.isRunning = false;

        // ✅ AJOUT : Arrêter la surveillance de santé
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

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

    // ✅ AJOUT : Protection contre les erreurs non gérées
    process.on('uncaughtException', (error) => {
        logger.error('Erreur non gérée (uncaughtException):', error);
        // Ne pas faire process.exit() pour maintenir le service
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Promise rejetée non gérée:', reason);
        logger.error('Promise:', promise);
        // Ne pas faire process.exit() pour maintenir le service
    });

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

    try {
        await gateway.init();
        
        // ✅ AJOUT : Démarrer la surveillance de santé globale
        gateway.startHealthCheck();
        
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
