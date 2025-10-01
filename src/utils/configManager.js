const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath = 'config.conf') {
        this.configPath = configPath;
        this.config = {};
        this.loadConfig();
    }

    /**
     * Charge la configuration depuis le fichier config.conf
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Fichier de configuration non trouvé: ${this.configPath}`);
            }

            const content = fs.readFileSync(this.configPath, 'utf8');
            this.parseConfig(content);
        } catch (error) {
            console.error('Erreur lors du chargement de la configuration:', error.message);
            process.exit(1);
        }
    }

    /**
     * Parse le contenu du fichier de configuration
     * @param {string} content - Contenu du fichier
     */
    parseConfig(content) {
        const lines = content.split('\n');
        let currentSection = 'global';
        
        this.config = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Ignorer les lignes vides et les commentaires
            if (!line || line.startsWith('#')) {
                continue;
            }

            // Détecter les sections [section] ou [section.subsection]
            const sectionMatch = line.match(/^\[([^\]]+)\]$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                continue;
            }

            // Parser les paires clé = valeur
            const keyValueMatch = line.match(/^([^=]+?)\s*=\s*(.*)$/);
            if (keyValueMatch) {
                const key = keyValueMatch[1].trim();
                const value = keyValueMatch[2].trim();
                
                this.setConfigValue(currentSection, key, value);
            }
        }
    }

    /**
     * Définit une valeur de configuration
     * @param {string} section - Section de configuration
     * @param {string} key - Clé de configuration
     * @param {string} value - Valeur de configuration
     */
    setConfigValue(section, key, value) {
        // Gérer les sections avec sous-sections (ex: camera.cours)
        const sectionParts = section.split('.');
        
        let current = this.config;
        for (let i = 0; i < sectionParts.length; i++) {
            const part = sectionParts[i];
            if (i === sectionParts.length - 1) {
                // Dernière partie, on peut maintenant définir les valeurs
                if (!current[part]) {
                    current[part] = {};
                }
                current[part][key] = this.parseValue(value);
            } else {
                // Parties intermédiaires, créer l'objet si nécessaire
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
    }

    /**
     * Parse une valeur en détectant automatiquement le type
     * @param {string} value - Valeur à parser
     * @returns {any} - Valeur parsée
     */
    parseValue(value) {
        // Valeur vide
        if (value === '') {
            return '';
        }

        // Booléens
        if (value.toLowerCase() === 'true') {
            return true;
        }
        if (value.toLowerCase() === 'false') {
            return false;
        }

        // Nombres
        if (/^\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        if (/^\d*\.\d+$/.test(value)) {
            return parseFloat(value);
        }

        // Chaînes de caractères (par défaut)
        return value;
    }

    /**
     * Récupère une valeur de configuration
     * @param {string} path - Chemin vers la valeur (ex: 'mqtt.broker_url')
     * @param {any} defaultValue - Valeur par défaut si non trouvée
     * @returns {any} - Valeur de configuration
     */
    get(path, defaultValue = undefined) {
        const parts = path.split('.');
        let current = this.config;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return defaultValue;
            }
        }

        return current;
    }

    /**
     * Récupère toutes les caméras configurées
     * @returns {Object} - Objet contenant toutes les caméras
     */
    getCameras() {
        return this.config.camera || {};
    }

    /**
     * Récupère la configuration complète
     * @returns {Object} - Configuration complète
     */
    getAll() {
        return this.config;
    }

    /**
     * Affiche la configuration (pour debug)
     */
    debug() {
        console.log('Configuration chargée:');
        console.log(JSON.stringify(this.config, null, 2));
    }
}

module.exports = ConfigManager;