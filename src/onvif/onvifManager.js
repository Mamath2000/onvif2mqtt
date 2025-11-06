const OnvifCamera = require('./onvifCamera');
const logger = require('../utils/logger');

class OnvifManager {
    constructor(config = null) {
        this.cameras = new Map();
        this.statusUpdateInterval = null;
        this.config = config;
        this.eventCallbacks = new Map(); // Callbacks pour les événements
        // État de reconnexion par caméra: { attempts, timer, lastError }
        this.reconnectState = new Map();
    }

    addCamera(config) {
        const camera = new OnvifCamera(config, this.config);
        
        // Configurer le callback pour les événements de cette caméra
        camera.setEventCallback((cameraName, eventType, eventData) => {
            this.handleCameraEvent(cameraName, eventType, eventData);
        });
        
        this.cameras.set(config.name, camera);
        // Initialiser l'état de reconnexion pour cette caméra
        this.reconnectState.set(config.name, { attempts: 0, timer: null, lastError: null });
        logger.info(`Caméra ajoutée: ${config.name}`);
        return camera;
    }

    removeCamera(name) {
        const camera = this.cameras.get(name);
        if (camera) {
            this.cancelReconnection(name);
            camera.disconnect();
            this.cameras.delete(name);
            logger.info(`Caméra supprimée: ${name}`);
            return true;
        }
        return false;
    }

    async connectAllCameras() {
        const connectionPromises = Array.from(this.cameras.values()).map(async camera => {
            try {
                return await camera.connect();
            } catch (error) {
                logger.error(`Erreur de connexion pour ${camera.name}:`, error);
                return false;
            }
        });

        const results = await Promise.allSettled(connectionPromises);

        results.forEach((result, index) => {
            const camera = Array.from(this.cameras.values())[index];
            if (result.status === 'fulfilled' && result.value) {
                logger.info(`Connexion réussie: ${camera.name}`);
                this.resetReconnection(camera.name);
            } else {
                logger.error(`Échec de connexion: ${camera.name} - ${result.reason || 'Raison inconnue'}`);
                // Programmer une reconnexion avec backoff + jitter
                this.scheduleReconnection(camera.name, result.reason || new Error('Connexion initiale échouée'));
            }
        });

        return results;
    }

    async connectCamera(name) {
        const camera = this.cameras.get(name);
        if (camera) {
            const ok = await camera.connect();
            if (ok) {
                this.resetReconnection(name);
            } else {
                this.scheduleReconnection(name, new Error('Échec de connexion'));
            }
            return ok;
        }
        return false;
    }

    // =========================
    // Reconnexion avec backoff + jitter
    // =========================

    getReconnectConfig() {
        const cfg = this.config;
        // Valeurs modernes
        const baseDelayModern = cfg ? cfg.get('network.reconnect.base_delay_ms', undefined) : undefined;
        const maxDelayModern = cfg ? cfg.get('network.reconnect.max_delay_ms', undefined) : undefined;
        const multiplierModern = cfg ? cfg.get('network.reconnect.multiplier', undefined) : undefined;
        const maxRetriesModern = cfg ? cfg.get('network.reconnect.max_retries', undefined) : undefined;
        const jitterModern = cfg ? cfg.get('network.reconnect.jitter', undefined) : undefined;

        // Compatibilité ascendante avec les anciennes clés
        const legacyDelay = cfg ? cfg.get('network.reconnect_delay', undefined) : undefined;
        const legacyMaxRetries = cfg ? cfg.get('network.max_reconnect_attempts', undefined) : undefined;

        return {
            baseDelayMs: baseDelayModern ?? legacyDelay ?? 1000,
            maxDelayMs: maxDelayModern ?? (Math.max(legacyDelay || 0, 30000) || 30000),
            multiplier: multiplierModern ?? 2.0,
            maxRetries: maxRetriesModern ?? (typeof legacyMaxRetries === 'number' ? legacyMaxRetries : 0), // 0 = illimité
            jitter: jitterModern ?? 'full' // 'full' | 'none'
        };
    }

    computeDelayMs(attempt) {
        const { baseDelayMs, maxDelayMs, multiplier, jitter } = this.getReconnectConfig();
        const exp = Math.min(maxDelayMs, Math.floor(baseDelayMs * Math.pow(multiplier, Math.max(0, attempt))));
        if (jitter === 'none') return exp;
        // Full jitter: Uniform[0, exp]
        return Math.floor(Math.random() * (exp + 1));
    }

    scheduleReconnection(name, lastError = null) {
        const camera = this.cameras.get(name);
        if (!camera) return;

        const state = this.reconnectState.get(name) || { attempts: 0, timer: null, lastError: null };

        // Si déjà connecté ou connexion en cours, ne rien programmer
        if (camera.isConnected || camera.isConnecting) {
            return;
        }

        // Ne pas programmer si un timer existe déjà
        if (state.timer) {
            return;
        }

        // Respect du nombre max de tentatives si configuré
        const { maxRetries } = this.getReconnectConfig();
        if (maxRetries > 0 && state.attempts >= maxRetries) {
            logger.error(`❌ Reconnexion abandonnée pour ${name} après ${state.attempts} tentatives`);
            return;
        }

        const delay = this.computeDelayMs(state.attempts);

        logger.warn(`Caméra ${name} déconnectée, tentative de reconnexion dans ${delay}ms (essai #${state.attempts + 1})`);
        const timer = setTimeout(async () => {
            // Marquer le timer comme consommé
            const st = this.reconnectState.get(name) || { attempts: 0 };
            this.reconnectState.set(name, { ...st, timer: null });

            try {
                const ok = await camera.connect();
                if (ok) {
                    logger.info(`✅ Reconnexion réussie pour ${name} après ${st.attempts + 1} tentative(s)`);
                    this.resetReconnection(name);
                } else {
                    const newAttempts = (st.attempts || 0) + 1;
                    this.reconnectState.set(name, { attempts: newAttempts, timer: null, lastError });
                    this.scheduleReconnection(name, lastError);
                }
            } catch (err) {
                const newAttempts = (st.attempts || 0) + 1;
                this.reconnectState.set(name, { attempts: newAttempts, timer: null, lastError: err });
                this.scheduleReconnection(name, err);
            }
        }, delay);

        this.reconnectState.set(name, { ...state, timer, lastError });
    }

    cancelReconnection(name) {
        const state = this.reconnectState.get(name);
        if (state && state.timer) {
            clearTimeout(state.timer);
            this.reconnectState.set(name, { ...state, timer: null });
        }
    }

    resetReconnection(name) {
        const state = this.reconnectState.get(name);
        if (state && state.timer) {
            clearTimeout(state.timer);
        }
        this.reconnectState.set(name, { attempts: 0, timer: null, lastError: null });
    }

    // Méthode de compatibilité: tentative immédiate (maxRetries fois), puis planification si échec
    async attemptReconnection(cameraOrName, maxRetries = 1) {
        const camera = typeof cameraOrName === 'string' ? this.cameras.get(cameraOrName) : cameraOrName;
        if (!camera) return false;

        if (camera.isConnected) return true;
        if (camera.isConnecting) return false;

        let lastErr = null;
        for (let i = 0; i < Math.max(1, maxRetries); i++) {
            try {
                const ok = await camera.connect();
                if (ok) {
                    this.resetReconnection(camera.name);
                    return true;
                }
            } catch (e) {
                lastErr = e;
            }
        }
        // Programmer la suite des tentatives en arrière-plan
        this.scheduleReconnection(camera.name, lastErr || new Error('Échec de reconnexion'));
        return false;
    }

    getCamera(name) {
        return this.cameras.get(name);
    }

    getAllCameras() {
        return Array.from(this.cameras.values());
    }

    getConnectedCameras() {
        return Array.from(this.cameras.values()).filter(camera => camera.isConnected);
    }

    getCameraStatus(name) {
        const camera = this.cameras.get(name);
        return camera ? camera.getStatus() : null;
    }

    getAllCameraStatuses() {
        const statuses = {};
        this.cameras.forEach((camera, name) => {
            statuses[name] = camera.getStatus();
        });
        return statuses;
    }

    async getCameraSnapshot(name, profileIndex = 0) {
        const camera = this.cameras.get(name);
        if (camera && camera.isConnected) {
            return await camera.getSnapshot(profileIndex);
        }
        return null;
    }

    async getCameraStreamUri(name, profileIndex = 0) {
        const camera = this.cameras.get(name);
        if (camera && camera.isConnected) {
            return await camera.getStreamUri(profileIndex);
        }
        return null;
    }

    // Fonctions PTZ
    async moveCameraPTZ(name, direction, speed = null) {
        const camera = this.cameras.get(name);
        if (!camera || !camera.isConnected) {
            return false;
        }

        // Utiliser la vitesse configurée si aucune vitesse n'est spécifiée
        const defaultSpeed = this.config ? this.config.get('ptz.default_speed', 0.5) : 0.5;
        const moveSpeed = speed !== null ? speed : defaultSpeed;

        switch (direction.toLowerCase()) {
            case 'up':
                return await camera.moveUp(moveSpeed);
            case 'down':
                return await camera.moveDown(moveSpeed);
            case 'left':
                return await camera.moveLeft(moveSpeed);
            case 'right':
                return await camera.moveRight(moveSpeed);
            case 'zoom_in':
                return await camera.zoomIn(moveSpeed);
            case 'zoom_out':
                return await camera.zoomOut(moveSpeed);
            default:
                return false;
        }
    }

    async stopCameraPTZ(name) {
        const camera = this.cameras.get(name);
        if (camera && camera.isConnected) {
            return await camera.ptzStop();
        }
        return false;
    }

    async getCameraPresets(name) {
        const camera = this.cameras.get(name);
        if (!camera) {
            logger.warn(`Caméra non trouvée: ${name}`);
            return null;
        }
        if (!camera.isConnected) {
            logger.warn(`Caméra non connectée: ${name}`);
            return [];
        }
        try {
            return await camera.getPtzPresets();
        } catch (error) {
            logger.error(`Erreur lors de la récupération des presets pour ${name}:`, error);
            return [];
        }
    }

    async gotoCameraPreset(name, presetToken) {
        const camera = this.cameras.get(name);
        if (!camera) {
            logger.warn(`Caméra non trouvée: ${name}`);
            return false;
        }
        if (!camera.isConnected) {
            logger.warn(`Caméra non connectée: ${name}`);
            return false;
        }
        try {
            return await camera.gotoPreset(presetToken);
        } catch (error) {
            logger.error(`Erreur lors de l'activation du preset ${presetToken} pour ${name}:`, error);
            return false;
        }
    }


    // Démarrer la surveillance périodique des statuts
    startStatusMonitoring(intervalMs = 30000, onStatusUpdate = null) {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }

        this.statusUpdateInterval = setInterval(async () => {
            try {
                const statuses = this.getAllCameraStatuses();
                
                // ✅ Amélioration : reconnexion seulement des caméras déconnectées
                for (const [name, camera] of this.cameras) {
                    if (!camera.isConnected && !camera.isConnecting) {
                        // Laisser le scheduler gérer le backoff + jitter
                        this.scheduleReconnection(name);
                    }
                }
                
                logger.debug('Surveillance des statuts des caméras effectuée');
                
                if (onStatusUpdate) {
                    onStatusUpdate(statuses);
                }
            } catch (error) {
                logger.error('Erreur lors de la surveillance des statuts:', error);
            }
        }, intervalMs);

        logger.info(`Surveillance des statuts démarrée (intervalle: ${intervalMs}ms)`);
    }

    stopStatusMonitoring() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
            logger.info('Surveillance des statuts arrêtée');
        }
    }

    disconnectAllCameras() {
        this.cameras.forEach(camera => {
            this.cancelReconnection(camera.name);
            camera.disconnect();
        });
        this.stopStatusMonitoring();
        logger.info('Toutes les caméras ont été déconnectées');
    }

    // Arrêt propre: désabonner événements, annuler timers reconnexion, vider maps
    async shutdown() {
        logger.info('Arrêt propre OnvifManager en cours...');
        // Stop interval de statut
        this.stopStatusMonitoring();
        // Désabonner tous les événements
        await this.unsubscribeAllFromEvents();
        // Annuler toutes les reconnexions
        for (const [name] of this.cameras) {
            this.cancelReconnection(name);
        }
        // Déconnecter toutes les caméras
        this.cameras.forEach(camera => camera.disconnect());
        // Nettoyage des structures
        this.cameras.clear();
        this.reconnectState.clear();
        this.eventCallbacks.clear();
        logger.info('OnvifManager arrêté proprement');
    }

    /**
     * Enregistrer un callback pour un type d'événement spécifique
     * @param {string} eventType - Type d'événement (motion, tamper, etc.)
     * @param {function} callback - Fonction callback (cameraName, eventData)
     */
    onEvent(eventType, callback) {
        if (!this.eventCallbacks.has(eventType)) {
            this.eventCallbacks.set(eventType, []);
        }
        this.eventCallbacks.get(eventType).push(callback);
        logger.debug(`Callback enregistré pour les événements de type: ${eventType}`);
    }

    /**
     * Gérer un événement reçu d'une caméra
     */
    handleCameraEvent(cameraName, eventType, eventData) {
        logger.info(`📡 Événement ${eventType} reçu de ${cameraName}:`, eventData);

        // Appeler tous les callbacks enregistrés pour ce type d'événement
        const callbacks = this.eventCallbacks.get(eventType) || [];
        callbacks.forEach(callback => {
            try {
                callback(cameraName, eventData);
            } catch (error) {
                logger.error(`Erreur lors de l'appel du callback pour ${eventType}:`, error);
            }
        });

        // Appeler également les callbacks génériques (tous événements)
        const allCallbacks = this.eventCallbacks.get('*') || [];
        allCallbacks.forEach(callback => {
            try {
                callback(cameraName, eventType, eventData);
            } catch (error) {
                logger.error(`Erreur lors de l'appel du callback générique:`, error);
            }
        });
    }

    /**
     * Souscrire aux événements pour toutes les caméras connectées
     */
    async subscribeAllToEvents() {
        const subscriptionPromises = Array.from(this.cameras.values()).map(async camera => {
            if (camera.isConnected) {
                return await camera.subscribeToEvents();
            }
            return false;
        });

        const results = await Promise.allSettled(subscriptionPromises);
        
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        logger.info(`✅ ${successCount}/${this.cameras.size} caméra(s) abonnée(s) aux événements`);
        
        return results;
    }

    /**
     * Se désabonner des événements pour toutes les caméras
     */
    async unsubscribeAllFromEvents() {
        const unsubscriptionPromises = Array.from(this.cameras.values()).map(async camera => {
            return await camera.unsubscribeFromEvents();
        });

        await Promise.allSettled(unsubscriptionPromises);
        logger.info('Toutes les caméras ont été désabonnées des événements');
    }
}

module.exports = OnvifManager;
