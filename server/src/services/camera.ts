import * as path from 'path';

// Load native addon
let obsbot: any;
try {
    // We expect the build to be in the root's build/Release folder
    obsbot = require('../../build/Release/obsbot_native.node');
} catch (e) {
    console.error('Failed to load native addon:', e);
    obsbot = null;
}

export class CameraService {
    private currentDevice: any = null;
    private initialized = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        if (!obsbot || this.initialized) return;

        try {
            obsbot.initialize((event: { serialNumber: string; connected: boolean }) => {
                console.log(`Device event: ${event.serialNumber} - Connected: ${event.connected}`);
                if (event.connected) {
                    this.selectFirstAvailableDevice();
                } else if (this.currentDevice && this.currentDevice.getDeviceInfo().serialNumber === event.serialNumber) {
                    this.currentDevice = null;
                }
            });
            this.initialized = true;
            this.selectFirstAvailableDevice();
        } catch (error) {
            console.error('Failed to initialize OBSBOT SDK:', error);
        }
    }

    private selectFirstAvailableDevice() {
        if (!obsbot) return;
        const devices = obsbot.getDevices();
        if (devices && devices.length > 0) {
            this.currentDevice = devices[0];
            console.log('Selected device:', this.currentDevice.getDeviceInfo().serialNumber);
        }
    }

    public getStatus() {
        if (!this.currentDevice) return null;
        try {
            return {
                info: this.currentDevice.getDeviceInfo(),
                status: this.currentDevice.getCameraStatus(),
                zoom: this.currentDevice.getZoom()
            };
        } catch (error) {
            return null;
        }
    }

    public async executeCommand(type: string, payload: any) {
        if (!this.currentDevice) {
            throw new Error('No camera connected');
        }

        switch (type) {
            case 'gimbal-set-speed':
                return this.currentDevice.setGimbalSpeed(payload.pitch || 0, payload.pan || 0, payload.roll || 0);
            case 'gimbal-stop':
                return this.currentDevice.stopGimbal();
            case 'gimbal-set-angle':
                return this.currentDevice.setGimbalAngle(payload.pitch || 0, payload.yaw || 0, payload.roll || 0);
            case 'gimbal-reset':
                return this.currentDevice.resetGimbalPosition();
            case 'zoom-set':
                return this.currentDevice.setZoom(payload.zoom);
            case 'ai-set-enabled':
                return this.currentDevice.setAIEnabled(payload.enabled);
            case 'ai-set-mode':
                return this.currentDevice.setAIMode(payload.mode, payload.subMode || 0);
            case 'ai-set-gesture':
                return this.currentDevice.setGestureControl(payload.gesture, payload.enabled);
            case 'ai-set-tracking-speed':
                return this.currentDevice.setTrackingSpeed(payload.speed);
            case 'ai-set-auto-zoom':
                return this.currentDevice.setAutoZoom(payload.enabled);
            case 'ai-select-central':
                return this.currentDevice.selectCentralTarget();
            case 'ai-select-biggest':
                return this.currentDevice.selectBiggestTarget();
            case 'ai-deselect':
                return this.currentDevice.deselectTarget();
            case 'preset-trigger':
                return this.currentDevice.triggerPreset(payload.id);
            case 'preset-add':
                return this.currentDevice.addPreset();
            default:
                throw new Error(`Unknown command: ${type}`);
        }
    }

    public isRunning(): boolean {
        return this.currentDevice !== null;
    }

    public close() {
        if (obsbot) {
            obsbot.close();
        }
    }
}

export const cameraService = new CameraService();
