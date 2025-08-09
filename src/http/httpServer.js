const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const logger = require('../utils/logger');

class HttpServer {
    constructor(onvifManager, mqttManager) {
        this.app = express();
        this.onvifManager = onvifManager;
        this.mqttManager = mqttManager;
        this.server = null;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        
        // Middleware de logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    setupRoutes() {
        // Route de santé
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                mqtt: this.mqttManager.isConnected,
                cameras: this.onvifManager.getConnectedCameras().length
            });
        });

        // Routes des caméras
        this.app.get('/api/cameras', (req, res) => {
            const cameras = this.onvifManager.getAllCameraStatuses();
            res.json(cameras);
        });

        this.app.get('/api/cameras/:name', (req, res) => {
            const status = this.onvifManager.getCameraStatus(req.params.name);
            if (status) {
                res.json(status);
            } else {
                res.status(404).json({ error: 'Caméra non trouvée' });
            }
        });

        this.app.post('/api/cameras/:name/connect', async (req, res) => {
            try {
                const success = await this.onvifManager.connectCamera(req.params.name);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Routes PTZ
        this.app.post('/api/cameras/:name/ptz/move', async (req, res) => {
            try {
                const { direction, speed = 0.5 } = req.body;
                const success = await this.onvifManager.moveCameraPTZ(req.params.name, direction, speed);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/cameras/:name/ptz/stop', async (req, res) => {
            try {
                const success = await this.onvifManager.stopCameraPTZ(req.params.name);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/cameras/:name/presets', async (req, res) => {
            try {
                const presets = await this.onvifManager.getCameraPresets(req.params.name);
                res.json(presets);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/cameras/:name/presets/:preset', async (req, res) => {
            try {
                const success = await this.onvifManager.gotoCameraPreset(req.params.name, req.params.preset);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route pour les snapshots
        this.app.get('/api/cameras/:name/snapshot', async (req, res) => {
            try {
                const image = await this.onvifManager.getCameraSnapshot(req.params.name);
                if (image) {
                    res.set('Content-Type', 'image/jpeg');
                    res.send(image);
                } else {
                    res.status(404).json({ error: 'Impossible de capturer l\'image' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route pour les streams
        this.app.get('/api/cameras/:name/stream', async (req, res) => {
            try {
                const streamUri = await this.onvifManager.getCameraStreamUri(req.params.name);
                if (streamUri) {
                    res.json({ streamUri });
                } else {
                    res.status(404).json({ error: 'Stream non disponible' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route de découverte
        this.app.post('/api/discover', async (req, res) => {
            try {
                const devices = await this.onvifManager.discoverCameras();
                res.json(devices);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route pour ajouter une caméra
        this.app.post('/api/cameras', async (req, res) => {
            try {
                const { name, host, port, username, password } = req.body;
                
                if (!name || !host || !username || !password) {
                    return res.status(400).json({ 
                        error: 'Paramètres requis: name, host, username, password' 
                    });
                }

                const camera = this.onvifManager.addCamera({
                    name,
                    host,
                    port: port || 80,
                    username,
                    password
                });

                const connected = await camera.connect();
                
                if (connected) {
                    // Publier la découverte MQTT pour Home Assistant
                    this.mqttManager.publishCameraDiscovery(camera);
                    this.mqttManager.publishCameraState(camera, camera.getStatus());
                }

                res.json({ 
                    success: connected,
                    camera: camera.getStatus()
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Route pour supprimer une caméra
        this.app.delete('/api/cameras/:name', (req, res) => {
            try {
                const success = this.onvifManager.removeCamera(req.params.name);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Interface web simple
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ONVIF MQTT Controller</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .camera { border: 1px solid #ccc; margin: 10px 0; padding: 15px; border-radius: 5px; }
                        .status { padding: 5px 10px; border-radius: 3px; color: white; }
                        .online { background-color: green; }
                        .offline { background-color: red; }
                        button { margin: 5px; padding: 10px 15px; cursor: pointer; }
                        .ptz-controls { margin: 10px 0; }
                        .ptz-grid { display: grid; grid-template-columns: repeat(3, 60px); gap: 5px; width: fit-content; }
                        .ptz-grid button { width: 60px; height: 40px; }
                    </style>
                </head>
                <body>
                    <h1>ONVIF MQTT Controller</h1>
                    <div id="cameras"></div>
                    
                    <h2>Ajouter une caméra</h2>
                    <form id="addCameraForm">
                        <input type="text" placeholder="Nom" id="name" required>
                        <input type="text" placeholder="Adresse IP" id="host" required>
                        <input type="number" placeholder="Port (80)" id="port" value="80">
                        <input type="text" placeholder="Nom d'utilisateur" id="username" required>
                        <input type="password" placeholder="Mot de passe" id="password" required>
                        <button type="submit">Ajouter</button>
                    </form>

                    <h2>Découverte automatique</h2>
                    <button onclick="discoverCameras()">Rechercher des caméras</button>
                    <div id="discovered"></div>

                    <script>
                        async function loadCameras() {
                            try {
                                const response = await fetch('/api/cameras');
                                const cameras = await response.json();
                                
                                const container = document.getElementById('cameras');
                                container.innerHTML = Object.entries(cameras).map(([name, camera]) => \`
                                    <div class="camera">
                                        <h3>\${camera.name}</h3>
                                        <p>Adresse: \${camera.host}:\${camera.port}</p>
                                        <span class="status \${camera.status}">\${camera.status}</span>
                                        <p>Profils: \${camera.profiles}</p>
                                        <p>PTZ: \${camera.hasPTZ ? 'Oui' : 'Non'}</p>
                                        
                                        <div>
                                            <button onclick="getSnapshot('\${name}')">Snapshot</button>
                                            <button onclick="getStream('\${name}')">Stream</button>
                                            <button onclick="connectCamera('\${name}')">Reconnecter</button>
                                        </div>
                                        
                                        \${camera.hasPTZ ? \`
                                        <div class="ptz-controls">
                                            <h4>Contrôles PTZ</h4>
                                            <div class="ptz-grid">
                                                <div></div>
                                                <button onclick="movePTZ('\${name}', 'up')">↑</button>
                                                <div></div>
                                                <button onclick="movePTZ('\${name}', 'left')">←</button>
                                                <button onclick="stopPTZ('\${name}')">⏹</button>
                                                <button onclick="movePTZ('\${name}', 'right')">→</button>
                                                <div></div>
                                                <button onclick="movePTZ('\${name}', 'down')">↓</button>
                                                <div></div>
                                            </div>
                                            <div>
                                                <button onclick="movePTZ('\${name}', 'zoom_in')">Zoom+</button>
                                                <button onclick="movePTZ('\${name}', 'zoom_out')">Zoom-</button>
                                            </div>
                                        </div>
                                        \` : ''}
                                    </div>
                                \`).join('');
                            } catch (error) {
                                console.error('Erreur lors du chargement des caméras:', error);
                            }
                        }

                        async function movePTZ(cameraName, direction) {
                            try {
                                await fetch(\`/api/cameras/\${cameraName}/ptz/move\`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ direction })
                                });
                            } catch (error) {
                                console.error('Erreur PTZ:', error);
                            }
                        }

                        async function stopPTZ(cameraName) {
                            try {
                                await fetch(\`/api/cameras/\${cameraName}/ptz/stop\`, {
                                    method: 'POST'
                                });
                            } catch (error) {
                                console.error('Erreur PTZ:', error);
                            }
                        }

                        async function getSnapshot(cameraName) {
                            window.open(\`/api/cameras/\${cameraName}/snapshot\`, '_blank');
                        }

                        async function getStream(cameraName) {
                            try {
                                const response = await fetch(\`/api/cameras/\${cameraName}/stream\`);
                                const data = await response.json();
                                if (data.streamUri) {
                                    alert('URI du stream: ' + data.streamUri);
                                }
                            } catch (error) {
                                console.error('Erreur stream:', error);
                            }
                        }

                        async function connectCamera(cameraName) {
                            try {
                                await fetch(\`/api/cameras/\${cameraName}/connect\`, {
                                    method: 'POST'
                                });
                                loadCameras();
                            } catch (error) {
                                console.error('Erreur connexion:', error);
                            }
                        }

                        async function discoverCameras() {
                            try {
                                const response = await fetch('/api/discover', {
                                    method: 'POST'
                                });
                                const devices = await response.json();
                                
                                const container = document.getElementById('discovered');
                                container.innerHTML = devices.map(device => \`
                                    <div class="camera">
                                        <p>Adresse: \${device.address}</p>
                                        <p>XADDR: \${device.xaddr}</p>
                                        <button onclick="alert('Utilisez le formulaire ci-dessus pour ajouter cette caméra')">Ajouter</button>
                                    </div>
                                \`).join('');
                            } catch (error) {
                                console.error('Erreur découverte:', error);
                            }
                        }

                        document.getElementById('addCameraForm').addEventListener('submit', async (e) => {
                            e.preventDefault();
                            
                            const formData = {
                                name: document.getElementById('name').value,
                                host: document.getElementById('host').value,
                                port: parseInt(document.getElementById('port').value),
                                username: document.getElementById('username').value,
                                password: document.getElementById('password').value
                            };

                            try {
                                const response = await fetch('/api/cameras', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(formData)
                                });
                                
                                const result = await response.json();
                                if (result.success) {
                                    loadCameras();
                                    document.getElementById('addCameraForm').reset();
                                } else {
                                    alert('Erreur lors de l\\'ajout de la caméra');
                                }
                            } catch (error) {
                                console.error('Erreur:', error);
                            }
                        });

                        // Charger les caméras au démarrage
                        loadCameras();
                        
                        // Actualiser toutes les 30 secondes
                        setInterval(loadCameras, 30000);
                    </script>
                </body>
                </html>
            `);
        });
    }

    start(port) {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    logger.info(`Serveur HTTP démarré sur le port ${port}`);
                    resolve();
                }
            });
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            logger.info('Serveur HTTP arrêté');
        }
    }
}

module.exports = HttpServer;
