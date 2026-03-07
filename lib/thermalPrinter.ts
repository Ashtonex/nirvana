// WebUSB Type Definitions for environments without @types/w3c-web-usb
interface USBDevice {
    open(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
    configuration: {
        interfaces: {
            alternates: {
                endpoints: {
                    endpointNumber: number;
                    direction: string;
                }[];
            }[];
        }[];
    } | null;
}

interface USBOutTransferResult {
    bytesWritten: number;
    status: string;
}

interface Navigator {
    usb: {
        requestDevice(options: { filters: any[] }): Promise<USBDevice>;
    };
}

export class ThermalPrinterService {
    private usbDevice: any | null = null;
    private bluetoothDevice: any | null = null;
    private bluetoothCharacteristic: any | null = null;
    private currentTransport: 'usb' | 'bluetooth' | null = null;

    // Common Thermal Printer BLE UUIDs
    private readonly BLE_SERVICE_UUIDS = [
        '0000ae30-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ff00-0000-1000-8000-00805f9b34fb'
    ];
    private readonly BLE_CHARACTERISTIC_UUIDS = [
        '0000ae01-0000-1000-8000-00805f9b34fb',
        '49535343-8841-43f4-8a54-e7e0167ca04b',
        '0000ff02-0000-1000-8000-00805f9b34fb'
    ];

    async connectUsb() {
        try {
            this.usbDevice = await (navigator as any).usb.requestDevice({
                filters: []
            });

            await this.usbDevice.open();
            if (this.usbDevice.configuration === null) {
                await this.usbDevice.selectConfiguration(1);
            }
            await this.usbDevice.claimInterface(0);
            this.currentTransport = 'usb';
            return true;
        } catch (error) {
            console.error("USB Connection failed:", error);
            return false;
        }
    }

    async connectBluetooth() {
        try {
            const device = await (navigator as any).bluetooth.requestDevice({
                filters: [{ services: this.BLE_SERVICE_UUIDS.concat(['000018f0-0000-1000-8000-00805f9b34fb']) }],
                optionalServices: this.BLE_SERVICE_UUIDS
            });

            const server = await device.gatt.connect();

            // Try known services
            let characteristic = null;
            for (const serviceUuid of this.BLE_SERVICE_UUIDS) {
                try {
                    const service = await server.getPrimaryService(serviceUuid);
                    for (const charUuid of this.BLE_CHARACTERISTIC_UUIDS) {
                        try {
                            characteristic = await service.getCharacteristic(charUuid);
                            if (characteristic) break;
                        } catch (e) { }
                    }
                    if (characteristic) break;
                } catch (e) { }
            }

            if (!characteristic) {
                // If specific service search fails, try to find any writeable characteristic
                const services = await server.getPrimaryServices();
                for (const service of services) {
                    const chars = await service.getCharacteristics();
                    characteristic = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
                    if (characteristic) break;
                }
            }

            if (!characteristic) throw new Error("Could not find a writeable characteristic on the device");

            this.bluetoothDevice = device;
            this.bluetoothCharacteristic = characteristic;
            this.currentTransport = 'bluetooth';
            return true;
        } catch (error) {
            console.error("Bluetooth Connection failed:", error);
            return false;
        }
    }

    async connect() {
        // Default to USB for backward compatibility if called without preference
        return this.connectUsb();
    }

    async printRaw(data: Uint8Array) {
        if (!this.currentTransport) {
            throw new Error("Printer not connected. Please connect via USB or Bluetooth first.");
        }

        if (this.currentTransport === 'usb') {
            if (!this.usbDevice) throw new Error("USB Device not initialized");
            const interfaceNumber = 0;
            const alternateInterface = this.usbDevice.configuration?.interfaces[interfaceNumber].alternates[0];
            const endpointOut = alternateInterface.endpoints.find(
                (e: any) => e.direction === 'out'
            );

            if (!endpointOut) throw new Error("No bulk out endpoint found");
            await this.usbDevice.transferOut(endpointOut.endpointNumber, data);
        } else if (this.currentTransport === 'bluetooth') {
            if (!this.bluetoothCharacteristic) throw new Error("Bluetooth characteristic not initialized");

            // BLE normally has a 20-byte MTU limit for writeWithoutResponse, 
            // but some devices support more. To be safe, we chunk in 20-Byte segments.
            const chunkSize = 20;
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await this.bluetoothCharacteristic.writeValue(chunk);
            }
        }
    }

    async printReceipt(receipt: any) {
        const encoder = new TextEncoder();
        const init = new Uint8Array([0x1b, 0x40]); // ESC @ (Initialize)
        const center = new Uint8Array([0x1b, 0x61, 0x01]); // ESC a 1 (Center)
        const left = new Uint8Array([0x1b, 0x61, 0x00]); // ESC a 0 (Left)
        const boldOn = new Uint8Array([0x1b, 0x45, 0x01]); // ESC E 1 (Bold On)
        const boldOff = new Uint8Array([0x1b, 0x45, 0x00]); // ESC E 0 (Bold Off)
        const cut = new Uint8Array([0x1d, 0x56, 0x41, 0x03]); // GS V A 3 (Paper Cut)

        const chunks: Uint8Array[] = [init, center, boldOn];
        chunks.push(encoder.encode(receipt.shopName.toUpperCase() + "\n"));
        chunks.push(boldOff);
        chunks.push(encoder.encode("NIRVANA PREMIUM NETWORK\n"));
        chunks.push(encoder.encode(`${receipt.dateStamp} ${receipt.timeStamp}\n`));
        chunks.push(encoder.encode("--------------------------------\n"));
        chunks.push(left);

        receipt.items.forEach((item: any) => {
            // Main Line: Item x Qty
            chunks.push(boldOn);
            chunks.push(encoder.encode(`${item.name.substring(0, 24)} x${item.quantity}\n`));
            chunks.push(boldOff);

            // Detail Lines (Indented/Smaller feel)
            chunks.push(encoder.encode(`  Net: $${item.priceNet.toFixed(2)} | Tax: $${item.tax.toFixed(2)}\n`));

            const lineTotal = `Line Total: $${item.totalGross.toFixed(2)}`;
            const spaces = " ".repeat(Math.max(0, 32 - lineTotal.length));
            chunks.push(encoder.encode(spaces + lineTotal + "\n"));
            chunks.push(encoder.encode(" . . . . . . . . . . . . . . . .\n"));
        });

        chunks.push(encoder.encode("--------------------------------\n"));
        chunks.push(encoder.encode(`SUBTOTAL:           $${receipt.subtotal.toFixed(2)}\n`));
        chunks.push(encoder.encode(`TAX (15.5%):        $${receipt.tax.toFixed(2)}\n`));
        chunks.push(boldOn);
        chunks.push(encoder.encode(`TOTAL:              $${receipt.total.toFixed(2)}\n`));
        chunks.push(boldOff);
        chunks.push(encoder.encode("--------------------------------\n"));
        chunks.push(center);
        chunks.push(encoder.encode(`ORDER ID: ${receipt.orderId}\n`));
        chunks.push(encoder.encode(`PAYMENT: ${receipt.paymentMethod.toUpperCase()}\n`));
        chunks.push(encoder.encode("\nTHANK YOU FOR SHOPPING!\n\n\n\n"));
        chunks.push(cut);

        // Combine all chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(chunk => {
            combined.set(chunk, offset);
            offset += chunk.length;
        });

        await this.printRaw(combined);
    }

    async printTest() {
        const encoder = new TextEncoder();
        const init = new Uint8Array([0x1b, 0x40]);
        const center = new Uint8Array([0x1b, 0x61, 0x01]);
        const boldOn = new Uint8Array([0x1b, 0x45, 0x01]);
        const boldOff = new Uint8Array([0x1b, 0x45, 0x00]);
        const cut = new Uint8Array([0x1d, 0x56, 0x41, 0x03]);

        const date = new Date().toLocaleString();
        const chunks: Uint8Array[] = [
            init,
            center,
            boldOn,
            encoder.encode("GAME TIME\n"),
            boldOff,
            encoder.encode("Direct USB Printing Test\n"),
            encoder.encode(`${date}\n\n`),
            encoder.encode("Ready for Business!\n\n\n"),
            cut
        ];

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(chunk => {
            combined.set(chunk, offset);
            offset += chunk.length;
        });

        await this.printRaw(combined);
    }
}

export const thermalPrinter = new ThermalPrinterService();
