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
	cd /root/onvif && npm start

# Lancer uniquement le client de test web
test-client:
	cd /root/onvif/test-client && npm start

# Lancer la passerelle ET le client de test web (en parallèle)
all:
	tmux new-session -d -s onvif_gateway 'cd /root/onvif && npm start'
	tmux new-session -d -s onvif_test_client 'cd /root/onvif/test-client && npm start'
	@echo "Passerelle et client de test lancés dans deux sessions tmux : onvif_gateway et onvif_test_client"
	@echo "Utilisez 'tmux attach -t onvif_gateway' ou 'tmux attach -t onvif_test_client' pour voir les logs."

# Installation des dépendances et configuration
install:
	cd /root/onvif && npm install
	cp -n /root/onvif/.env.example /root/onvif/.env
	cd /root/onvif/test-client && npm install
	cp -n /root/onvif/test-client/.env.example /root/onvif/test-client/.env
	@echo "Installation terminée. Les fichiers .env ont été copiés si absents."
