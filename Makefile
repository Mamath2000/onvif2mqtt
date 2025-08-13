# Makefile pour onvif2mqtt

# Variables
NODE_VERSION := 18
DOCKER_IMAGE := onvif2mqtt
DOCKER_TAG := latest

# Couleurs pour les messages
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup gateway test-client all
.PHONY: service-install service-uninstall service-start service-stop service-logs

# ========================
# Aide
# ========================
help:
	@echo "$(GREEN)onvif2mqtt - Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)Installation :$(NC)"
	@echo "  $(GREEN)make setup$(NC)        - Configuration initiale du projet"
	@echo "  $(GREEN)make install$(NC)      - Installation des dépendances"
	@echo "  $(GREEN)make clean$(NC)        - Nettoyage des fichiers temporaires"
	@echo ""
	@echo "$(YELLOW)Exécution & Debug :$(NC)"
	@echo "  $(GREEN)make dev$(NC)          - Lancement en mode développement"
	@echo "  $(GREEN)make start$(NC)        - Lancement en mode production"
	@echo "  $(GREEN)make gateway$(NC)      - Lancer uniquement la passerelle ONVIF-MQTT"
	@echo "  $(GREEN)make test-client$(NC)  - Lancer uniquement le client de test web"
	@echo "  $(GREEN)make all$(NC)          - Lancer passerelle + client de test (tmux)"
	@echo ""
	@echo "$(YELLOW)Docker :$(NC)"
	@echo "  $(GREEN)make docker-build$(NC) - Construction de l'image Docker"
	@echo "  $(GREEN)make docker-run$(NC)   - Lancement du conteneur Docker"
	@echo "  $(GREEN)make docker-stop$(NC)  - Arrêt du conteneur Docker"
	@echo "  $(GREEN)make docker-logs$(NC)  - Affichage des logs Docker"
	@echo ""
	@echo "$(YELLOW)Service :$(NC)"
	@echo "  $(GREEN)make service-install$(NC)   - Installer le service systemd (démarrage auto)"
	@echo "  $(GREEN)make service-uninstall$(NC) - Désinstaller le service systemd"
	@echo "  $(GREEN)make service-start$(NC)     - Démarrer le service systemd"
	@echo "  $(GREEN)make service-stop$(NC)      - Arrêter le service systemd"
	@echo "  $(GREEN)make service-logs$(NC)      - Afficher les logs du service systemd"
	@echo ""

# ========================
# Installation
# ========================

# Configuration initiale
setup: install
	@echo "$(GREEN)Configuration initiale...$(NC)"
	@if [ ! -f .env ]; then cp .env.example .env; echo "$(YELLOW)Fichier .env créé. Veuillez le configurer.$(NC)"; fi
	@if [ ! -f test-client/.env ]; then cp test-client/.env.example test-client/.env; echo "$(YELLOW)Fichier .env client de test créé.$(NC)"; fi
	@echo "$(GREEN)Projet configuré avec succès !$(NC)"

# Installation des dépendances
install:
	@echo "$(GREEN)Installation des dépendances Node.js...$(NC)"
	npm install
	@echo "$(GREEN)Installation des dépendances du client de test...$(NC)"
	cd ./test-client && npm install

# ========================
# Exécution & Debug
# ========================

# Mode développement avec rechargement automatique
dev:
	@echo "$(GREEN)Lancement en mode développement...$(NC)"
	npm run dev

# Mode production
start:
	@echo "$(GREEN)Lancement en mode production...$(NC)"
	MODE_ENV=production npm start

# Lancer uniquement la passerelle ONVIF-MQTT
gateway:
	@echo "$(GREEN)Lancement de la passerelle ONVIF-MQTT...$(NC)"
	npm start

# Lancer uniquement le client de test web
test-client:
	@echo "$(GREEN)Lancement du client de test web...$(NC)"
	cd ./test-client && npm start

# Lancer la passerelle ET le client de test web (en parallèle)
all:
	@echo "$(GREEN)Lancement de la passerelle et du client de test...$(NC)"
	@echo "Arrêt des sessions tmux existantes..."
	-tmux kill-session -t onvif_gateway 2>/dev/null || true
	-tmux kill-session -t onvif_test_client 2>/dev/null || true
	@echo "Lancement des nouvelles sessions..."
	tmux new-session -d -s onvif_gateway 'cd . && npm start'
	tmux new-session -d -s onvif_test_client 'cd ./test-client && npm start'
	@echo "$(GREEN)Passerelle et client de test lancés dans deux sessions tmux : onvif_gateway et onvif_test_client$(NC)"
	@echo "$(YELLOW)Utilisez 'tmux attach -t onvif_gateway' ou 'tmux attach -t onvif_test_client' pour voir les logs.$(NC)"

# ========================
# Nettoyage
# ========================

# Nettoyage
clean:
	@echo "$(GREEN)Nettoyage des fichiers temporaires...$(NC)"
	rm -rf node_modules/
	rm -rf test-client/node_modules/
	rm -f npm-debug.log*
	rm -f yarn-error.log*
	rm -rf logs/*
	@echo "$(GREEN)Nettoyage terminé !$(NC)"

# ========================
# Docker
# ========================

# Construction Docker
docker-build:
	@echo "$(GREEN)Construction de l'image Docker...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

# Lancement Docker
docker-run:
	@echo "$(GREEN)Lancement du conteneur Docker...$(NC)"
	docker run -d --name onvif2mqtt --env-file .env -p 3000:3000 $(DOCKER_IMAGE):$(DOCKER_TAG)

# Arrêt Docker
docker-stop:
	@echo "$(GREEN)Arrêt du conteneur Docker...$(NC)"
	docker stop onvif2mqtt || true
	docker rm onvif2mqtt || true

# Logs Docker
docker-logs:
	@echo "$(GREEN)Affichage des logs Docker...$(NC)"
	docker logs -f onvif2mqtt

# ========================
# Vérification
# ========================

# Vérification de l'environnement
check-env:
	@echo "$(GREEN)Vérification de l'environnement...$(NC)"
	@node --version || (echo "$(RED)Node.js n'est pas installé$(NC)" && exit 1)
	@npm --version || (echo "$(RED)npm n'est pas installé$(NC)" && exit 1)
	@echo "$(GREEN)Environnement OK !$(NC)"

# ========================
# Service systemd
# ========================

# Installation du service systemd
service-install:
	@echo "$(GREEN)Installation du service systemd onvif2mqtt...$(NC)"
	@bash scripts/install-systemd-service.sh

# Désinstallation du service systemd
service-uninstall:
	@echo "$(GREEN)Suppression du service systemd onvif2mqtt...$(NC)"
	sudo systemctl stop onvif2mqtt.service || true
	sudo systemctl disable onvif2mqtt.service || true
	sudo rm -f /etc/systemd/system/onvif2mqtt.service
	sudo systemctl daemon-reload
	@echo "$(GREEN)Service supprimé. Utilisez 'sudo systemctl status onvif2mqtt' pour vérifier.$(NC)"

# Démarrer le service systemd
service-start:
	@echo "$(GREEN)Démarrage du service systemd onvif2mqtt...$(NC)"
	sudo systemctl start onvif2mqtt.service

# Arrêter le service systemd
service-stop:
	@echo "$(GREEN)Arrêt du service systemd onvif2mqtt...$(NC)"
	sudo systemctl stop onvif2mqtt.service

# Logs du service systemd
service-logs:
	@echo "$(GREEN)Affichage des logs du service systemd onvif2mqtt...$(NC)"
	sudo journalctl -u onvif2mqtt.service -f

# Par défaut, afficher l'aide
.DEFAULT_GOAL := help
