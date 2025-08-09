require('dotenv').config();
const mqtt = require('mqtt');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

class OnvifTestClient {
    constructor() {
        this.mqttClient = null;
        this.isConnected = false;
        this.app = express();
        this.server = null;
        this.currentPresets = {};
        this.setupExpressApp();
    }

    setupExpressApp() {
        this.app.use(bodyParser.json());
        this.app.use(express.static('public'));

        // Interface web simple pour les tests
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ONVIF Test Client</title>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <!-- Bootstrap CSS -->
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                    <!-- Bootstrap Icons -->
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
                    <style>
                        .ptz-grid { max-width: 200px; }
                        .preset-container { max-height: 200px; overflow-y: auto; }
                        .log-container { height: 300px; overflow-y: auto; background-color: #f8f9fa; font-family: 'Courier New', monospace; font-size: 0.875rem; }
                        .status-badge { font-size: 0.875rem; }
                    </style>
                </head>
                <body class="bg-light">
                    <div class="container-fluid py-4">
                        <div class="row">
                            <div class="col-12">
                                <h1 class="display-6 mb-4"><i class="bi bi-camera-video text-primary"></i> ONVIF Test Client</h1>
                                <div id="status-badge" class="mb-4">
                                    <span class="badge bg-danger status-badge"><i class="bi bi-wifi-off"></i> Déconnecté du broker MQTT</span>
                                </div>
                            </div>
                        </div>

                        <div class="row g-4">
                            <!-- Contrôles PTZ -->
                            <div class="col-lg-6">
                                <div class="card h-100">
                                    <div class="card-header bg-primary text-white">
                                        <h5 class="card-title mb-0"><i class="bi bi-joystick"></i> Contrôles PTZ</h5>
                                    </div>
                                    <div class="card-body">
                                        <h6 class="mb-3">Mouvement :</h6>
                                        <div class="d-flex justify-content-center mb-4">
                                            <div class="ptz-grid">
                                                <div class="row g-2">
                                                    <div class="col-4"></div>
                                                    <div class="col-4">
                                                        <button class="btn btn-outline-primary w-100" onclick="sendPtzCommand('move-up')">
                                                            <i class="bi bi-arrow-up"></i>
                                                        </button>
                                                    </div>
                                                    <div class="col-4"></div>
                                                    <div class="col-4">
                                                        <button class="btn btn-outline-primary w-100" onclick="sendPtzCommand('move-left')">
                                                            <i class="bi bi-arrow-left"></i>
                                                        </button>
                                                    </div>
                                                    <div class="col-4">
                                                        <button class="btn btn-danger w-100" onclick="sendPtzCommand('stop')">
                                                            <i class="bi bi-stop-fill"></i>
                                                        </button>
                                                    </div>
                                                    <div class="col-4">
                                                        <button class="btn btn-outline-primary w-100" onclick="sendPtzCommand('move-right')">
                                                            <i class="bi bi-arrow-right"></i>
                                                        </button>
                                                    </div>
                                                    <div class="col-4"></div>
                                                    <div class="col-4">
                                                        <button class="btn btn-outline-primary w-100" onclick="sendPtzCommand('move-down')">
                                                            <i class="bi bi-arrow-down"></i>
                                                        </button>
                                                    </div>
                                                    <div class="col-4"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <h6 class="mb-3">Zoom :</h6>
                                        <div class="d-flex gap-2 justify-content-center">
                                            <button class="btn btn-outline-secondary" onclick="sendPtzCommand('zoom-in')">
                                                <i class="bi bi-zoom-in"></i> Zoom +
                                            </button>
                                            <button class="btn btn-outline-secondary" onclick="sendPtzCommand('zoom-out')">
                                                <i class="bi bi-zoom-out"></i> Zoom -
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Presets -->
                            <div class="col-lg-6">
                                <div class="card h-100">
                                    <div class="card-header bg-success text-white">
                                        <h5 class="card-title mb-0"><i class="bi bi-geo-alt"></i> Presets</h5>
                                    </div>
                                    <div class="card-body">
                                        <div id="presets-container" class="preset-container">
                                            <div class="d-flex justify-content-center">
                                                <div class="spinner-border text-primary" role="status">
                                                    <span class="visually-hidden">Chargement des presets...</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Configuration PTZ -->
                            <div class="col-lg-6">
                                <div class="card">
                                    <div class="card-header bg-info text-white">
                                        <h5 class="card-title mb-0"><i class="bi bi-gear"></i> Configuration PTZ</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label for="moveStep" class="form-label">Amplitude mouvement :</label>
                                                <input type="number" class="form-control" id="moveStep" value="0.02" min="0.01" max="1.0" step="0.01">
                                            </div>
                                            <div class="col-md-6">
                                                <label for="zoomStep" class="form-label">Amplitude zoom :</label>
                                                <input type="number" class="form-control" id="zoomStep" value="0.15" min="0.01" max="1.0" step="0.01">
                                            </div>
                                            <div class="col-12">
                                                <button class="btn btn-secondary" onclick="updateConfig()">
                                                    <i class="bi bi-arrow-clockwise"></i> Mettre à jour la config
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Logs MQTT -->
                            <div class="col-lg-6">
                                <div class="card">
                                    <div class="card-header bg-dark text-white">
                                        <h5 class="card-title mb-0"><i class="bi bi-terminal"></i> Logs MQTT</h5>
                                    </div>
                                    <div class="card-body p-0">
                                        <div id="logs" class="log-container p-3">En attente de connexion MQTT...</div>
                                    </div>
                                    <div class="card-footer">
                                        <button class="btn btn-outline-danger btn-sm" onclick="clearLogs()">
                                            <i class="bi bi-trash"></i> Effacer les logs
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Bootstrap JS -->
                    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

                    <script>
                        const cameraId = '${process.env.TEST_CAMERA_ID || 'camera_cours0'}';
                        let logs = [];
                        let presets = {};

                        function addLog(message) {
                            const timestamp = new Date().toLocaleTimeString();
                            logs.push(\`[\${timestamp}] \${message}\`);
                            if (logs.length > 50) logs.shift();
                            document.getElementById('logs').innerHTML = logs.join('\\n');
                            document.getElementById('logs').scrollTop = document.getElementById('logs').scrollHeight;
                        }

                        function clearLogs() {
                            logs = [];
                            document.getElementById('logs').innerHTML = 'Logs effacés.';
                        }

                        function updatePresets(presetData) {
                            presets = presetData;
                            const container = document.getElementById('presets-container');
                            container.innerHTML = '';
                            
                            if (Object.keys(presets).length === 0) {
                                container.innerHTML = '<div class="alert alert-warning" role="alert"><i class="bi bi-exclamation-triangle"></i> Aucun preset disponible</div>';
                                return;
                            }
                            
                            const row = document.createElement('div');
                            row.className = 'row g-2';
                            
                            for (const [name, id] of Object.entries(presets)) {
                                const col = document.createElement('div');
                                col.className = 'col-md-6 col-lg-4';
                                
                                const button = document.createElement('button');
                                button.className = 'btn btn-success w-100';
                                button.onclick = () => sendPresetCommand(id, name);
                                button.innerHTML = '<i class="bi bi-geo-alt-fill"></i> ' + name;
                                
                                col.appendChild(button);
                                row.appendChild(col);
                            }
                            
                            container.appendChild(row);
                            addLog('Presets mis à jour: ' + Object.keys(presets).join(', '));
                        }

                        async function sendPtzCommand(command) {
                            try {
                                const response = await fetch('/api/ptz', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ command })
                                });
                                const result = await response.json();
                                addLog(\`PTZ: \${command} - \${result.success ? 'Succès' : 'Échec'}\`);
                            } catch (error) {
                                addLog(\`Erreur PTZ: \${error.message}\`);
                            }
                        }

                        async function sendPresetCommand(presetId, presetName = null) {
                            console.log('🎯 sendPresetCommand appelée avec presetId:', presetId, 'presetName:', presetName);
                            try {
                                const response = await fetch('/api/preset', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ presetId })
                                });
                                console.log('📡 Réponse API reçue:', response.status);
                                const result = await response.json();
                                console.log('📄 Résultat API:', result);
                                const displayName = presetName || 'Preset ' + presetId;
                                addLog(displayName + ': ' + (result.success ? 'Activé' : 'Échec'));
                            } catch (error) {
                                console.error('❌ Erreur sendPresetCommand:', error);
                                addLog('Erreur preset: ' + error.message);
                            }
                        }

                        async function updateConfig() {
                            const moveStep = document.getElementById('moveStep').value;
                            const zoomStep = document.getElementById('zoomStep').value;
                            
                            try {
                                const response = await fetch('/api/config', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ moveStep: parseFloat(moveStep), zoomStep: parseFloat(zoomStep) })
                                });
                                const result = await response.json();
                                addLog('Config PTZ mise à jour: moveStep=' + moveStep + ', zoomStep=' + zoomStep);
                            } catch (error) {
                                addLog('Erreur config: ' + error.message);
                            }
                        }

                        // Vérifier la connexion MQTT toutes les 2 secondes
                        setInterval(async () => {
                            try {
                                const response = await fetch('/api/status');
                                const status = await response.json();
                                const statusBadge = document.getElementById('status-badge');
                                if (status.connected) {
                                    statusBadge.innerHTML = '<span class="badge bg-success status-badge"><i class="bi bi-wifi"></i> Connecté au broker MQTT</span>';
                                } else {
                                    statusBadge.innerHTML = '<span class="badge bg-danger status-badge"><i class="bi bi-wifi-off"></i> Déconnecté du broker MQTT</span>';
                                }
                            } catch (error) {
                                const statusBadge = document.getElementById('status-badge');
                                statusBadge.innerHTML = '<span class="badge bg-warning status-badge"><i class="bi bi-exclamation-triangle"></i> Erreur de connexion au serveur</span>';
                            }
                        }, 2000);

                        async function loadPresets() {
                            try {
                                const response = await fetch('/api/presets');
                                const presetData = await response.json();
                                updatePresets(presetData);
                            } catch (error) {
                                addLog('Erreur chargement presets: ' + error.message);
                            }
                        }

                        // Charger les presets au démarrage uniquement (version 2.0)
                        window.addEventListener('load', () => {
                            console.log('🔄 Chargement initial des presets - pas de polling');
                            loadPresets();
                            // Les presets seront automatiquement mis à jour via MQTT côté serveur
                        });

                        addLog('Interface de test chargée');
                    </script>
                </body>
                </html>
            `);
        });

        // API pour envoyer des commandes PTZ
        this.app.post('/api/ptz', (req, res) => {
            const { command } = req.body;
            if (this.isConnected && command) {
                const topic = `onvif2mqtt/${process.env.TEST_CAMERA_ID}/cmd`;
                this.mqttClient.publish(topic, command);
                console.log(`Commande PTZ envoyée: ${command}`);
                res.json({ success: true, command });
            } else {
                res.status(400).json({ success: false, error: 'MQTT non connecté ou commande manquante' });
            }
        });

        // API pour récupérer les presets
        this.app.get('/api/presets', (req, res) => {
            res.json(this.currentPresets || {});
        });

        // API pour vérifier le statut MQTT
        this.app.get('/api/status', (req, res) => {
            res.json({ connected: this.isConnected });
        });

        // API pour envoyer des commandes de preset
        this.app.post('/api/preset', (req, res) => {
            const { presetId } = req.body;
            console.log(`🎯 API Preset appelée avec presetId: ${presetId}`);
            console.log(`📡 MQTT connecté: ${this.isConnected}`);
            
            if (this.isConnected && presetId) {
                const topic = `onvif2mqtt/${process.env.TEST_CAMERA_ID}/goPreset`;
                console.log(`📤 Publication MQTT sur topic: ${topic} avec valeur: ${presetId}`);
                this.mqttClient.publish(topic, String(presetId)); // Conversion en string
                console.log(`✅ Preset activé: ${presetId}`);
                res.json({ success: true, presetId });
            } else {
                console.log(`❌ Échec preset: MQTT=${this.isConnected}, presetId=${presetId}`);
                res.status(400).json({ success: false, error: 'MQTT non connecté ou preset manquant' });
            }
        });

        // API pour la configuration PTZ (simulation)
        this.app.post('/api/config', (req, res) => {
            const { moveStep, zoomStep } = req.body;
            console.log(`Configuration PTZ mise à jour: moveStep=${moveStep}, zoomStep=${zoomStep}`);
            res.json({ success: true, moveStep, zoomStep });
        });

        // API pour vérifier le statut MQTT
        this.app.get('/api/status', (req, res) => {
            res.json({ connected: this.isConnected });
        });
    }

    async connectMqtt() {
        try {
            const options = {
                clientId: process.env.MQTT_CLIENT_ID || 'onvif-test-client',
                username: process.env.MQTT_USERNAME,
                password: process.env.MQTT_PASSWORD,
                clean: true,
                reconnectPeriod: 5000
            };

            this.mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, options);

            this.mqttClient.on('connect', () => {
                console.log('✅ Connecté au broker MQTT');
                this.isConnected = true;
                
                // S'abonner aux topics de réponse si nécessaire
                this.mqttClient.subscribe(`onvif2mqtt/${process.env.TEST_CAMERA_ID}/lwt`);
                this.mqttClient.subscribe(`onvif2mqtt/${process.env.TEST_CAMERA_ID}/presetListId`);
            });

            this.mqttClient.on('error', (error) => {
                console.error('❌ Erreur MQTT:', error);
                this.isConnected = false;
            });

            this.mqttClient.on('close', () => {
                console.warn('⚠️ Connexion MQTT fermée');
                this.isConnected = false;
            });

            this.mqttClient.on('message', (topic, message) => {
                console.log(`📩 Message reçu [${topic}]: ${message.toString()}`);
                
                // Traiter les presets reçus
                if (topic.endsWith('/presetListId')) {
                    try {
                        const presetData = JSON.parse(message.toString());
                        console.log('🎯 Presets reçus:', presetData);
                        this.currentPresets = presetData;
                    } catch (error) {
                        console.error('Erreur parsing presets:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Erreur lors de la connexion MQTT:', error);
        }
    }

    async start() {
        // Connexion MQTT
        await this.connectMqtt();

        // Démarrage du serveur HTTP
        const port = process.env.HTTP_PORT || 3001;
        this.server = this.app.listen(port, () => {
            console.log(`🚀 Client de test ONVIF démarré sur le port ${port}`);
            console.log(`🌐 Interface web: http://localhost:${port}`);
            console.log(`📡 Caméra de test: ${process.env.TEST_CAMERA_ID}`);
        });
    }

    async stop() {
        if (this.mqttClient) {
            this.mqttClient.end();
        }
        if (this.server) {
            this.server.close();
        }
        console.log('Client de test arrêté');
    }
}

// Fonction principale
async function main() {
    const client = new OnvifTestClient();

    // Gestion des signaux d'arrêt
    process.on('SIGINT', async () => {
        console.log('Signal SIGINT reçu, arrêt en cours...');
        await client.stop();
        process.exit(0);
    });

    try {
        await client.start();
    } catch (error) {
        console.error('Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
