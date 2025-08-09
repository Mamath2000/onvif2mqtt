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
    }

    async connect() {
        try {
            logger.info(`Connexion à la caméra ONVIF: ${this.name} (${this.host}:${this.port})`);
            
            this.device = new onvif.OnvifDevice({
                xaddr: `http://${this.host}:${this.port}/onvif/device_service`,
                user: this.username,
                pass: this.password
            });

            await this.device.init();
            this.isConnected = true;
            
            // Récupérer les informations de la caméra
            await this.getDeviceInformation();
            await this.getProfiles();
            await this.getCapabilities();
            
            logger.info(`Caméra connectée: ${this.name}`);
            return true;
        } catch (error) {
            logger.error(`Erreur lors de la connexion à la caméra ${this.name}:`, error);
            this.isConnected = false;
            return false;
        }
    }

    async getDeviceInformation() {
        try {
            const info = await this.device.getDeviceInformation();
            this.deviceInfo = info;
            logger.debug(`Informations de la caméra ${this.name}:`, info);
            return info;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des informations de ${this.name}:`, error);
            return null;
        }
    }

    async getProfiles() {
        try {
            const profiles = await this.device.getProfiles();
            this.profiles = profiles;
            logger.debug(`Profils disponibles pour ${this.name}:`, profiles.length);
            return profiles;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des profils de ${this.name}:`, error);
            return [];
        }
    }

    async getCapabilities() {
        try {
            const capabilities = await this.device.getCapabilities();
            this.capabilities = capabilities;
            logger.debug(`Capacités de la caméra ${this.name}:`, Object.keys(capabilities));
            return capabilities;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des capacités de ${this.name}:`, error);
            return null;
        }
    }

    async getStreamUri(profileIndex = 0) {
        try {
            if (this.profiles.length === 0) {
                throw new Error('Aucun profil disponible');
            }

            const profile = this.profiles[profileIndex];
            const streamUri = await this.device.getStreamUri({
                protocol: 'RTSP',
                ProfileToken: profile.$.token
            });

            logger.debug(`URI de stream pour ${this.name}:`, streamUri.uri);
            return streamUri.uri;
        } catch (error) {
            logger.error(`Erreur lors de la récupération de l'URI de stream pour ${this.name}:`, error);
            return null;
        }
    }

    async getSnapshot(profileIndex = 0) {
        try {
            if (this.profiles.length === 0) {
                throw new Error('Aucun profil disponible');
            }

            const profile = this.profiles[profileIndex];
            const snapshotUri = await this.device.getSnapshotUri({
                ProfileToken: profile.$.token
            });

            logger.debug(`URI de snapshot pour ${this.name}:`, snapshotUri.uri);
            
            // Télécharger l'image
            const response = await fetch(snapshotUri.uri);
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const imageBuffer = await response.buffer();
            return imageBuffer;
        } catch (error) {
            logger.error(`Erreur lors de la capture d'image pour ${this.name}:`, error);
            return null;
        }
    }

    // Fonctions PTZ (Pan-Tilt-Zoom)
    async moveUp(speed = 0.5) {
        return this.ptzMove({ y: speed });
    }

    async moveDown(speed = 0.5) {
        return this.ptzMove({ y: -speed });
    }

    async moveLeft(speed = 0.5) {
        return this.ptzMove({ x: -speed });
    }

    async moveRight(speed = 0.5) {
        return this.ptzMove({ x: speed });
    }

    async zoomIn(speed = 0.5) {
        return this.ptzMove({ zoom: speed });
    }

    async zoomOut(speed = 0.5) {
        return this.ptzMove({ zoom: -speed });
    }

    async ptzMove(direction, profileIndex = 0) {
        try {
            if (!this.capabilities || !this.capabilities.PTZ) {
                throw new Error('PTZ non supporté par cette caméra');
            }

            const profile = this.profiles[profileIndex];
            const params = {
                ProfileToken: profile.$.token,
                Velocity: {
                    x: direction.x || 0,
                    y: direction.y || 0,
                    zoom: direction.zoom || 0
                }
            };

            await this.device.ptzMove(params);
            logger.debug(`Mouvement PTZ exécuté pour ${this.name}:`, direction);
            return true;
        } catch (error) {
            logger.error(`Erreur lors du mouvement PTZ pour ${this.name}:`, error);
            return false;
        }
    }

    async ptzStop(profileIndex = 0) {
        try {
            const profile = this.profiles[profileIndex];
            await this.device.ptzStop({
                ProfileToken: profile.$.token,
                PanTilt: true,
                Zoom: true
            });
            logger.debug(`Arrêt PTZ pour ${this.name}`);
            return true;
        } catch (error) {
            logger.error(`Erreur lors de l'arrêt PTZ pour ${this.name}:`, error);
            return false;
        }
    }

    // Presets PTZ
    async getPtzPresets(profileIndex = 0) {
        try {
            const profile = this.profiles[profileIndex];
            const presets = await this.device.getPtzPresets({
                ProfileToken: profile.$.token
            });
            return presets;
        } catch (error) {
            logger.error(`Erreur lors de la récupération des presets pour ${this.name}:`, error);
            return [];
        }
    }

    async gotoPreset(presetToken, profileIndex = 0) {
        try {
            const profile = this.profiles[profileIndex];
            await this.device.ptzGotoPreset({
                ProfileToken: profile.$.token,
                PresetToken: presetToken
            });
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
            deviceInfo: this.deviceInfo
        };
    }

    disconnect() {
        this.isConnected = false;
        logger.info(`Caméra déconnectée: ${this.name}`);
    }
}

module.exports = OnvifCamera;
