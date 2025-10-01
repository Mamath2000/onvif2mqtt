# Makefile pour onvif2mqtt

# Variables
NODE_VERSION := 18
DOCKER_IMAGE := onvif2mqtt
DOCKER_TAG := latest
DOCKER_USER := mathmath350  # Remplacez par votre nom d'utilisateur Docker Hub

# Couleurs pour les messages
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup
.PHONY: service-install service-uninstall service-start service-stop service-logs
.PHONY: docker-build-push version-bump check-env

# ========================
# Aide
# ========================
help:
	@echo "$(GREEN)🚀 onvif2mqtt - Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)⚡ COMMANDES PRINCIPALES:$(NC)"
	@echo "  $(GREEN)make setup$(NC)               - Configuration initiale complète"
	@echo "  $(GREEN)make start$(NC)               - Lancement en mode production"
	@echo "  $(GREEN)make dev$(NC)                 - Lancement en mode développement"
	@echo ""
	@echo "$(YELLOW)🐳 DOCKER & PUBLICATION:$(NC)"
	@echo "  $(GREEN)make docker-build$(NC)        - Construction de l'image Docker locale"
	@echo "  $(GREEN)make docker-build-push$(NC)   - Build + Publication Docker Hub + Version bump"
	@echo "  $(GREEN)make version-bump$(NC)        - Incrémenter manuellement la version"
	@echo ""
	@echo "$(YELLOW)🔧 CONFIGURATION:$(NC)"
	@echo "  $(GREEN)make install$(NC)             - Installation des dépendances"
	@echo "  $(GREEN)make check-env$(NC)           - Vérifier la configuration"
	@echo "  $(GREEN)make clean$(NC)               - Nettoyage des fichiers temporaires"
	@echo ""
	@echo "$(YELLOW)🔄 SERVICE SYSTÈME:$(NC)"
	@echo "  $(GREEN)make service-install$(NC)     - Installer le service systemd"
	@echo "  $(GREEN)make service-start$(NC)       - Démarrer le service systemd"
	@echo "  $(GREEN)make service-stop$(NC)        - Arrêter le service systemd"
	@echo "  $(GREEN)make service-logs$(NC)        - Logs du service systemd"
	@echo ""
	@echo "$(BLUE)📦 Version actuelle: $$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')$(NC)"
	@echo ""

# ========================
# Installation
# ========================

# Configuration initiale du projet
setup:
	@echo "$(GREEN)🚀 Configuration initiale du projet onvif2mqtt...$(NC)"
	./scripts/setup-env.sh
	@echo "$(GREEN)✅ Configuration terminée !$(NC)"

# Installation des dépendances
install:
	@echo "$(GREEN)Installation des dépendances Node.js...$(NC)"
	npm install
	
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


# ========================
# Nettoyage
# ========================

# Nettoyage
clean:
	@echo "$(GREEN)Nettoyage des fichiers temporaires...$(NC)"
	rm -rf node_modules/
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

# ========================
# Build et Publication
# ========================

# Build et publication Docker Hub avec incrémentation de version
docker-build-push: check-env
	@echo "$(GREEN)🚀 Build et publication Docker Hub avec incrémentation de version...$(NC)"
	./scripts/build-docker-image.sh

# Incrémenter manuellement la version
version-bump:
	@echo "$(GREEN)📦 Incrémentation manuelle de la version...$(NC)"
	@bash -c 'CURRENT_VERSION=$$(grep "\"version\"" package.json | sed "s/.*\"version\": \"\(.*\)\".*/\1/"); \
	echo "Version actuelle: $$CURRENT_VERSION"; \
	IFS="." read -r MAJOR MINOR PATCH <<< "$$CURRENT_VERSION"; \
	PATCH=$$((PATCH + 1)); \
	NEW_VERSION="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "Nouvelle version: $$NEW_VERSION"; \
	jq ".version = \"$$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "✅ Version mise à jour vers $$NEW_VERSION"'

# Vérifier l'environnement et la configuration
check-env:
	@echo "$(GREEN)🔍 Vérification de l'environnement...$(NC)"
	@command -v node >/dev/null 2>&1 || { echo "$(RED)❌ Node.js n'est pas installé$(NC)"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)❌ npm n'est pas installé$(NC)"; exit 1; }
	@command -v git >/dev/null 2>&1 || { echo "$(RED)❌ Git n'est pas installé$(NC)"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)❌ Docker n'est pas installé$(NC)"; exit 1; }
	@command -v jq >/dev/null 2>&1 || { echo "$(RED)❌ jq n'est pas installé (sudo apt install jq)$(NC)"; exit 1; }
	@echo "$(GREEN)✅ Node.js: $$(node --version)$(NC)"
	@echo "$(GREEN)✅ npm: $$(npm --version)$(NC)"
	@echo "$(GREEN)✅ Git: $$(git --version | head -n1)$(NC)"
	@echo "$(GREEN)✅ Docker: $$(docker --version)$(NC)"
	@echo "$(GREEN)✅ jq: $$(jq --version)$(NC)"
	@if [ ! -f "config.conf" ]; then \
		echo "$(YELLOW)⚠️ Fichier config.conf manquant$(NC)"; \
		echo "$(BLUE)💡 Créez le fichier: cp config.conf.example config.conf$(NC)"; \
	else \
		echo "$(GREEN)✅ Fichier config.conf présent$(NC)"; \
	fi
	@if [ ! -f "scripts/build-docker-image.sh" ] || [ ! -x "scripts/build-docker-image.sh" ]; then \
		echo "$(RED)❌ Script build-docker-image.sh manquant ou non exécutable$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ Tous les prérequis sont satisfaits$(NC)"

# Par défaut, afficher l'aide
.DEFAULT_GOAL := help
