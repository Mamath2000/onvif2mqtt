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
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
                        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
                        .ptz-btn { background-color: #007bff; color: white; }
                        .preset-btn { background-color: #28a745; color: white; }
                        .section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 4px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; max-width: 300px; margin: 10px 0; }
                        .grid button { margin: 0; }
                        #status { padding: 10px; margin: 10px 0; border-radius: 4px; }
                        .connected { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                        .disconnected { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                        .log { background-color: #f8f9fa; padding: 15px; border-radius: 4px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🧪 ONVIF Test Client</h1>
                        <div id="status" class="disconnected">Déconnecté du broker MQTT</div>
                        
                        <div class="section">
                            <h2>🎮 Contrôles PTZ</h2>
                            <p>Contrôles de mouvement :</p>
                            <div class="grid">
                                <div></div>
                                <button class="ptz-btn" onclick="sendPtzCommand('move-up')">⬆️ Haut</button>
                                <div></div>
                                <button class="ptz-btn" onclick="sendPtzCommand('move-left')">⬅️ Gauche</button>
                                <button class="ptz-btn" onclick="sendPtzCommand('stop')">⏹️ Stop</button>
                                <button class="ptz-btn" onclick="sendPtzCommand('move-right')">➡️ Droite</button>
                                <div></div>
                                <button class="ptz-btn" onclick="sendPtzCommand('move-down')">⬇️ Bas</button>
                                <div></div>
                            </div>
                            <p>Contrôles de zoom :</p>
                            <button class="ptz-btn" onclick="sendPtzCommand('zoom-in')">🔍 Zoom +</button>
                            <button class="ptz-btn" onclick="sendPtzCommand('zoom-out')">🔍 Zoom -</button>
                        </div>

                        <div class="section">
                            <h2>🎯 Presets</h2>
                            <div id="presets-container">
                                <p>Chargement des presets...</p>
                            </div>
                        </div>

                        <div class="section">
                            <h2>📊 Configuration PTZ</h2>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                                <div>
                                    <label>Amplitude mouvement:</label>
                                    <input type="number" id="moveStep" value="0.02" min="0.01" max="1.0" step="0.01" style="width: 100%;">
                                </div>
                                <div>
                                    <label>Amplitude zoom:</label>
                                    <input type="number" id="zoomStep" value="0.15" min="0.01" max="1.0" step="0.01" style="width: 100%;">
                                </div>
                            </div>
                            <button onclick="updateConfig()" style="background-color: #6c757d; color: white;">⚙️ Mettre à jour la config</button>
                        </div>

                        <div class="section">
                            <h2>📝 Logs MQTT</h2>
                            <div id="logs" class="log">En attente de connexion MQTT...</div>
                            <button onclick="clearLogs()" style="background-color: #dc3545; color: white; margin-top: 10px;">🗑️ Effacer les logs</button>
                        </div>
                    </div>

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
                                container.innerHTML = '<p>Aucun preset disponible</p>';
                                return;
                            }
                            
                            for (const [name, id] of Object.entries(presets)) {
                                const button = document.createElement('button');
                                button.className = 'preset-btn';
                                button.onclick = () => sendPresetCommand(id, name);
                                button.innerHTML = '📍 ' + name;
                                container.appendChild(button);
                            }
                            
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
                            try {
                                const response = await fetch('/api/preset', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ presetId })
                                });
                                const result = await response.json();
                                const displayName = presetName || 'Preset ' + presetId;
                                addLog(displayName + ': ' + (result.success ? 'Activé' : 'Échec'));
                            } catch (error) {
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
                                const statusDiv = document.getElementById('status');
                                if (status.connected) {
                                    statusDiv.textContent = 'Connecté au broker MQTT';
                                    statusDiv.className = 'connected';
                                } else {
                                    statusDiv.textContent = 'Déconnecté du broker MQTT';
                                    statusDiv.className = 'disconnected';
                                }
                            } catch (error) {
                                const statusDiv = document.getElementById('status');
                                statusDiv.textContent = 'Erreur de connexion au serveur de test';
                                statusDiv.className = 'disconnected';
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

                        // Charger les presets au démarrage et les rafraîchir périodiquement
                        window.addEventListener('load', () => {
                            loadPresets();
                            setInterval(loadPresets, 5000); // Rafraîchir toutes les 5 secondes
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
            if (this.isConnected && presetId) {
                const topic = `onvif2mqtt/${process.env.TEST_CAMERA_ID}/goPreset`;
                this.mqttClient.publish(topic, presetId);
                console.log(`Preset activé: ${presetId}`);
                res.json({ success: true, presetId });
            } else {
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
