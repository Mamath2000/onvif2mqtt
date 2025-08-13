#!/bin/bash

# Script d'installation du service systemd pour onvif2mqtt
# Ce script crée et installe un service systemd pour démarrer automatiquement onvif2mqtt

set -e

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Variables
SERVICE_NAME="onvif2mqtt"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CURRENT_DIR="$(pwd)"
USER="$(whoami)"

echo -e "${GREEN}Installation du service systemd ${SERVICE_NAME}...${NC}"

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ] || [ ! -f "src/app.js" ]; then
    echo -e "${RED}Erreur: Ce script doit être exécuté depuis la racine du projet onvif2mqtt${NC}"
    echo -e "${RED}Fichiers manquants: package.json ou src/app.js${NC}"
    exit 1
fi

# Vérifier que Node.js est installé
if ! command -v node &> /dev/null; then
    echo -e "${RED}Erreur: Node.js n'est pas installé${NC}"
    exit 1
fi

# Vérifier que npm est installé
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Erreur: npm n'est pas installé${NC}"
    exit 1
fi

# Vérifier les permissions sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Ce script nécessite les permissions sudo...${NC}"
    if ! sudo -v; then
        echo -e "${RED}Erreur: Permissions sudo requises${NC}"
        exit 1
    fi
fi

# Créer le fichier de service systemd
echo -e "${GREEN}Création du fichier de service systemd...${NC}"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=ONVIF to MQTT Gateway
Documentation=https://github.com/Mamath2000/onvif2mqtt
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
ExecStart=$(which node) src/app.js
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=process
Restart=on-failure
RestartSec=42s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Limites de sécurité
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$CURRENT_DIR

[Install]
WantedBy=multi-user.target
EOF

# Recharger systemd
echo -e "${GREEN}Rechargement de systemd...${NC}"
sudo systemctl daemon-reload

# Activer le service pour le démarrage automatique
echo -e "${GREEN}Activation du service pour le démarrage automatique...${NC}"
sudo systemctl enable "$SERVICE_NAME.service"

echo -e "${GREEN}✅ Service $SERVICE_NAME installé avec succès !${NC}"
echo ""
echo -e "${YELLOW}Commandes utiles :${NC}"
echo -e "  sudo systemctl start $SERVICE_NAME     - Démarrer le service"
echo -e "  sudo systemctl stop $SERVICE_NAME      - Arrêter le service"
echo -e "  sudo systemctl status $SERVICE_NAME    - Voir le statut"
echo -e "  sudo systemctl restart $SERVICE_NAME   - Redémarrer le service"
echo -e "  sudo journalctl -u $SERVICE_NAME -f    - Voir les logs en temps réel"
echo ""
echo -e "${YELLOW}Ou utilisez les commandes make :${NC}"
echo -e "  make service-start    - Démarrer le service"
echo -e "  make service-stop     - Arrêter le service"
echo -e "  make service-logs     - Voir les logs"
echo ""
