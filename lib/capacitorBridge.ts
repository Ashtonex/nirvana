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
        
        // Request permissions for Android 12+
        const perm = await ble.checkPermissions();
        if (perm.bluetooth !== 'granted') {
            const req = await ble.requestPermissions();
            if (req.bluetooth !== 'granted') {
                const msg = 'Bluetooth permissions denied. Please allow in system settings.';
                if (typeof window !== 'undefined') window.alert(msg);
                console.error(msg);
                return false;
            }
        }

        await ble.initialize({ androidNeverForLocation: true });

        // Check if Bluetooth is actually on
        const enabled = await ble.isEnabled();
        if (!enabled.enabled) {
            const msg = 'Bluetooth is OFF. Please turn it on in your phone settings.';
            if (typeof window !== 'undefined') window.alert(msg);
            console.warn(msg);
            return false;
        }

        return new Promise((resolve) => {
            // Show the native device picker
            ble.requestDevice({
                optionalServices: PRINTER_SERVICE_UUIDS,
            }).then(async (device: any) => {
                const deviceId = device.deviceId;
                await ble.connect(deviceId);

                // Try to find a known service/characteristic combination first
                for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
                    for (const charUuid of PRINTER_CHAR_UUIDS) {
                        try {
                            // Check if this specific characteristic exists and is writable
                            const services = await ble.getServices(deviceId);
                            const service = services.find((s: any) => s.uuid === serviceUuid);
                            if (service) {
                                const char = (service.characteristics || []).find((c: any) => c.uuid === charUuid);
                                if (char && (char.properties?.write || char.properties?.writeWithoutResponse)) {
                                    nativeConnection = { deviceId, serviceUuid, charUuid };
                                    resolve(true);
                                    return;
                                }
                            }
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
                } catch (e: any) {
                    console.error('Service discovery failed:', e);
                }

                resolve(false);
            }).catch((e: any) => {
                const msg = e.message || JSON.stringify(e);
                if (typeof window !== 'undefined') window.alert(`Scan/Connect Error: ${msg}`);
                resolve(false);
            });
        });
    } catch (err: any) {
        console.error('Native BLE connect error:', err);
        const msg = err.message || JSON.stringify(err);
        if (typeof window !== 'undefined') window.alert(`Init Error: ${msg}`);
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

// ---- Native Bluetooth Classic (Serial/SPP) via @ascentio-it/capacitor-bluetooth-serial ----

let BtSerial: any = null;

type ClassicBtDevice = {
    name?: string;
    address?: string;
    id?: string;
    class?: number;
};

async function getBtSerial() {
    if (!BtSerial) {
        const mod = await import('@ascentio-it/capacitor-bluetooth-serial');
        BtSerial = mod.BluetoothSerial;
    }
    return BtSerial;
}

let serialAddress: string | null = null;

export async function nativeClassicBluetoothConnect(): Promise<boolean> {
    try {
        // Request permissions via BLE plugin (shares same permissions on Android)
        const ble = await getBleClient();
        const perm = await ble.checkPermissions();
        if (perm.bluetooth !== 'granted') await ble.requestPermissions();

        const serial = await getBtSerial();
        try {
            const enabled = await serial.isEnabled();
            if (!enabled?.enabled) await serial.enable();
        } catch { /* ignore */ }

        // Prefer paired devices (most POS printers are paired in Android Bluetooth settings).
        const paired = await serial.getPairedDevices().catch(() => ({ devices: [] as any[] }));
        const devices: ClassicBtDevice[] = paired?.devices || [];

        // If no paired devices, fall back to scan.
        const list: ClassicBtDevice[] = devices.length
            ? devices
            : (await serial.scan().then((r: any) => (r?.devices || []) as ClassicBtDevice[]).catch(() => []));
        if (!list.length) return false;

        // Pick device: if only one, auto. Otherwise prompt user.
        let selected = list[0];
        if (list.length > 1 && typeof window !== 'undefined') {
            const options = list.map((d: ClassicBtDevice, i: number) => `${i + 1}) ${d.name || 'Unknown'} — ${d.address || d.id}`).join('\n');
            const pick = window.prompt(`Select printer:\n${options}\n\nEnter number:`, "1");
            const idx = Math.max(1, Math.min(list.length, Number(pick || 1))) - 1;
            selected = list[idx];
        }

        const address = selected.address || selected.id;
        if (!address) return false;

        await serial.connectInsecure({ address }).catch(() => serial.connect({ address }));
        serialAddress = address;
        return true;
    } catch (err) {
        console.error('Native Classic connect error:', err);
        return false;
    }
}

function bytesToBinaryString(data: Uint8Array): string {
    // Convert bytes to a 1-byte-per-char string for plugins that accept string payloads.
    // Chunked to avoid call stack limits.
    let out = '';
    const chunk = 4096;
    for (let i = 0; i < data.length; i += chunk) {
        const slice = data.slice(i, i + chunk);
        out += String.fromCharCode(...slice);
    }
    return out;
}

export async function nativeClassicBluetoothSend(data: Uint8Array): Promise<void> {
    if (!serialAddress) throw new Error('No classic Bluetooth connection');
    const serial = await getBtSerial();
    const payload = bytesToBinaryString(data);
    await serial.write({ address: serialAddress, value: payload });
}

export async function nativeClassicBluetoothDisconnect(): Promise<void> {
    if (!serialAddress) return;
    const serial = await getBtSerial();
    const addr = serialAddress;
    serialAddress = null;
    await serial.disconnect({ address: addr }).catch(() => { });
}
