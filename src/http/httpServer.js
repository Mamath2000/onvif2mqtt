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
                const cameraName = decodeURIComponent(req.params.name);
                logger.debug(`Récupération des presets pour la caméra: ${cameraName}`);
                
                const presets = await this.onvifManager.getCameraPresets(cameraName);
                
                if (presets === null) {
                    return res.status(404).json({ 
                        error: 'Caméra non trouvée ou non connectée',
                        presets: []
                    });
                }
                
                // Convertir l'objet des presets en tableau pour l'interface web
                if (presets && typeof presets === 'object' && !Array.isArray(presets)) {
                    const presetsArray = Object.entries(presets).map(([name, token]) => ({
                        name: name,
                        token: token,
                        Name: name,  // Compatibilité avec différents formats
                        Token: token
                    }));
                    res.json(presetsArray);
                } else {
                    res.json(presets || []);
                }
            } catch (error) {
                logger.error(`Erreur lors de la récupération des presets:`, error);
                res.status(500).json({ 
                    error: error.message,
                    presets: []
                });
            }
        });

        this.app.post('/api/cameras/:name/presets/:preset', async (req, res) => {
            try {
                const cameraName = decodeURIComponent(req.params.name);
                const presetToken = decodeURIComponent(req.params.preset);
                
                logger.debug(`Activation du preset ${presetToken} pour la caméra: ${cameraName}`);
                
                const success = await this.onvifManager.gotoCameraPreset(cameraName, presetToken);
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

        // Routes pour la configuration PTZ
        this.app.get('/api/ptz/config', (req, res) => {
            try {
                const config = {
                    moveStep: parseFloat(process.env.PTZ_MOVE_STEP) || 0.1,
                    zoomStep: parseFloat(process.env.PTZ_ZOOM_STEP) || 0.15,
                    defaultSpeed: parseFloat(process.env.PTZ_DEFAULT_SPEED) || 0.5
                };
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/ptz/config', (req, res) => {
            try {
                const { moveStep, zoomStep, defaultSpeed } = req.body;
                
                // Validation des valeurs (entre 0.01 et 1.0)
                if (moveStep !== undefined) {
                    const move = parseFloat(moveStep);
                    if (move >= 0.01 && move <= 1.0) {
                        process.env.PTZ_MOVE_STEP = move.toString();
                    } else {
                        return res.status(400).json({ error: 'moveStep doit être entre 0.01 et 1.0' });
                    }
                }
                
                if (zoomStep !== undefined) {
                    const zoom = parseFloat(zoomStep);
                    if (zoom >= 0.01 && zoom <= 1.0) {
                        process.env.PTZ_ZOOM_STEP = zoom.toString();
                    } else {
                        return res.status(400).json({ error: 'zoomStep doit être entre 0.01 et 1.0' });
                    }
                }
                
                if (defaultSpeed !== undefined) {
                    const speed = parseFloat(defaultSpeed);
                    if (speed >= 0.01 && speed <= 1.0) {
                        process.env.PTZ_DEFAULT_SPEED = speed.toString();
                    } else {
                        return res.status(400).json({ error: 'defaultSpeed doit être entre 0.01 et 1.0' });
                    }
                }
                
                const newConfig = {
                    moveStep: parseFloat(process.env.PTZ_MOVE_STEP),
                    zoomStep: parseFloat(process.env.PTZ_ZOOM_STEP),
                    defaultSpeed: parseFloat(process.env.PTZ_DEFAULT_SPEED)
                };
                
                logger.info('Configuration PTZ mise à jour:', newConfig);
                res.json(newConfig);
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
                        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
                        .camera { 
                            border: 1px solid #ddd; 
                            margin: 15px 0; 
                            padding: 20px; 
                            border-radius: 8px; 
                            background-color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .status { 
                            padding: 5px 12px; 
                            border-radius: 15px; 
                            color: white; 
                            font-weight: bold;
                            display: inline-block;
                            margin: 5px 0;
                        }
                        .online { background-color: #28a745; }
                        .offline { background-color: #dc3545; }
                        button { 
                            margin: 3px; 
                            padding: 8px 12px; 
                            cursor: pointer; 
                            border: 1px solid #007bff;
                            background-color: #007bff;
                            color: white;
                            border-radius: 4px;
                            transition: background-color 0.3s;
                        }
                        button:hover { background-color: #0056b3; }
                        button:active { background-color: #004085; }
                        .ptz-controls { 
                            margin: 15px 0; 
                            padding: 15px;
                            background-color: #f8f9fa;
                            border-radius: 8px;
                        }
                        .ptz-grid { 
                            display: grid; 
                            grid-template-columns: repeat(3, 60px); 
                            gap: 5px; 
                            width: fit-content; 
                            margin: 10px 0;
                        }
                        .ptz-grid button { width: 60px; height: 40px; }
                        .presets-section {
                            margin: 15px 0;
                            padding: 15px;
                            background-color: #e9ecef;
                            border-radius: 8px;
                        }
                        .preset-list {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 8px;
                            margin: 10px 0;
                        }
                        .preset-button {
                            background-color: #6c757d;
                            border-color: #6c757d;
                            min-width: 60px;
                        }
                        .preset-button:hover {
                            background-color: #5a6268;
                        }
                        .control-section {
                            margin: 10px 0;
                            display: flex;
                            flex-wrap: wrap;
                            gap: 10px;
                            align-items: center;
                        }
                        .form-section {
                            background-color: white;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 20px 0;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .form-section input {
                            margin: 5px;
                            padding: 8px 12px;
                            border: 1px solid #ced4da;
                            border-radius: 4px;
                            width: 200px;
                        }
                        .loading {
                            opacity: 0.6;
                            pointer-events: none;
                        }
                        .error-message {
                            color: #dc3545;
                            font-size: 14px;
                            margin: 5px 0;
                        }
                    </style>
                </head>
                <body>
                    <h1>ONVIF MQTT Controller</h1>
                    <div id="cameras"></div>
                    
                    <div class="form-section">
                        <h2>➕ Ajouter une caméra</h2>
                        <form id="addCameraForm">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                                <input type="text" placeholder="Nom de la caméra" id="name" required>
                                <input type="text" placeholder="Adresse IP" id="host" required>
                                <input type="number" placeholder="Port (80)" id="port" value="80" min="1" max="65535">
                                <input type="text" placeholder="Nom d'utilisateur" id="username" required>
                                <input type="password" placeholder="Mot de passe" id="password" required>
                            </div>
                            <button type="submit" style="margin-top: 10px;">➕ Ajouter la caméra</button>
                        </form>
                    </div>

                    <div class="form-section">
                        <h2>⚙️ Configuration PTZ</h2>
                        <div id="ptz-config">
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <label for="moveStep">Amplitude mouvement:</label>
                                    <input type="number" id="moveStep" min="0.01" max="1.0" step="0.01" 
                                           style="width: 100%; margin-top: 5px;">
                                    <small style="color: #666;">Déplacement (0.01-1.0)</small>
                                </div>
                                <div>
                                    <label for="zoomStep">Amplitude zoom:</label>
                                    <input type="number" id="zoomStep" min="0.01" max="1.0" step="0.01" 
                                           style="width: 100%; margin-top: 5px;">
                                    <small style="color: #666;">Zoom (0.01-1.0)</small>
                                </div>
                                <div>
                                    <label for="defaultSpeed">Vitesse par défaut:</label>
                                    <input type="number" id="defaultSpeed" min="0.01" max="1.0" step="0.01" 
                                           style="width: 100%; margin-top: 5px;">
                                    <small style="color: #666;">Vitesse générale (0.01-1.0)</small>
                                </div>
                            </div>
                            <div style="text-align: center;">
                                <button onclick="loadPtzConfig()" style="margin-right: 10px;">🔄 Charger</button>
                                <button onclick="savePtzConfig()" style="background-color: #28a745;">💾 Sauvegarder</button>
                            </div>
                            <div id="ptz-status" style="margin-top: 10px; padding: 10px; border-radius: 4px; display: none;"></div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h2>🔍 Découverte automatique</h2>
                        <button onclick="discoverCameras()">🔍 Rechercher des caméras ONVIF</button>
                        <div id="discovered" style="margin-top: 15px;"></div>
                    </div>

                    <script>
                        async function loadCameras() {
                            try {
                                const response = await fetch('/api/cameras');
                                const cameras = await response.json();
                                
                                const container = document.getElementById('cameras');
                                
                                // Traiter chaque caméra
                                const cameraPromises = Object.entries(cameras).map(async ([name, camera]) => {
                                    let presetsHtml = '';
                                    
                                    // Charger les presets si la caméra supporte PTZ
                                    if (camera.hasPTZ && camera.isConnected) {
                                        try {
                                            const presetsResponse = await fetch(\`/api/cameras/\${encodeURIComponent(name)}/presets\`);
                                            const presets = await presetsResponse.json();
                                            
                                            if (presets.length > 0) {
                                                presetsHtml = \`
                                                    <div class="presets-section">
                                                        <h4>🎯 Presets PTZ</h4>
                                                        <div class="preset-list">
                                                            \${presets.map(preset => \`
                                                                <button class="preset-button" 
                                                                        onclick="gotoPreset('\${name}', '\${preset.token || preset.Token}')">
                                                                    \${preset.name || preset.Name || 'Preset ' + (preset.token || preset.Token)}
                                                                </button>
                                                            \`).join('')}
                                                        </div>
                                                        <button onclick="refreshPresets('\${name}')">🔄 Actualiser</button>
                                                    </div>
                                                \`;
                                            } else {
                                                presetsHtml = \`
                                                    <div class="presets-section">
                                                        <h4>🎯 Presets PTZ</h4>
                                                        <p style="color: #6c757d; font-style: italic;">Aucun preset configuré</p>
                                                        <button onclick="refreshPresets('\${name}')">🔄 Actualiser</button>
                                                    </div>
                                                \`;
                                            }
                                        } catch (error) {
                                            console.warn('Erreur lors du chargement des presets pour', name, ':', error);
                                            presetsHtml = \`
                                                <div class="presets-section">
                                                    <h4>🎯 Presets PTZ</h4>
                                                    <p style="color: #dc3545;">Erreur de chargement des presets</p>
                                                    <button onclick="refreshPresets('\${name}')">🔄 Réessayer</button>
                                                </div>
                                            \`;
                                        }
                                    }
                                    
                                    return \`
                                        <div class="camera" id="camera-\${name.replace(/\s+/g, '-')}">
                                            <h3>\${camera.name}</h3>
                                            <div class="control-section">
                                                <span>📍 \${camera.host}:\${camera.port}</span>
                                                <span class="status \${camera.status}">\${camera.status}</span>
                                                <span>📺 \${camera.profiles} profil(s)</span>
                                                <span>🎛️ PTZ: \${camera.hasPTZ ? 'Oui' : 'Non'}</span>
                                            </div>
                                            
                                            <div class="control-section">
                                                <button onclick="getSnapshot('\${name}')">📸 Snapshot</button>
                                                <button onclick="getStream('\${name}')">🎥 Stream</button>
                                                <button onclick="connectCamera('\${name}')">🔌 Reconnecter</button>
                                                \${camera.isConnected ? \`<button onclick="disconnectCamera('\${name}')">⏹️ Déconnecter</button>\` : ''}
                                            </div>
                                            
                                            \${camera.hasPTZ && camera.isConnected ? \`
                                            <div class="ptz-controls">
                                                <h4>🎮 Contrôles PTZ</h4>
                                                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                                                    <div>
                                                        <strong>Direction:</strong>
                                                        <div class="ptz-grid">
                                                            <div></div>
                                                            <button onclick="movePTZ('\${name}', 'up')" title="Haut">↑</button>
                                                            <div></div>
                                                            <button onclick="movePTZ('\${name}', 'left')" title="Gauche">←</button>
                                                            <button onclick="stopPTZ('\${name}')" title="Arrêt">⏹</button>
                                                            <button onclick="movePTZ('\${name}', 'right')" title="Droite">→</button>
                                                            <div></div>
                                                            <button onclick="movePTZ('\${name}', 'down')" title="Bas">↓</button>
                                                            <div></div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <strong>Zoom:</strong><br>
                                                        <button onclick="movePTZ('\${name}', 'zoom_in')" title="Zoom avant">🔍+</button>
                                                        <button onclick="movePTZ('\${name}', 'zoom_out')" title="Zoom arrière">🔍-</button>
                                                    </div>
                                                </div>
                                            </div>
                                            \` : ''}
                                            
                                            \${presetsHtml}
                                        </div>
                                    \`;
                                });
                                
                                const cameraHtmls = await Promise.all(cameraPromises);
                                container.innerHTML = cameraHtmls.join('');
                                
                            } catch (error) {
                                console.error('Erreur lors du chargement des caméras:', error);
                                document.getElementById('cameras').innerHTML = \`
                                    <div class="error-message">
                                        ❌ Erreur lors du chargement des caméras: \${error.message}
                                    </div>
                                \`;
                            }
                        }

                        async function movePTZ(cameraName, direction) {
                            try {
                                const button = event.target;
                                button.classList.add('loading');
                                
                                await fetch(\`/api/cameras/\${encodeURIComponent(cameraName)}/ptz/move\`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ direction })
                                });
                                
                                button.classList.remove('loading');
                            } catch (error) {
                                console.error('Erreur PTZ:', error);
                                alert('Erreur lors du mouvement PTZ: ' + error.message);
                            }
                        }

                        async function stopPTZ(cameraName) {
                            try {
                                const button = event.target;
                                button.classList.add('loading');
                                
                                await fetch(\`/api/cameras/\${encodeURIComponent(cameraName)}/ptz/stop\`, {
                                    method: 'POST'
                                });
                                
                                button.classList.remove('loading');
                            } catch (error) {
                                console.error('Erreur PTZ:', error);
                                alert('Erreur lors de l\\'arrêt PTZ: ' + error.message);
                            }
                        }

                        // Nouvelles fonctions pour les presets
                        async function gotoPreset(cameraName, presetToken) {
                            try {
                                const button = event.target;
                                const originalText = button.textContent;
                                button.textContent = '⏳';
                                button.disabled = true;
                                
                                const response = await fetch(\`/api/cameras/\${encodeURIComponent(cameraName)}/presets/\${encodeURIComponent(presetToken)}\`, {
                                    method: 'POST'
                                });
                                
                                const result = await response.json();
                                
                                if (result.success) {
                                    button.textContent = '✅';
                                    setTimeout(() => {
                                        button.textContent = originalText;
                                        button.disabled = false;
                                    }, 1000);
                                } else {
                                    throw new Error('Échec de l\\'activation du preset');
                                }
                            } catch (error) {
                                console.error('Erreur preset:', error);
                                alert('Erreur lors de l\\'activation du preset: ' + error.message);
                                event.target.textContent = originalText;
                                event.target.disabled = false;
                            }
                        }

                        async function refreshPresets(cameraName) {
                            try {
                                const button = event.target;
                                const originalText = button.textContent;
                                button.textContent = '🔄 Chargement...';
                                button.disabled = true;
                                
                                // Recharger uniquement cette caméra
                                await loadCameraPresets(cameraName);
                                
                                button.textContent = originalText;
                                button.disabled = false;
                            } catch (error) {
                                console.error('Erreur refresh presets:', error);
                                alert('Erreur lors du rafraîchissement: ' + error.message);
                                event.target.textContent = '🔄 Actualiser';
                                event.target.disabled = false;
                            }
                        }

                        async function loadCameraPresets(cameraName) {
                            try {
                                const response = await fetch(\`/api/cameras/\${encodeURIComponent(cameraName)}/presets\`);
                                const presets = await response.json();
                                
                                const cameraElement = document.getElementById(\`camera-\${cameraName.replace(/\s+/g, '-')}\`);
                                const presetsSection = cameraElement.querySelector('.presets-section');
                                
                                if (presetsSection) {
                                    if (presets.length > 0) {
                                        const presetList = presetsSection.querySelector('.preset-list');
                                        presetList.innerHTML = presets.map(preset => \`
                                            <button class="preset-button" 
                                                    onclick="gotoPreset('\${cameraName}', '\${preset.token || preset.Token}')">
                                                \${preset.name || preset.Name || 'Preset ' + (preset.token || preset.Token)}
                                            </button>
                                        \`).join('');
                                    } else {
                                        const presetList = presetsSection.querySelector('.preset-list');
                                        presetList.innerHTML = '<p style="color: #6c757d; font-style: italic; margin: 0;">Aucun preset configuré</p>';
                                    }
                                }
                            } catch (error) {
                                console.error('Erreur lors du chargement des presets:', error);
                                throw error;
                            }
                        }

                        async function disconnectCamera(cameraName) {
                            try {
                                const response = await fetch(\`/api/cameras/\${encodeURIComponent(cameraName)}\`, {
                                    method: 'DELETE'
                                });
                                
                                if (response.ok) {
                                    loadCameras();
                                } else {
                                    throw new Error('Erreur lors de la déconnexion');
                                }
                            } catch (error) {
                                console.error('Erreur déconnexion:', error);
                                alert('Erreur lors de la déconnexion: ' + error.message);
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
                                const button = event.target;
                                const originalText = button.textContent;
                                button.textContent = '🔍 Recherche en cours...';
                                button.disabled = true;
                                
                                const response = await fetch('/api/discover', {
                                    method: 'POST'
                                });
                                const devices = await response.json();
                                
                                const container = document.getElementById('discovered');
                                
                                if (devices.length > 0) {
                                    container.innerHTML = \`
                                        <h3>📹 \${devices.length} caméra(s) découverte(s):</h3>
                                        \${devices.map(device => \`
                                            <div class="camera">
                                                <div class="control-section">
                                                    <span>📍 \${device.address}</span>
                                                    <span>🔗 Port 80</span>
                                                </div>
                                                <p><strong>XADDR:</strong> \${device.xaddr}</p>
                                                <button onclick="addDiscoveredCamera('\${device.address}', '\${device.name}')">
                                                    ➕ Ajouter cette caméra
                                                </button>
                                            </div>
                                        \`).join('')}
                                    \`;
                                } else {
                                    container.innerHTML = \`
                                        <div style="color: #6c757d; font-style: italic; padding: 20px; text-align: center;">
                                            📷 Aucune caméra ONVIF découverte sur le réseau
                                        </div>
                                    \`;
                                }
                                
                                button.textContent = originalText;
                                button.disabled = false;
                            } catch (error) {
                                console.error('Erreur découverte:', error);
                                document.getElementById('discovered').innerHTML = \`
                                    <div class="error-message">
                                        ❌ Erreur lors de la découverte: \${error.message}
                                    </div>
                                \`;
                                event.target.textContent = '🔍 Rechercher des caméras ONVIF';
                                event.target.disabled = false;
                            }
                        }

                        function addDiscoveredCamera(address, suggestedName) {
                            // Pré-remplir le formulaire avec les informations découvertes
                            document.getElementById('name').value = suggestedName || \`Camera \${address}\`;
                            document.getElementById('host').value = address;
                            document.getElementById('port').value = '80';
                            document.getElementById('username').value = 'admin';
                            document.getElementById('password').value = '';
                            
                            // Scroller vers le formulaire
                            document.getElementById('addCameraForm').scrollIntoView({ 
                                behavior: 'smooth' 
                            });
                            
                            // Focus sur le champ mot de passe
                            setTimeout(() => {
                                document.getElementById('password').focus();
                            }, 500);
                        }

                        document.getElementById('addCameraForm').addEventListener('submit', async (e) => {
                            e.preventDefault();
                            
                            const submitButton = e.target.querySelector('button[type="submit"]');
                            const originalText = submitButton.textContent;
                            
                            const formData = {
                                name: document.getElementById('name').value.trim(),
                                host: document.getElementById('host').value.trim(),
                                port: parseInt(document.getElementById('port').value) || 80,
                                username: document.getElementById('username').value.trim(),
                                password: document.getElementById('password').value
                            };

                            // Validation
                            if (!formData.name || !formData.host || !formData.username || !formData.password) {
                                alert('⚠️ Tous les champs sont requis');
                                return;
                            }

                            try {
                                submitButton.textContent = '⏳ Ajout en cours...';
                                submitButton.disabled = true;
                                
                                const response = await fetch('/api/cameras', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(formData)
                                });
                                
                                const result = await response.json();
                                
                                if (result.success) {
                                    submitButton.textContent = '✅ Ajoutée!';
                                    
                                    // Recharger les caméras
                                    await loadCameras();
                                    
                                    // Réinitialiser le formulaire
                                    document.getElementById('addCameraForm').reset();
                                    document.getElementById('port').value = '80'; // Remettre la valeur par défaut
                                    
                                    // Scroller vers la nouvelle caméra
                                    setTimeout(() => {
                                        const newCameraElement = document.getElementById(\`camera-\${formData.name.replace(/\s+/g, '-')}\`);
                                        if (newCameraElement) {
                                            newCameraElement.scrollIntoView({ behavior: 'smooth' });
                                        }
                                    }, 500);
                                } else {
                                    throw new Error(result.error || 'Erreur inconnue');
                                }
                                
                                setTimeout(() => {
                                    submitButton.textContent = originalText;
                                    submitButton.disabled = false;
                                }, 2000);
                                
                            } catch (error) {
                                console.error('Erreur:', error);
                                alert('❌ Erreur lors de l\\'ajout de la caméra: ' + error.message);
                                submitButton.textContent = originalText;
                                submitButton.disabled = false;
                            }
                        });

                        // Fonctions de configuration PTZ
                        async function loadPtzConfig() {
                            try {
                                const response = await fetch('/api/ptz/config');
                                const config = await response.json();
                                
                                document.getElementById('moveStep').value = config.moveStep;
                                document.getElementById('zoomStep').value = config.zoomStep;
                                document.getElementById('defaultSpeed').value = config.defaultSpeed;
                                
                                showPtzStatus('✅ Configuration chargée', 'success');
                            } catch (error) {
                                console.error('Erreur lors du chargement de la config PTZ:', error);
                                showPtzStatus('❌ Erreur lors du chargement: ' + error.message, 'error');
                            }
                        }

                        async function savePtzConfig() {
                            try {
                                const config = {
                                    moveStep: parseFloat(document.getElementById('moveStep').value),
                                    zoomStep: parseFloat(document.getElementById('zoomStep').value),
                                    defaultSpeed: parseFloat(document.getElementById('defaultSpeed').value)
                                };
                                
                                // Validation
                                for (const [key, value] of Object.entries(config)) {
                                    if (isNaN(value) || value < 0.01 || value > 1.0) {
                                        showPtzStatus(\`❌ \${key} doit être entre 0.01 et 1.0\`, 'error');
                                        return;
                                    }
                                }
                                
                                const response = await fetch('/api/ptz/config', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(config)
                                });
                                
                                const result = await response.json();
                                
                                if (response.ok) {
                                    showPtzStatus('✅ Configuration sauvegardée avec succès!', 'success');
                                } else {
                                    showPtzStatus('❌ Erreur: ' + result.error, 'error');
                                }
                            } catch (error) {
                                console.error('Erreur lors de la sauvegarde de la config PTZ:', error);
                                showPtzStatus('❌ Erreur lors de la sauvegarde: ' + error.message, 'error');
                            }
                        }

                        function showPtzStatus(message, type) {
                            const statusDiv = document.getElementById('ptz-status');
                            statusDiv.textContent = message;
                            statusDiv.style.display = 'block';
                            statusDiv.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
                            statusDiv.style.color = type === 'success' ? '#155724' : '#721c24';
                            statusDiv.style.border = type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
                            
                            setTimeout(() => {
                                statusDiv.style.display = 'none';
                            }, 3000);
                        }

                        // Charger les caméras au démarrage
                        loadCameras();
                        
                        // Charger la config PTZ au démarrage
                        loadPtzConfig();
                        
                        // Actualiser toutes les 30 secondes
                        setInterval(loadCameras, 30000);
                        
                        // Ajouter un indicateur de connexion
                        setInterval(async () => {
                            try {
                                const response = await fetch('/health');
                                const health = await response.json();
                                
                                const title = document.querySelector('h1');
                                if (health.status === 'OK') {
                                    title.style.color = '#28a745';
                                } else {
                                    title.style.color = '#dc3545';
                                }
                            } catch (error) {
                                document.querySelector('h1').style.color = '#dc3545';
                            }
                        }, 10000);
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
