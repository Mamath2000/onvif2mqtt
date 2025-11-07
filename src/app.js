const logger = require('./utils/logger');
const ConfigManager = require('./utils/configManager');
const MqttManager = require('./mqtt/mqttManager');
const OnvifManager = require('./onvif/onvifManager');
const HADiscoveryHelper = require('./ha/HADiscoveryHelper');

class OnvifMqttGateway {
    constructor() {
        // Charger la configuration
        this.config = new ConfigManager();

        // Configurer le logger avec la nouvelle configuration
        logger.configure(this.config);

        this.mqttManager = null;
        this.onvifManager = null;
        this.haHelper = null;
        this.isRunning = false;
        this.isDiscoveryEnabled = this.config.get('homeassistant.discovery_enabled', true);
        this.healthCheckInterval = null; // ✅ AJOUT
    this.discoveryRefreshInterval = null; // ✅ Rafraîchissement périodique HA
    }

    async init() {
        try {
            logger.info('🚀 Démarrage de ONVIF2MQTT Gateway...');
            logger.info(`📋 Version: ${process.env.VERSION || 'dev'}`);
            logger.info(`🏠 Mode: ${process.env.NODE_ENV || 'development'}`);

            // Configuration MQTT
            const mqttConfig = {
                brokerUrl: this.config.get('mqtt.broker_url', 'mqtt://localhost:1883'),
                username: this.config.get('mqtt.username'),
                password: this.config.get('mqtt.password'),
                clientId: `${this.config.get('mqtt.client_id', 'onvif-gateway')}-${Math.random().toString().slice(2, 6)}`,
                baseTopic: this.config.get('homeassistant.base_topic', 'onvif2mqtt'),
                deviceName: this.config.get('homeassistant.device_name', 'ONVIF Gateway'),
                deviceId: this.config.get('homeassistant.device_id', 'onvif_gateway')
            };

            logger.info(`🌐 Configuration MQTT: ${mqttConfig.brokerUrl}`);
            logger.info(`📡 Topic de base: ${mqttConfig.baseTopic}`);

            // Initialiser les gestionnaires
            this.onvifManager = new OnvifManager(this.config);
            this.mqttManager = new MqttManager(mqttConfig, this.onvifManager);

            // Configurer les événements MQTT
            // this.mqttManager.on('cameraCommand', this.handleMqttCommand.bind(this));
            this.mqttManager.on('ptzCommand', this.handlePtzCommand.bind(this));

            // Charger les caméras depuis les variables d'environnement
            const cameras = this.getCamerasFromConfig();
            // Se connecter au broker MQTT en passant la liste des caméras
            await this.mqttManager.connect();
            // Ajouter les caméras à l'onvifManager
            cameras.forEach(camConfig => {
                this.onvifManager.addCamera(camConfig);
            });
            // Connecter les caméras et lancer la suite
            await this.connectAndSetupCameras();

            // Publier états initiaux OFF retain pour les événements
            this.onvifManager.publishInitialEventStates(this.mqttManager);

            // Démarrer la surveillance des statuts avec l'intervalle configuré
            // monitoring.status_update_interval est désormais en secondes dans la config
            const updateInterval = this.config.getDurationMs('monitoring.status_update_interval', 30);
            this.onvifManager.startStatusMonitoring(updateInterval, this.onStatusUpdate.bind(this));

            // Configurer les callbacks pour les événements ONVIF
            this.setupEventHandlers();

            // Démarrer la découverte des appareils Home Assistant
            this.haHelper = new HADiscoveryHelper(this.mqttManager, {
                isDiscoveryEnabled: this.isDiscoveryEnabled,
                discoveryPrefix: this.config.get('homeassistant.discovery_prefix', 'homeassistant'),
                baseTopic: mqttConfig.baseTopic
            });
            this.haHelper.publishGatewayDevice(
                mqttConfig.deviceId,
                mqttConfig.deviceName
            );

            // Rafraîchir la découverte Home Assistant toutes les 6h (par défaut)
            const discoveryRefreshInterval = this.config.getDurationMs('homeassistant.discovery_refresh_interval', 21600);
            if (this.discoveryRefreshInterval) {
                clearInterval(this.discoveryRefreshInterval);
            }
            this.discoveryRefreshInterval = setInterval(() => {
                try {
                    this.haHelper.publishGatewayDevice(mqttConfig.deviceId, mqttConfig.deviceName);
                    logger.debug('Publication Home Assistant (gateway device) rafraîchie');
                } catch (e) {
                    logger.warn('Erreur lors du rafraîchissement Home Assistant (gateway): ' + (e && e.message));
                }
            }, discoveryRefreshInterval);

            const cameraStatuses = this.onvifManager.getAllCameraStatuses();
            Object.values(cameraStatuses).forEach(camStatus => {
                this.haHelper.publishCameraDevice(mqttConfig.deviceId, camStatus);
            });

            this.isRunning = true;
            logger.info('✅ Contrôleur ONVIF-MQTT démarré avec succès');
            logger.info('🔗 Connexions établies et prêt à recevoir des commandes');
            logger.info('📡 Surveillance des événements ONVIF activée');

        } catch (error) {
            logger.error('❌ Erreur lors de l\'initialisation:', error);
            throw error;
        }
    }

    getCamerasFromConfig() {
        const cameras = [];
        const camerasConfig = this.config.getCameras();

        logger.info(`🔍 Chargement des caméras depuis la configuration...`);

        for (const [cameraKey, cameraConfig] of Object.entries(camerasConfig)) {
            const name = cameraConfig.name;
            const host = cameraConfig.host;
            const port = cameraConfig.port;
            const username = cameraConfig.username;
            const password = cameraConfig.password;
            const event_types = cameraConfig.event_types; // Récupérer les types d'événements
            const pan_mode = cameraConfig.pan_mode || 'normal'; // Mode pan (hide, normal, inverted)
            const tilt_mode = cameraConfig.tilt_mode || 'normal'; // Mode tilt (hide, normal, inverted)
            const zoom_mode = cameraConfig.zoom_mode || 'normal'; // Mode zoom (hide, normal)

            if (name && host && username && password) {
                cameras.push({
                    name,
                    host,
                    port: parseInt(port) || 80,
                    username,
                    password,
                    event_types: event_types || null, // Ajouter les types d'événements
                    pan_mode: pan_mode,
                    tilt_mode: tilt_mode,
                    zoom_mode: zoom_mode
                });
                logger.info(`📹 Caméra trouvée: ${name} (${host}:${port || 80})`);
            } else {
                logger.warn(`⚠️  Configuration incomplète pour la caméra: ${cameraKey}`);
            }
        }

        logger.info(`📊 Total: ${cameras.length} caméra(s) configurée(s)`);
        return cameras;
    }

    async connectAndSetupCameras() {
        const cameras = this.onvifManager.getAllCameras();
        if (cameras.length > 0) {
            logger.info(`Chargement de ${cameras.length} caméra(s) depuis la configuration`);
            await this.onvifManager.connectAllCameras();

            // Note: La découverte automatique des événements supportés nécessite une version 
            // plus récente de la bibliothèque onvif. Pour l'instant, tous les événements
            // configurés seront tentés, et ceux non supportés seront simplement ignorés.
            const eventsEnabled = this.config.get('events.enabled', true);
            if (eventsEnabled) {
                logger.info('📡 Les événements ONVIF sont activés - souscription aux événements configurés');
            }

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
    // monitoring.health_check_interval en secondes
    const healthCheckInterval = this.config.getDurationMs('monitoring.health_check_interval', 60);

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

        // ✅ AJOUT : Arrêter le rafraîchissement HA
        if (this.discoveryRefreshInterval) {
            clearInterval(this.discoveryRefreshInterval);
            this.discoveryRefreshInterval = null;
        }

        // ✅ AJOUT : Se désabonner des événements ONVIF
        if (this.onvifManager) {
            // Utiliser arrêt propre étendu
            await this.onvifManager.shutdown();
        }

        if (this.mqttManager) {
            this.mqttManager.disconnect();
        }

        logger.info('Gateway ONVIF-MQTT arrêtée');
    }

    /**
     * Configurer les gestionnaires d'événements ONVIF
     */
    setupEventHandlers() {
        // Lire la liste des types d'événements par défaut
        const defaultEventTypesConfig = this.config.get('events.default_event_types', 'all');
        let defaultEnabledEventTypes = [];

        if (defaultEventTypesConfig.toLowerCase() === 'all' || defaultEventTypesConfig.trim() === '') {
            // Si 'all' ou vide, activer tous les types par défaut
            defaultEnabledEventTypes = ['motion', 'tamper', 'people', 'vehicle', 'pet'];
            logger.info('📡 Types d\'événements ONVIF par défaut: tous activés');
        } else {
            // Parser la liste des types (séparés par des virgules)
            defaultEnabledEventTypes = defaultEventTypesConfig.split(',').map(type => type.trim()).filter(type => type.length > 0);
            logger.info(`📡 Types d'événements ONVIF par défaut: ${defaultEnabledEventTypes.join(', ')}`);
        }

        // Construire une map des event_types par caméra
        const cameras = this.config.getCameras();
        const cameraEventTypes = new Map();
        
        for (const [cameraId, cameraConfig] of Object.entries(cameras)) {
            let cameraEvents = defaultEnabledEventTypes;
            
            // Si la caméra a des event_types spécifiques, les utiliser
            if (cameraConfig.event_types) {
                const cameraEventTypesConfig = cameraConfig.event_types;
                if (cameraEventTypesConfig.toLowerCase() === 'all') {
                    cameraEvents = ['motion', 'tamper', 'people', 'vehicle', 'pet'];
                } else {
                    cameraEvents = cameraEventTypesConfig.split(',').map(type => type.trim()).filter(type => type.length > 0);
                }
                logger.info(`  📹 ${cameraId}: ${cameraEvents.join(', ')}`);
            }
            
            cameraEventTypes.set(cameraId, cameraEvents);
        }

        // Fonction helper pour vérifier si un événement est autorisé pour une caméra
        const isEventAllowedForCamera = (cameraName, eventType) => {
            const allowedTypes = cameraEventTypes.get(cameraName);
            if (!allowedTypes) {
                // Si la caméra n'est pas dans la config, utiliser les types par défaut
                return defaultEnabledEventTypes.includes(eventType);
            }
            return allowedTypes.includes(eventType);
        };

        // Enregistrer les callbacks pour tous les types d'événements
        // Le filtrage se fait au niveau du callback

        // Événement de détection de mouvement
        this.onvifManager.onEvent('motion', (cameraName, eventData) => {
            if (isEventAllowedForCamera(cameraName, 'motion')) {
                logger.info(`🚨 Détection de mouvement - Caméra: ${cameraName}`, eventData);
                this.mqttManager.publishCameraEvent(cameraName, 'motion', eventData);
            }
        });

        // Événement de détection de personne (IA TP-Link)
        this.onvifManager.onEvent('people', (cameraName, eventData) => {
            if (isEventAllowedForCamera(cameraName, 'people')) {
                logger.info(`👤 Détection de personne - Caméra: ${cameraName}`, eventData);
                this.mqttManager.publishCameraEvent(cameraName, 'people', eventData);
            }
        });

        // Événement de détection de véhicule (IA TP-Link)
        this.onvifManager.onEvent('vehicle', (cameraName, eventData) => {
            if (isEventAllowedForCamera(cameraName, 'vehicle')) {
                logger.info(`🚗 Détection de véhicule - Caméra: ${cameraName}`, eventData);
                this.mqttManager.publishCameraEvent(cameraName, 'vehicle', eventData);
            }
        });

        // Événement de détection d'animal/pet (IA TP-Link)
        this.onvifManager.onEvent('pet', (cameraName, eventData) => {
            if (isEventAllowedForCamera(cameraName, 'pet')) {
                logger.info(`🐾 Détection d\'animal - Caméra: ${cameraName}`, eventData);
                this.mqttManager.publishCameraEvent(cameraName, 'pet', eventData);
            }
        });

        // Événement de sabotage/altération
        this.onvifManager.onEvent('tamper', (cameraName, eventData) => {
            if (isEventAllowedForCamera(cameraName, 'tamper')) {
                logger.warn(`⚠️  Détection de sabotage - Caméra: ${cameraName}`, eventData);
                this.mqttManager.publishCameraEvent(cameraName, 'tamper', eventData);
            }
        });

        // Gestionnaire pour tous les événements non reconnus (toujours actif)
        this.onvifManager.onEvent('unknown', (cameraName, eventData) => {
            logger.debug(`❓ Événement inconnu - Caméra: ${cameraName}`, eventData);
            this.mqttManager.publishCameraEvent(cameraName, 'unknown', eventData);
        });

        logger.info(`✅ Gestionnaires d\'événements ONVIF configurés avec filtrage par caméra`);
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
        logger.info('🛑 Signal SIGINT reçu, arrêt propre en cours...');
        await gateway.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('🛑 Signal SIGTERM reçu, arrêt propre en cours...');
        await gateway.shutdown();
        process.exit(0);
    });

    try {
        await gateway.init();

        // ✅ AJOUT : Démarrer la surveillance de santé globale
        gateway.startHealthCheck();

        logger.info('🎉 Gateway ONVIF-MQTT démarrée avec succès !');
        logger.info('📞 Passerelle prête à recevoir des commandes MQTT');
    } catch (error) {
        logger.error('💥 Erreur fatale lors du démarrage:', error);
        process.exit(1);
    }
}

// Démarrer l'application si ce fichier est exécuté directement
if (require.main === module) {
    main();
}

module.exports = OnvifMqttGateway;
