# Changelog - ONVIF MQTT Controller

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-09

### Ajouté
- **Fonctionnalités principales**
  - Connexion et contrôle des caméras ONVIF
  - Intégration MQTT avec Home Assistant
  - Interface web de gestion des caméras
  - API REST complète pour le contrôle des caméras
  - Découverte automatique des caméras sur le réseau

- **Fonctionnalités ONVIF**
  - Support des profils vidéo multiples
  - Capture de snapshots
  - Récupération des flux de streaming (RTSP)
  - Contrôles PTZ (Pan, Tilt, Zoom)
  - Gestion des presets PTZ
  - Surveillance du statut des caméras

- **Intégration Home Assistant**
  - Découverte automatique MQTT
  - Entités switch pour contrôler l'alimentation des caméras
  - Entités camera pour les flux vidéo
  - Capteurs de statut
  - Support des commandes MQTT bidirectionnelles

- **Interface utilisateur**
  - Interface web responsive
  - Contrôles PTZ visuels
  - Visualisation des snapshots
  - Gestion des caméras (ajout/suppression)
  - Monitoring en temps réel

- **Fonctionnalités techniques**
  - Système de logs structuré avec Winston
  - Configuration via variables d'environnement
  - Surveillance périodique des caméras
  - Gestion des erreurs robuste
  - Support des signaux système (SIGINT, SIGTERM)

- **Documentation**
  - Guide d'installation complet
  - Documentation d'intégration Home Assistant
  - Guide de déploiement (Docker, systemd, Raspberry Pi)
  - Exemples d'automatisations
  - Configuration des cartes Lovelace

### Sécurité
- Authentification ONVIF sécurisée
- Chiffrement des communications MQTT
- Gestion sécurisée des mots de passe
- Logs sans exposition des credentials

### Performances
- Connexions ONVIF optimisées
- Mise en cache des informations des caméras
- Gestion efficace de la mémoire
- Support des environnements à ressources limitées (Raspberry Pi)

## [En cours de développement]

### Prévu pour v1.1.0
- [ ] Support des événements ONVIF (détection de mouvement)
- [ ] Enregistrement vidéo automatique
- [ ] Interface web améliorée avec thèmes
- [ ] Support des notifications push
- [ ] API webhook pour intégrations tierces

### Prévu pour v1.2.0
- [ ] Support HTTPS natif
- [ ] Authentification utilisateur
- [ ] Tableau de bord avancé
- [ ] Export des configurations
- [ ] Support multi-tenant

### Idées futures
- [ ] Application mobile companion
- [ ] Support des caméras non-ONVIF
- [ ] Analyse vidéo avec IA
- [ ] Cloud recording
- [ ] Clustering pour haute disponibilité

## Notes de version

### Compatibilité
- **Node.js** : Version 16.x ou supérieure recommandée
- **Home Assistant** : Version 2021.12 ou supérieure
- **MQTT** : Compatible avec Mosquitto, HiveMQ, etc.
- **Caméras** : Toutes caméras compatibles ONVIF Profile S

### Dépendances principales
- `onvif`: ^0.6.5 - Client ONVIF
- `mqtt`: ^5.3.0 - Client MQTT
- `express`: ^4.18.2 - Serveur web
- `winston`: ^3.11.0 - Système de logs

### Limitations connues
- Les flux vidéo passent par RTSP (non proxifiés via HTTP)
- La découverte automatique peut ne pas fonctionner sur tous les réseaux
- Certaines fonctionnalités PTZ dépendent du support caméra
- Interface web basique (amélioration prévue v1.1.0)

### Migration et mise à jour
Première version - Pas de migration nécessaire.

---

**Légende :**
- ✅ **Ajouté** : Nouvelles fonctionnalités
- 🔧 **Modifié** : Changements dans les fonctionnalités existantes  
- ❌ **Supprimé** : Fonctionnalités supprimées
- 🔒 **Sécurité** : Corrections de vulnérabilités
- 🐛 **Corrigé** : Corrections de bugs
- ⚡ **Performances** : Améliorations des performances
