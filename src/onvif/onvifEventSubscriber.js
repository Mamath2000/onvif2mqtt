const logger = require('../utils/logger');

/**
 * Classe pour gérer les abonnements aux événements ONVIF via Pull Point Subscription
 * Inspirée du dépôt dmitrif/onvif2mqtt
 */
class OnvifEventSubscriber {
    constructor(camera, eventCallback) {
        this.camera = camera;
        this.eventCallback = eventCallback;
        this.subscription = null;
        this.pullInterval = null;
        this.isSubscribed = false;
        this.pullTimeout = 60000;
        this.pullIntervalMs = 1000;
        this.isResubscribing = false;
        this.onEventsError = null;

        const cfg = camera && camera.globalConfig;

        // ✅ Résoudre une fois la liste des types autorisés
        const configuredTypes = (camera && camera.eventTypes) 
            ? camera.eventTypes 
            : (cfg ? cfg.get('events.default_event_types', 'all') : 'all');

        this.allowedEventTypes = this.parseEventTypes(configuredTypes); // null => all
        logger.debug(`Types d'événements autorisés pour ${camera?.name}: ${this.allowedEventTypes ? this.allowedEventTypes.join(', ') : 'all'}`);
    }

    /**
     * Créer un Pull Point Subscription pour recevoir les événements
     */
    async subscribe() {
        if (this.isSubscribed || !this.camera.device || !this.camera.isConnected) {
            logger.debug(`Impossible de s'abonner aux événements pour ${this.camera.name}`);
            return false;
        }

        try {
            logger.info(`Création d'un Pull Point Subscription pour ${this.camera.name}`);

            // Créer le Pull Point Subscription et écouter les événements
            // La bibliothèque ONVIF gère automatiquement le polling interne
            const self = this;
            
            this.camera.device.createPullPointSubscription(function(err, subscription, xml) {
                if (err) {
                    logger.error(`❌ Erreur création Pull Point Subscription ${self.camera.name}:`, err.message || err.toString());
                    self.isSubscribed = false;
                    
                    // Si la caméra ne supporte pas les événements, ne pas réessayer
                    if (err.message && (err.message.includes('not supported') || err.message.includes('Not Implemented'))) {
                        logger.warn(`⚠️  La caméra ${self.camera.name} ne supporte pas les événements ONVIF`);
                    }
                    return;
                }

                self.subscription = subscription;
                self.isSubscribed = true;
                logger.info(`✅ Pull Point Subscription créé avec succès pour ${self.camera.name}`);

                // Écouter les événements - la bibliothèque ONVIF gère le polling automatiquement
                // IMPORTANT: Utiliser une fonction traditionnelle, pas une arrow function
                // La bibliothèque onvif utilise callback.call() qui ne fonctionne pas avec les arrow functions
                self.camera.device.on('event', function(camMessage) {
                    if (self && self.processEvent) {
                        self.processEvent.call(self, camMessage);
                    }
                });

                logger.info(`📡 Écoute des événements activée pour ${self.camera.name}`);

                // La bibliothèque ONVIF renouvelle elle-même la souscription (Renew)
                // à chaque cycle de pull interne. On ne réagit qu'aux vrais échecs
                // remontés par la lib, pas à une simple absence de détection.
                self.watchEventsError();
            });

            return true;

        } catch (error) {
            logger.error(`❌ Exception lors de la souscription ${this.camera.name}:`, error.message || error.toString());
            this.isSubscribed = false;
            return false;
        }
    }



    /**
     * Traiter un événement reçu (format direct de la bibliothèque ONVIF)
     */
    processEvent(camMessage) {
        try {
            // Format du message: camMessage.topic et camMessage.message
            if (!camMessage || !camMessage.topic || !camMessage.message) {
                return;
            }

            const topic = camMessage.topic;
            const message = camMessage.message;

            // Extraire les données de l'événement
            const data = message.message && message.message.data ? message.message.data.simpleItem : null;

            if (!data) {
                return;
            }

            // Convertir les simpleItems en objet
            const eventData = this.simpleItemsToObject(Array.isArray(data) ? data : [data]);
            
            // Déterminer le type d'événement depuis le topic
            const eventType = this.determineEventType(camMessage);

            if (eventType) {
                // Filtrage par configuration: ignorer les événements non autorisés pour cette caméra
                if (!this.isEventAllowed(eventType)) {
                    return;
                }
                // Événement IA TP-Link : décomposer en événements spécifiques
                if (eventType === 'smart_event') {
                    this.processTPLinkSmartEvent(eventData);
                } else {
                    logger.debug(`Événement ${eventType} reçu pour ${this.camera.name}:`, eventData);
                    
                    // Appeler le callback avec les informations de l'événement
                    if (this.eventCallback) {
                        this.eventCallback(this.camera.name, eventType, eventData);
                    }
                }
            }

        } catch (error) {
            logger.error(`Erreur lors du traitement de l'événement pour ${this.camera.name}:`, error);
        }
    }

    /**
     * Convertir les simpleItems en objet JavaScript
     */
    simpleItemsToObject(items) {
        return items.reduce((out, item) => {
            if (item.$ && item.$.Name && item.$.Value !== undefined) {
                out[item.$.Name] = item.$.Value;
            }
            return out;
        }, {});
    }

    /**
     * Traiter un événement IA TP-Link (TPSmartEvent)
     * Ces événements contiennent des propriétés comme IsPeople, IsVehicle, IsPet
     */
    processTPLinkSmartEvent(eventData) {
        logger.debug(`Événement IA TP-Link reçu pour ${this.camera.name}:`, eventData);
        if (!this.eventCallback) return;

        if (eventData.IsPeople !== undefined && this.isEventAllowed('people')) {
            const peopleState = eventData.IsPeople === 'true' || eventData.IsPeople === true;
            logger.debug(`  → Détection de personne: ${peopleState}`);
            this.eventCallback(this.camera.name, 'people', { State: peopleState, IsPeople: peopleState });
        }

        if (eventData.IsVehicle !== undefined && this.isEventAllowed('vehicle')) {
            const vehicleState = eventData.IsVehicle === 'true' || eventData.IsVehicle === true;
            logger.debug(`  → Détection de véhicule: ${vehicleState}`);
            this.eventCallback(this.camera.name, 'vehicle', { State: vehicleState, IsVehicle: vehicleState });
        }

        if (eventData.IsPet !== undefined && this.isEventAllowed('pet')) {
            const petState = eventData.IsPet === 'true' || eventData.IsPet === true;
            logger.debug(`  → Détection d'animal: ${petState}`);
            this.eventCallback(this.camera.name, 'pet', { State: petState, IsPet: petState });
        }
    }

    /**
     * Déterminer le type d'événement à partir du message
     */
    determineEventType(camMessage) {
        try {
            const topic = camMessage.topic;
            if (!topic || !topic._) {
                return null;
            }

            const topicString = topic._;
            
            // Extraire le type d'événement depuis le topic (format: namespace:eventType)
            const [namespace, eventPath] = topicString.split(':');

            // Mapping des topics ONVIF vers des types d'événements
            const eventMappings = {
                // Détection de mouvement standard
                'RuleEngine/MotionRegionDetector/Motion': 'motion',
                'RuleEngine/MotionRegionDetector/Motion//.': 'motion',
                'RuleEngine/CellMotionDetector/Motion': 'motion',
                'RuleEngine/CellMotionDetector/Motion//.': 'motion',
                'VideoSource/MotionAlarm': 'motion',
                'VideoSoure/MotionAlarm': 'motion', // Typo parfois présent
                
                // Événements IA TP-Link
                'RuleEngine/PeopleDetector/People': 'people',
                'RuleEngine/PeopleDetector/People//.': 'people',
                'RuleEngine/LineCrossDetector/LineCross': 'line_crossing',
                'RuleEngine/LineCrossDetector/LineCross//.': 'line_crossing',
                'RuleEngine/TPSmartEventDetector/TPSmartEvent': 'smart_event', // Événement IA TP-Link générique
                
                // Autres événements
                'RuleEngine/TamperDetector/Tamper': 'tamper',
                'RuleEngine/FieldDetector/ObjectsInside': 'field_detection',
                'Device/Trigger/DigitalInput': 'digital_input',
                'RuleEngine/LineDetector/Crossed': 'line_crossing',
            };

            // Chercher une correspondance dans les mappings
            for (const [topicPattern, eventType] of Object.entries(eventMappings)) {
                if (eventPath && eventPath.includes(topicPattern)) {
                    return eventType;
                }
            }

            logger.debug(`Type d'événement non reconnu pour ${this.camera.name}: ${topicString}`);
            return 'unknown';

        } catch (error) {
            logger.error(`Erreur lors de la détermination du type d'événement:`, error);
            return null;
        }
    }

    /**
     * Se désabonner des événements
     */
    async unsubscribe() {
        if (this.camera && this.camera.device) {
            // Retirer les écouteurs d'événements
            this.camera.device.removeAllListeners('event');
            if (this.onEventsError) {
                this.camera.device.removeListener('eventsError', this.onEventsError);
                this.onEventsError = null;
            }
        }

        if (this.subscription) {
            try {
                // Tenter de se désabonner proprement
                await new Promise((resolve, reject) => {
                    if (this.subscription.unsubscribe && typeof this.subscription.unsubscribe === 'function') {
                        this.subscription.unsubscribe((err) => {
                            if (err) {
                                logger.debug(`Avertissement désabonnement ${this.camera.name}:`, err.message || '');
                            }
                            resolve();
                        });
                    } else {
                        // Pas de méthode unsubscribe disponible
                        resolve();
                    }
                });

                logger.info(`Désabonnement réussi pour ${this.camera.name}`);
            } catch (error) {
                logger.debug(`Note: désabonnement ${this.camera.name}:`, error.message || '');
            }

            this.subscription = null;
        }

        this.isSubscribed = false;
    }

    /**
     * Vérifier si l'abonnement est actif
     */
    isActive() {
        return this.isSubscribed && this.subscription !== null;
    }

    // Déterminer si un type d'événement est autorisé pour cette caméra selon la configuration
    isEventAllowed(eventType) {
        try {
            if (this.allowedEventTypes === null) return true; // 'all'
            return this.allowedEventTypes.includes(eventType);
        } catch {
            return true;
        }
    }

    parseEventTypes(types) {
        if (!types) return null; // considérer comme 'all'
        if (Array.isArray(types)) {
            return types.map(t => String(t).trim()).filter(Boolean);
        }
        const s = String(types).trim();
        if (s.length === 0 || s.toLowerCase() === 'all') return null; // 'all'
        return s.split(',').map(t => t.trim()).filter(Boolean);
    }

    // =========================
    // Réabonnement sur échec réel (pas sur simple silence)
    // =========================
    // La lib `onvif` gère un long-poll + Renew SOAP en interne à chaque cycle
    // (voir node_modules/onvif/lib/events.js: _eventPull -> renew()), donc
    // l'abonnement reste vivant tant qu'aucune erreur n'est remontée, même
    // sans détection. Les erreurs réseau transitoires (ECONNREFUSED, ECONNRESET,
    // ETIMEDOUT, ENETUNREACH) sont déjà retentées par la lib elle-même
    // (_restartEventRequest) ; on ne force un réabonnement complet que pour
    // les autres erreurs, qui font mourir la boucle interne de pull.
    watchEventsError() {
        if (this.onEventsError || !this.camera || !this.camera.device) return;

        const retryableCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'];

        this.onEventsError = async (error) => {
            const code = error && error.code;
            if (retryableCodes.includes(code)) {
                logger.debug(`Erreur événements transitoire pour ${this.camera.name} (${code}), la lib ONVIF gère la reprise`);
                return;
            }

            if (this.isResubscribing) return;
            this.isResubscribing = true;
            logger.warn(`🔄 Échec du flux d'événements ONVIF pour ${this.camera.name} (${error && error.message || error}), réabonnement...`);
            try {
                await this.unsubscribe();
                // petite pause pour éviter thrash
                await new Promise(r => setTimeout(r, 250));
                const ok = await this.subscribe();
                if (ok) {
                    logger.info(`✅ Réabonnement aux événements réussi pour ${this.camera.name}`);
                } else {
                    logger.warn(`⚠️ Réabonnement aux événements échoué pour ${this.camera.name}`);
                }
            } catch (e) {
                logger.error(`Erreur lors du réabonnement des événements pour ${this.camera.name}:`, e);
            } finally {
                this.isResubscribing = false;
            }
        };

        this.camera.device.on('eventsError', this.onEventsError);
    }
}

module.exports = OnvifEventSubscriber;
