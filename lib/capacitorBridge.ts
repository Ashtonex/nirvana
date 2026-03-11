"use client";
/**
 * capacitorBridge.ts
 * 
 * Detects if the app is running inside a Capacitor native shell (Android/iOS)
 * and provides wrappers for Bluetooth that use the native plugin, falling back
 * to Web Bluetooth on desktop browsers.
 */

export function isCapacitor(): boolean {
    return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNative;
}

// ---- Native Bluetooth via @capacitor-community/bluetooth-le ----

let BleClient: any = null;

async function getBleClient() {
    if (!BleClient) {
        const mod = await import('@capacitor-community/bluetooth-le');
        BleClient = mod.BleClient;
    }
    return BleClient;
}

// Known thermal printer service/characteristic UUIDs
const PRINTER_SERVICE_UUIDS = [
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '000018f0-0000-1000-8000-00805f9b34fb',
];

const PRINTER_CHAR_UUIDS = [
    '0000ae01-0000-1000-8000-00805f9b34fb',
    '49535343-8841-43f4-8a54-e7e0167ca04b',
    '0000ff02-0000-1000-8000-00805f9b34fb',
];

interface NativeBtConnection {
    deviceId: string;
    serviceUuid: string;
    charUuid: string;
}

let nativeConnection: NativeBtConnection | null = null;

export async function nativeBluetoothConnect(): Promise<boolean> {
    try {
        const ble = await getBleClient();
        await ble.initialize();

        return new Promise((resolve) => {
            // Show the native device picker
            ble.requestDevice({
                optionalServices: PRINTER_SERVICE_UUIDS,
            }).then(async (device: any) => {
                const deviceId = device.deviceId;
                await ble.connect(deviceId);

                // Find a writable characteristic
                for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
                    for (const charUuid of PRINTER_CHAR_UUIDS) {
                        try {
                            await ble.read(deviceId, serviceUuid, charUuid);
                            nativeConnection = { deviceId, serviceUuid, charUuid };
                            resolve(true);
                            return;
                        } catch {
                            // Try next combination
                        }
                    }
                }

                // Fallback: read all services and find first writable char
                try {
                    const services = await ble.getServices(deviceId);
                    for (const service of services) {
                        for (const char of (service.characteristics || [])) {
                            if (char.properties?.write || char.properties?.writeWithoutResponse) {
                                nativeConnection = {
                                    deviceId,
                                    serviceUuid: service.uuid,
                                    charUuid: char.uuid,
                                };
                                resolve(true);
                                return;
                            }
                        }
                    }
                } catch { }

                resolve(false);
            }).catch(() => resolve(false));
        });
    } catch (err) {
        console.error('Native BLE connect error:', err);
        return false;
    }
}

export async function nativeBluetoothSend(data: Uint8Array): Promise<void> {
    if (!nativeConnection) throw new Error('No native Bluetooth connection');
    const ble = await getBleClient();
    const { deviceId, serviceUuid, charUuid } = nativeConnection;

    // Chunk into 20-byte segments (BLE MTU safe size)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await ble.writeWithoutResponse(deviceId, serviceUuid, charUuid, chunk.buffer);
    }
}

export function nativeBluetoothDisconnect(): void {
    if (!nativeConnection) return;
    getBleClient().then(ble => {
        ble.disconnect(nativeConnection!.deviceId).catch(() => { });
    });
    nativeConnection = null;
}
