const logger = require('../utils/logger');

class HADiscoveryHelper {
    constructor(mqttClient, options = {}) {
        this.mqttClient = mqttClient;
        this.discoveryPrefix = options.discoveryPrefix || 'homeassistant';
        this.baseTopic = options.baseTopic || 'onvif2mqtt';
        this.isDiscoveryEnabled = options.isDiscoveryEnabled || false;
    }

    publishGatewayDevice(deviceId, deviceName) {
        if (!this.isDiscoveryEnabled) {
            return;
        }

        const device = {
            identifiers: [deviceId],
            name: deviceName,
            manufacturer: 'Mamath',
            model: 'Gateway',
            sw_version: process.env.VERSION || '1.0.0',
            // connections: [
            //     ['mac', bridgeId],
            //     ['ip', this.config.IDIAMANT_IP]
            // ]
        };
        const origin = {
            name: "onvif2mqtt"
        };

        const gatewayTopic = `${this.discoveryPrefix}/device/${deviceId}/config`;
        const gatewayPayload = {
            device: device,
            origin: origin,
            components: {
                onvif2mqtt_state: {
                    platform: 'binary_sensor',
                    object_id: 'onvif2mqtt_state',
                    unique_id: 'onvif2mqtt_state',
                    name: 'State',
                    force_update: true,
                    state_topic: `${this.baseTopic}/lwt`,
                    payload_off: 'offline',
                    payload_on: 'online',
                    device_class: 'connectivity'
                }

            }
        };

        this.mqttClient.publish(
            gatewayTopic,
            JSON.stringify(gatewayPayload),
            { retain: true, qos: 1 });

    }

    publishCameraDevice(gatewayId,cameraStatus) {
        if (!this.isDiscoveryEnabled) {
            return;
        }

        const identifier = `${cameraStatus.name.toLowerCase().replace(/\s+/g, '_')}`;
        const device = {
            identifiers: [identifier],
            name: cameraStatus.name,
            manufacturer: cameraStatus.manufacturer,
            model: cameraStatus.model,
            sn: cameraStatus.serialNumber,
            via_device: gatewayId,
            connections: [
                ['ip', cameraStatus.host]
            ]
        }
        const origin = {
            name: "onvif2mqtt"
        };
        const stateTopic = `${this.baseTopic}/${identifier}`;
        const availability = [
            {
                topic: `${this.baseTopic}/lwt`,
                payload_available: 'online',
            },
            {
                topic: `${stateTopic}/lwt`,
                payload_available: 'online',
            }
        ];

        const cameraTopic = `${this.discoveryPrefix}/device/${identifier}/config`;
        const cameraPayload = {
            device: device,
            origin: origin,
            availability: availability,
            availability_mode: "all",
            components: {
                [`${identifier}_state`]: {
                    platform: 'binary_sensor',
                    object_id: `${identifier}_state`,
                    unique_id: `${identifier}_state`,
                    availability: [{
                        topic: `${this.baseTopic}/lwt`,
                        payload_available: 'online',
                    }],
                    name: 'State',
                    force_update: true,
                    state_topic: `${stateTopic}/lwt`,
                    payload_off: 'offline',
                    payload_on: 'online',
                    device_class: 'connectivity'
                }
            }
        };

        Object.keys(cameraStatus.presets).forEach(key => {
            const preset = cameraStatus.presets[key];
            cameraPayload.components[`${identifier}_preset_${preset}`] = {
                platform: 'button',
                object_id: `${identifier}_preset_${key}`,
                unique_id: `${identifier}_preset_${preset}`,
                name: `Preset ${key}`,
                command_topic: `${stateTopic}/goPreset`,
                payload_press: preset
            };
        });

        this.mqttClient.publish(
            cameraTopic,
            JSON.stringify(cameraPayload),
            { retain: true, qos: 1 }
        );

    }


}

module.exports = HADiscoveryHelper;
