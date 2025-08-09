# Guide de déploiement - ONVIF MQTT Controller

## Déploiement avec Docker

### Dockerfile

```dockerfile
FROM node:18-alpine

# Créer le répertoire de l'application
WORKDIR /app

# Copier les fichiers package
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production

# Copier le code source
COPY src/ ./src/

# Créer le répertoire des logs
RUN mkdir -p logs

# Exposer le port
EXPOSE 3000

# Définir l'utilisateur non-root
RUN addgroup -g 1001 -S nodejs && adduser -S onvif -u 1001
USER onvif

# Démarrer l'application
CMD ["node", "src/app.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  onvif-controller:
    build: .
    container_name: onvif-mqtt-controller
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Configuration MQTT
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
      - MQTT_USERNAME=${MQTT_USERNAME}
      - MQTT_PASSWORD=${MQTT_PASSWORD}
      - MQTT_CLIENT_ID=onvif-controller-docker
      
      # Configuration Home Assistant
      - HA_DISCOVERY_PREFIX=homeassistant
      - HA_DEVICE_NAME=ONVIF Controller
      - HA_DEVICE_ID=onvif_controller_docker
      
      # Configuration serveur
      - HTTP_PORT=3000
      - LOG_LEVEL=info
      - STATUS_UPDATE_INTERVAL=30000
      
      # Caméras (à adapter selon votre configuration)
      - CAMERA_1_NAME=Camera Salon
      - CAMERA_1_HOST=${CAMERA_1_HOST}
      - CAMERA_1_USERNAME=${CAMERA_1_USERNAME}
      - CAMERA_1_PASSWORD=${CAMERA_1_PASSWORD}
      
    volumes:
      - ./logs:/app/logs
      - ./.env:/app/.env:ro
    networks:
      - onvif-network
    depends_on:
      - mosquitto
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mosquitto:
    image: eclipse-mosquitto:2
    container_name: mosquitto
    restart: unless-stopped
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
    networks:
      - onvif-network

networks:
  onvif-network:
    driver: bridge
```

### Configuration Mosquitto

Créez le fichier `mosquitto/config/mosquitto.conf` :

```conf
# Configuration Mosquitto pour ONVIF Controller

# Listener sur le port standard
listener 1883

# Websockets (optionnel)
listener 9001
protocol websockets

# Authentification
allow_anonymous false
password_file /mosquitto/config/passwd

# Persistance
persistence true
persistence_location /mosquitto/data/

# Logs
log_dest file /mosquitto/log/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

# Optimisations
max_keepalive 300
max_connections 1000
```

## Déploiement avec systemd (Linux)

### Service systemd

Créez le fichier `/etc/systemd/system/onvif-controller.service` :

```ini
[Unit]
Description=ONVIF MQTT Controller
Documentation=https://github.com/your-repo/onvif-mqtt-controller
After=network.target

[Service]
Type=simple
User=onvif
WorkingDirectory=/opt/onvif-controller
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/app.js
Restart=on-failure
RestartSec=10
KillMode=mixed
KillSignal=SIGINT
TimeoutStopSec=5
SyslogIdentifier=onvif-controller

# Sécurité
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/onvif-controller/logs

[Install]
WantedBy=multi-user.target
```

### Script d'installation

```bash
#!/bin/bash
# install.sh

set -e

echo "Installation d'ONVIF MQTT Controller..."

# Créer l'utilisateur
sudo useradd -r -s /bin/false onvif || true

# Créer le répertoire d'installation
sudo mkdir -p /opt/onvif-controller
sudo chown onvif:onvif /opt/onvif-controller

# Copier les fichiers
sudo cp -r . /opt/onvif-controller/
sudo chown -R onvif:onvif /opt/onvif-controller

# Installer les dépendances
cd /opt/onvif-controller
sudo -u onvif npm ci --only=production

# Créer le répertoire des logs
sudo mkdir -p /opt/onvif-controller/logs
sudo chown onvif:onvif /opt/onvif-controller/logs

# Installer le service systemd
sudo cp onvif-controller.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable onvif-controller

echo "Installation terminée!"
echo "Configurez le fichier .env puis démarrez le service avec:"
echo "sudo systemctl start onvif-controller"
```

## Déploiement sur Raspberry Pi

### Configuration optimisée

```bash
# Mise à jour du système
sudo apt update && sudo apt upgrade -y

# Installation de Node.js (version LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installation de Git (si nécessaire)
sudo apt install -y git

# Cloner le projet
git clone https://github.com/your-repo/onvif-mqtt-controller.git
cd onvif-mqtt-controller

# Installation des dépendances
npm install

# Configuration pour économiser la mémoire
echo "NODE_OPTIONS=--max-old-space-size=512" >> .env
```

### Service systemd pour Raspberry Pi

```ini
[Unit]
Description=ONVIF MQTT Controller
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/onvif-mqtt-controller
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10

# Limites de ressources pour Raspberry Pi
LimitNOFILE=65535
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

## Monitoring et maintenance

### Script de monitoring

```bash
#!/bin/bash
# monitor.sh

HEALTH_URL="http://localhost:3000/health"
LOG_FILE="/var/log/onvif-controller-monitor.log"

check_health() {
    if curl -s "$HEALTH_URL" | grep -q '"status":"OK"'; then
        echo "$(date): Service OK" >> "$LOG_FILE"
        return 0
    else
        echo "$(date): Service KO - Redémarrage..." >> "$LOG_FILE"
        systemctl restart onvif-controller
        return 1
    fi
}

# Vérifier la santé du service
check_health

# Nettoyer les anciens logs (garder 7 jours)
find /opt/onvif-controller/logs -name "*.log" -mtime +7 -delete
```

### Crontab pour monitoring automatique

```bash
# Ajouter à crontab (crontab -e)
# Vérifier toutes les 5 minutes
*/5 * * * * /usr/local/bin/monitor-onvif.sh

# Nettoyer les logs chaque nuit
0 2 * * * find /opt/onvif-controller/logs -name "*.log" -mtime +7 -delete

# Redémarrer le service chaque semaine (optionnel)
0 3 * * 0 systemctl restart onvif-controller
```

## Sécurité

### Configuration du pare-feu

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 3000/tcp comment "ONVIF Controller HTTP"
sudo ufw allow 1883/tcp comment "MQTT"

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=1883/tcp
sudo firewall-cmd --reload
```

### Configuration HTTPS avec Nginx

```nginx
# /etc/nginx/sites-available/onvif-controller
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Sauvegarde et restauration

### Script de sauvegarde

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/onvif-controller"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/onvif-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

# Sauvegarder la configuration et les logs
tar -czf "$BACKUP_FILE" \
    -C /opt/onvif-controller \
    .env \
    logs/ \
    --exclude='logs/*.log' \
    package.json \
    src/

echo "Sauvegarde créée: $BACKUP_FILE"

# Nettoyer les anciennes sauvegardes (garder 30 jours)
find "$BACKUP_DIR" -name "onvif-backup-*.tar.gz" -mtime +30 -delete
```

### Restauration

```bash
#!/bin/bash
# restore.sh

BACKUP_FILE="$1"

if [[ -z "$BACKUP_FILE" ]]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

echo "Arrêt du service..."
sudo systemctl stop onvif-controller

echo "Restauration depuis $BACKUP_FILE..."
sudo tar -xzf "$BACKUP_FILE" -C /opt/onvif-controller/

echo "Redémarrage du service..."
sudo systemctl start onvif-controller

echo "Restauration terminée!"
```
