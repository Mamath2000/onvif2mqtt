const OnvifCamera = require('./onvifCamera');
const logger = require('../utils/logger');

class OnvifManager {
    constructor() {
        this.cameras = new Map();
        this.statusUpdateInterval = null;
    }

    addCamera(config) {
        const camera = new OnvifCamera(config);
        this.cameras.set(config.name, camera);
        logger.info(`Caméra ajoutée: ${config.name}`);
        return camera;
    }

    removeCamera(name) {
        const camera = this.cameras.get(name);
        if (camera) {
            camera.disconnect();
            this.cameras.delete(name);
            logger.info(`Caméra supprimée: ${name}`);
            return true;
        }
        return false;
    }

    async connectAllCameras() {
        const connectionPromises = Array.from(this.cameras.values()).map(camera => 
            camera.connect()
        );
        
        const results = await Promise.allSettled(connectionPromises);
        
        results.forEach((result, index) => {
            const camera = Array.from(this.cameras.values())[index];
            if (result.status === 'fulfilled' && result.value) {
                logger.info(`Connexion réussie: ${camera.name}`);
            } else {
                logger.error(`Échec de connexion: ${camera.name}`);
            }
        });

        return results;
    }

    async connectCamera(name) {
        const camera = this.cameras.get(name);
        if (camera) {
            return await camera.connect();
        }
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
    async moveCameraPTZ(name, direction, speed = 0.5) {
        const camera = this.cameras.get(name);
        if (!camera || !camera.isConnected) {
            return false;
        }

        switch (direction.toLowerCase()) {
            case 'up':
                return await camera.moveUp(speed);
            case 'down':
                return await camera.moveDown(speed);
            case 'left':
                return await camera.moveLeft(speed);
            case 'right':
                return await camera.moveRight(speed);
            case 'zoom_in':
                return await camera.zoomIn(speed);
            case 'zoom_out':
                return await camera.zoomOut(speed);
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
        if (camera && camera.isConnected) {
            return await camera.getPtzPresets();
        }
        return [];
    }

    async gotoCameraPreset(name, presetToken) {
        const camera = this.cameras.get(name);
        if (camera && camera.isConnected) {
            return await camera.gotoPreset(presetToken);
        }
        return false;
    }

    // Découverte automatique des caméras ONVIF
    async discoverCameras(timeout = 5000) {
        try {
            logger.info('Recherche de caméras ONVIF sur le réseau...');
            
            const onvif = require('onvif');
            const devices = await new Promise((resolve, reject) => {
                const foundDevices = [];
                
                const discovery = onvif.startProbe();
                
                discovery.on('device', (cam, rinfo, xml) => {
                    foundDevices.push({
                        address: rinfo.address,
                        port: 80,
                        name: `Camera_${rinfo.address}`,
                        xaddr: cam.xaddrs[0]
                    });
                });

                discovery.on('error', (error) => {
                    reject(error);
                });

                setTimeout(() => {
                    discovery.stop();
                    resolve(foundDevices);
                }, timeout);
            });

            logger.info(`${devices.length} caméras ONVIF découvertes`);
            return devices;
            
        } catch (error) {
            logger.error('Erreur lors de la découverte des caméras:', error);
            return [];
        }
    }

    // Démarrer la surveillance périodique des statuts
    startStatusMonitoring(intervalMs = 30000, onStatusUpdate = null) {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }

        this.statusUpdateInterval = setInterval(async () => {
            const statuses = this.getAllCameraStatuses();
            logger.debug('Mise à jour des statuts des caméras');
            
            if (onStatusUpdate) {
                onStatusUpdate(statuses);
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
            camera.disconnect();
        });
        this.stopStatusMonitoring();
        logger.info('Toutes les caméras ont été déconnectées');
    }
}

module.exports = OnvifManager;
