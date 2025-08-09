const OnvifCamera = require('../src/onvif/onvifCamera');

describe('OnvifCamera', () => {
    let camera;

    beforeEach(() => {
        camera = new OnvifCamera({
            name: 'Test Camera',
            host: '192.168.1.100',
            port: 80,
            username: 'admin',
            password: 'password'
        });
    });

    test('should create camera instance', () => {
        expect(camera.name).toBe('Test Camera');
        expect(camera.host).toBe('192.168.1.100');
        expect(camera.port).toBe(80);
        expect(camera.isConnected).toBe(false);
    });

    test('should get status', () => {
        const status = camera.getStatus();
        expect(status).toHaveProperty('name');
        expect(status).toHaveProperty('host');
        expect(status).toHaveProperty('isConnected');
        expect(status).toHaveProperty('status');
        expect(status.name).toBe('Test Camera');
        expect(status.isConnected).toBe(false);
        expect(status.status).toBe('offline');
    });
});
