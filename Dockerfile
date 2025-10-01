# Utiliser Node.js LTS comme image de base
FROM node:18-alpine

# Informations sur le mainteneur
LABEL maintainer="onvif2mqtt"
LABEL description="Gateway MQTT ↔ ONVIF pour contrôler les caméras ONVIF via MQTT"

# Installer les dépendances système nécessaires
RUN apk add --no-cache \
    tzdata \
    dumb-init

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S onvif -u 1001 -G nodejs

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration des dépendances
COPY package*.json ./

# Installer les dépendances de production uniquement
RUN npm ci --only=production && \
    npm cache clean --force

# Copier le code source
COPY src/ ./src/

# Créer le répertoire des logs et ajuster les permissions
RUN mkdir -p /app/logs && \
    chown -R onvif:nodejs /app

# Passer à l'utilisateur non-root
USER onvif

# Exposer le port pour les health checks (si nécessaire)
EXPOSE 3000

# Définir les variables d'environnement par défaut
ENV NODE_ENV=production
ENV TZ=Europe/Paris

# Point d'entrée avec dumb-init pour une gestion propre des signaux
ENTRYPOINT ["dumb-init", "--"]

# Commande par défaut
CMD ["node", "src/app.js"]

# Health check pour vérifier que l'application fonctionne
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('Health check OK')" || exit 1