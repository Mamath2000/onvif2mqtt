# Makefile pour onvif2mqtt


.PHONY: help gateway test-client all install

# Menu d'aide par défaut



help:
	@echo "\033[1;36m🚀 Menu de gestion onvif2mqtt\033[0m"
	@echo "\033[1;32mmake install    \033[0m: Installer les dépendances et copier les fichiers .env"
	@echo "\033[1;32mmake gateway    \033[0m: Lancer uniquement la passerelle ONVIF-MQTT"
	@echo "\033[1;32mmake test-client\033[0m: Lancer uniquement le client de test web"
	@echo "\033[1;32mmake all        \033[0m: Lancer passerelle + client de test (tmux)"
	@echo "\033[1;32mmake clean      \033[0m: Nettoyer les dépendances et les logs (optionnel)"
	@echo "\033[1;32mmake help       \033[0m: Afficher ce menu"

# Cible par défaut : affiche le menu
default: help

# Lancer uniquement la passerelle ONVIF-MQTT
gateway:
	cd . && npm start

# Lancer uniquement le client de test web
test-client:
	cd ./test-client && npm start

# Lancer la passerelle ET le client de test web (en parallèle)
all:
	@echo "Arrêt des sessions tmux existantes..."
	-tmux kill-session -t onvif_gateway 2>/dev/null || true
	-tmux kill-session -t onvif_test_client 2>/dev/null || true
	@echo "Lancement des nouvelles sessions..."
	tmux new-session -d -s onvif_gateway 'cd . && npm start'
	tmux new-session -d -s onvif_test_client 'cd ./test-client && npm start'
	@echo "Passerelle et client de test lancés dans deux sessions tmux : onvif_gateway et onvif_test_client"
	@echo "Utilisez 'tmux attach -t onvif_gateway' ou 'tmux attach -t onvif_test_client' pour voir les logs."

# Installation des dépendances et configuration
install:
	cd . && npm install
	cp -n ./.env.example ./.env
	cd ./test-client && npm install
	cp -n ./test-client/.env.example ./test-client/.env
	@echo "Installation terminée. Les fichiers .env ont été copiés si absents."
