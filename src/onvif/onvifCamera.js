const onvif = require('onvif');
const logger = require('../utils/logger');

class OnvifCamera {
    constructor(config) {
        this.name = config.name;
        this.host = config.host;
        this.port = config.port || 80;
        this.username = config.username;
        this.password = config.password;
        this.device = null;
        this.isConnected = false;
        this.profiles = [];
        this.capabilities = null;
        this.presets = {};
        this.isConnecting = false; // Ajout d'un état de connexion en cours
    }

    async connect() {
        if (this.isConnecting) {
            logger.debug(`Connexion déjà en cours pour ${this.name}`);
            return false;
        }
        if (this.isConnected) {
            logger.debug(`Connexion déjà établie pour ${this.name}`);
            return false;
        }

        this.isConnecting = true;
        
        try {
            logger.info(`Connexion à la caméra ONVIF: ${this.name} (${this.host}:${this.port})`);
            
            // Nettoyer l'état précédent
            this.isConnected = false;
            this.device = null;
            
            const timeout = parseInt(process.env.ONVIF_TIMEOUT) || 10000;

            // Créer le device ONVIF
            this.device = new onvif.Cam({
                hostname: this.host,
                username: this.username,
                password: this.password,
                port: this.port,
                timeout: timeout
            });

            // Initialiser la connexion
            await new Promise((resolve, reject) => {
                this.device.connect((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            this.isConnected = true;

            // ✅ CORRECTION : Appeler fetchDeviceDetail au lieu de getDeviceInformation
            await this.fetchDeviceInformation();
            await this.refreshCapabilities();

            logger.info(`Caméra connectée: ${this.name}`);
            return true;
            
        } catch (error) {
            logger.error(`Erreur lors de la connexion à la caméra ${this.name}:`, error);
            this.isConnected = false;
            this.device = null;
            return false;
        } finally {
            this.isConnecting = false;
        }
    }

    async refreshCapabilities() {
        try {
            await this.fetchCapabilities();
            await this.fetchProfiles();
            await this.fetchPtzPresets();

        } catch (e) {
            logger.error({ message: `Refresh capabilities failed ${this.name}`, stack: e.stack });
            this.isConnected = false;
        }
    }

    async fetchDeviceInformation() {
        try {
            const info = await new Promise((resolve, reject) => {
                this.device.getDeviceInformation((err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            this.deviceInfo = info;
            logger.debug(`Informations de la caméra ${this.name}:`, info);
            return info;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des informations de ${this.name}:`, error);
            return null;
        }
    }

    async fetchProfiles() {
        try {
            const profiles = await new Promise((resolve, reject) => {
                this.device.getProfiles((err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
            this.profiles = profiles;
            logger.debug(`Profils disponibles pour ${this.name}:`, profiles.length);
            return profiles;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des profils de ${this.name}:`, error);
            return [];
        }
    }

    async fetchCapabilities() {
        try {
            const capabilities = await new Promise((resolve, reject) => {
                this.device.getCapabilities((err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
            this.capabilities = capabilities;
            
            // Détecter les capacités PTZ
            this.hasPTZ = !!(capabilities && 
                            capabilities.PTZ && 
                            (capabilities.PTZ.XAddr || capabilities.PTZ.XAddrs));
            
            logger.debug(`Capacités de la caméra ${this.name}:`, Object.keys(capabilities));
            logger.info(`PTZ disponible pour ${this.name}: ${this.hasPTZ}`);
            return capabilities;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des capacités de ${this.name}:`, error);
            return null;
        }
    }

    // async getStreamUri(profileIndex = 0) {
    //     try {
    //         if (this.profiles.length === 0) {
    //             throw new Error('Aucun profil disponible');
    //         }

    //         const profile = this.profiles[profileIndex];
    //         const streamUri = await new Promise((resolve, reject) => {
    //             this.device.getStreamUri({
    //                 protocol: 'RTSP',
    //                 profileToken: profileIndex
    //             }, (err, result) => {
    //                 if (err) {
    //                     reject(err);
    //                 } else {
    //                     resolve(result);
    //                 }
    //             });
    //         });

    //         logger.debug(`URI de stream pour ${this.name}:`, streamUri.uri);
    //         return streamUri.uri;
    //     } catch (error) {
    //         logger.error(`Erreur lors de la récupération de l'URI de stream pour ${this.name}:`, error);
    //         return null;
    //     }
    // }

    // async getSnapshot(profileIndex = 0) {
    //     try {
    //         if (this.profiles.length === 0) {
    //             throw new Error('Aucun profil disponible');
    //         }

    //         const profile = this.profiles[profileIndex];
    //         const snapshotUri = await new Promise((resolve, reject) => {
    //             this.device.getSnapshotUri({
    //                 profileToken: profileIndex
    //             }, (err, result) => {
    //                 if (err) {
    //                     reject(err);
    //                 } else {
    //                     resolve(result);
    //                 }
    //             });
    //         });

    //         logger.debug(`URI de snapshot pour ${this.name}:`, snapshotUri.uri);
            
    //         // Télécharger l'image en utilisant fetch ou http
    //         const https = require('https');
    //         const http = require('http');
    //         const url = require('url');
            
    //         return new Promise((resolve, reject) => {
    //             const parsedUrl = url.parse(snapshotUri.uri);
    //             const client = parsedUrl.protocol === 'https:' ? https : http;
                
    //             const request = client.get(snapshotUri.uri, (response) => {
    //                 if (response.statusCode !== 200) {
    //                     reject(new Error(`Erreur HTTP: ${response.statusCode}`));
    //                     return;
    //                 }
                    
    //                 const chunks = [];
    //                 response.on('data', (chunk) => chunks.push(chunk));
    //                 response.on('end', () => {
    //                     const imageBuffer = Buffer.concat(chunks);
    //                     resolve(imageBuffer);
    //                 });
    //             });
                
    //             request.on('error', reject);
    //         });
    //     } catch (error) {
    //         logger.error(`Erreur lors de la capture d'image pour ${this.name}:`, error);
    //         return null;
    //     }
    // }

    // Fonctions PTZ (Pan-Tilt-Zoom)
    async moveUp(speed = 0.5) {
        const moveStep = (parseFloat(process.env.PTZ_MOVE_STEP) || 0.1) * 1.5;
        return this.ptzMove({ y: moveStep });
    }

    async moveDown(speed = 0.5) {
        const moveStep = (parseFloat(process.env.PTZ_MOVE_STEP) || 0.1) * 1.5;
        return this.ptzMove({ y: -moveStep });
    }

    async moveLeft(speed = 0.5) {
        const moveStep = parseFloat(process.env.PTZ_MOVE_STEP) || 0.1;
        return this.ptzMove({ x: -moveStep });
    }

    async moveRight(speed = 0.5) {
        const moveStep = parseFloat(process.env.PTZ_MOVE_STEP) || 0.1;
        return this.ptzMove({ x: moveStep });
    }

    async zoomIn(speed = 0.5) {
        const zoomStep = parseFloat(process.env.PTZ_ZOOM_STEP) || 0.15;
        return this.ptzMove({ zoom: zoomStep });
    }

    async zoomOut(speed = 0.5) {
        const zoomStep = parseFloat(process.env.PTZ_ZOOM_STEP) || 0.15;
        return this.ptzMove({ zoom: -zoomStep });
    }

    async ptzMove(direction, profileIndex = 0) {
        try {
            if (!this.isConnected || !this.device) {
                logger.warn(`Caméra ${this.name} non connectée, impossible d'effectuer le mouvement PTZ`);
                return false;
            }

            if (!this.hasPTZ) {
                logger.warn(`PTZ non supporté par la caméra ${this.name}`);
                return false;
            }

            if (this.profiles.length === 0) {
                logger.warn(`Aucun profil disponible pour ${this.name}`);
                return false;
            }

            const profile = this.profiles[profileIndex];
            
            // ✅ Vérifier que le profil a un token
            if (!profile) {
                logger.error(`Profil invalide ou sans token pour ${this.name}`);
                return false;
            }

            const options = {
                x: direction.x || 0,
                y: direction.y || 0,
                zoom: direction.zoom || 0
            };

            // ✅ CORRECTION : Passer le callback correctement
            await new Promise((resolve, reject) => {
                this.device.relativeMove(options, (err) => {
                    if (err) {
                        logger.error(`Erreur lors du mouvement PTZ pour ${this.name}:`, err);
                        reject(err);
                    } else {
                        logger.debug(`Mouvement PTZ relatif réussi pour ${this.name}`);
                        resolve();
                    }
                });
            });
            return true;
        } catch (error) {
            logger.error(`Erreur lors du mouvement PTZ pour ${this.name}:`, error);
            if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('timeout'))) {
                logger.warn(`Caméra ${this.name} semble déconnectée, marquage comme offline`);
                this.isConnected = false;
            }
            return false;
        }
    }

    // ✅ Corriger aussi ptzStop
    async ptzStop(profileIndex = 0) {
        try {
            if (!this.isConnected || !this.device) {
                logger.warn(`Caméra ${this.name} non connectée, impossible d'arrêter PTZ`);
                return false;
            }

            if (this.profiles.length === 0) {
                logger.warn(`Aucun profil disponible pour ${this.name}`);
                return false;
            }

            const profile = this.profiles[profileIndex];

            await new Promise((resolve, reject) => {
                this.device.stop({}, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.debug(`Arrêt PTZ réussi pour ${this.name}`);
            return true;
        } catch (error) {
            logger.error(`Erreur lors de l'arrêt PTZ pour ${this.name}:`, error);
            return false;
        }
    }

    // Presets PTZ
    async fetchPtzPresets(profileIndex = 0) {
        try {
            // Vérifier si la caméra supporte PTZ
            if (!this.capabilities || !this.capabilities.PTZ) {
                logger.debug(`Caméra ${this.name} ne supporte pas PTZ`);
                this.presets = {};
                return {};
            }

            // Essayer différentes méthodes pour récupérer les presets
            let presets = {};

            try {
                // Méthode 1: getPresets
                presets = await new Promise((resolve, reject) => {
                    if (typeof this.device.getPresets === 'function') {
                        this.device.getPresets((err, result) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(result || {});
                            }
                        });
                    } else {
                        reject(new Error('getPresets non disponible'));
                    }
                });
            } catch (error1) {
                logger.debug(`Méthode getPresets échouée pour ${this.name}:`, error1.message);
                
                try {
                    // Méthode 2: ptzGetPresets
                    presets = await new Promise((resolve, reject) => {
                        if (typeof this.device.ptzGetPresets === 'function') {
                            this.device.ptzGetPresets((err, result) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(result || {});
                                }
                            });
                        } else {
                            reject(new Error('ptzGetPresets non disponible'));
                        }
                    });
                } catch (error2) {
                    logger.debug(`Méthode ptzGetPresets échouée pour ${this.name}:`, error2.message);
                    
                    logger.error(`Erreur lors de la récupération des presets pour ${this.name}:`, error);
                    this.presets = {};
                    return {};
                }
            }

            this.presets = presets;
            logger.debug(`${Object.keys(presets).length} presets trouvés pour ${this.name}`);
            return presets || {};
            
        } catch (error) {
            logger.error(`Erreur lors de la récupération des presets pour ${this.name}:`, error);
            this.presets = {};
            return {};
        }
    }

    async gotoPreset(presetToken, profileIndex = 0) {
        try {
            // Vérifier si la caméra supporte PTZ
            if (!this.capabilities || !this.capabilities.PTZ) {
                throw new Error('PTZ non supporté par cette caméra');
            }

            // Essayer différentes méthodes pour aller au preset
            try {
                // Méthode 1: gotoPreset simple
                await new Promise((resolve, reject) => {
                    if (typeof this.device.gotoPreset === 'function') {
                        this.device.gotoPreset({
                            preset: presetToken
                        }, (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        reject(new Error('gotoPreset non disponible'));
                    }
                });
            } catch (error1) {
                logger.debug(`Méthode gotoPreset échouée pour ${this.name}:`, error1.message);
                
                try {
                    // Méthode 2: ptzGotoPreset
                    await new Promise((resolve, reject) => {
                        if (typeof this.device.ptzGotoPreset === 'function') {
                            this.device.ptzGotoPreset({
                                preset: presetToken
                            }, (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            });
                        } else {
                            reject(new Error('ptzGotoPreset non disponible'));
                        }
                    });
                } catch (error2) {
                    logger.error(`Méthode ptzGotoPreset échouée pour ${this.name}:`, error2.message);
                    return false;
                }
            }
            
            logger.debug(`Preset ${presetToken} activé pour ${this.name}`);
            return true;
        } catch (error) {
            logger.error(`Erreur lors de l'activation du preset pour ${this.name}:`, error);
            return false;
        }
    }

    getStatus() {
        return {
            name: this.name,
            host: this.host,
            port: this.port,
            isConnected: this.isConnected,
            power: this.isConnected,
            status: this.isConnected ? 'online' : 'offline',
            profiles: this.profiles.length,
            hasPTZ: this.capabilities && this.capabilities.PTZ ? true : false,
            deviceInfo: this.deviceInfo,
            presets: this.presets
        };
    }

    disconnect() {
        this.isConnected = false;
        logger.info(`Caméra déconnectée: ${this.name}`);
    }

    // ✅ Amélioration : vérification de santé de la connexion
    async healthCheck() {
        try {
            if (!this.device) {
                this.isConnected = false;
                return false;
            }

            // Test simple : récupérer les capacités
            await new Promise((resolve, reject) => {
                this.device.getCapabilities((err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            this.isConnected = true;
            return true;
        } catch (error) {
            logger.debug(`Health check échoué pour ${this.name}:`, error.message);
            this.isConnected = false;
            return false;
        }
    }
}

module.exports = OnvifCamera;
