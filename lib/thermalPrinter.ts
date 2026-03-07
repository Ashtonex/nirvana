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
            console.log("Requesting Bluetooth device...");
            // Many thermal printers don't advertise their primary service UUID.
            // Using acceptAllDevices makes it much easier to find them.
            const device = await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    ...this.BLE_SERVICE_UUIDS,
                    '000018f0-0000-1000-8000-00805f9b34fb', // Generic printer
                    '000018f1-0000-1000-8000-00805f9b34fb',
                    '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
                    '0000ff00-0000-1000-8000-00805f9b34fb',
                ]
            });

            console.log("Connecting to GATT Server...");
            const server = await device.gatt.connect();

            console.log("Searching for services...");
            // Try known services first
            let characteristic = null;

            // Re-merge UUIDs for more thorough search
            const allServiceUuids = [
                ...this.BLE_SERVICE_UUIDS,
                '000018f0-0000-1000-8000-00805f9b34fb',
                '000018f1-0000-1000-8000-00805f9b34fb',
                '0000ff00-0000-1000-8000-00805f9b34fb'
            ];

            for (const serviceUuid of allServiceUuids) {
                try {
                    const service = await server.getPrimaryService(serviceUuid);
                    console.log(`Found service: ${serviceUuid}`);
                    for (const charUuid of this.BLE_CHARACTERISTIC_UUIDS) {
                        try {
                            characteristic = await service.getCharacteristic(charUuid);
                            if (characteristic) {
                                console.log(`Found characteristic: ${charUuid}`);
                                break;
                            }
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

        // Header
        chunks.push(encoder.encode(receipt.shopName.toUpperCase() + "\n"));
        chunks.push(boldOff);
        chunks.push(encoder.encode("NIRVANA PREMIUM NETWORK\n"));
        chunks.push(encoder.encode(`${receipt.dateStamp} ${receipt.timeStamp}\n`));
        chunks.push(encoder.encode(`CASHIER: ${receipt.cashier.toUpperCase()}\n`));
        chunks.push(encoder.encode("--------------------------------\n"));
        chunks.push(left);

        // Column Headers
        chunks.push(encoder.encode("ITEM x QTY       TAX     TOTAL\n"));
        chunks.push(encoder.encode("--------------------------------\n"));

        receipt.items.forEach((item: any) => {
            // Line 1: Item Name
            const itemName = item.name.substring(0, 24);
            chunks.push(boldOn);
            chunks.push(encoder.encode(itemName + "\n"));
            chunks.push(boldOff);

            // Line 2: Qty x Net   Tax   Total
            const qtyStr = `${item.quantity} x ${item.priceNet.toFixed(2)}`;
            const taxStr = item.tax.toFixed(2);
            const totalStr = item.totalGross.toFixed(2);

            // Layout: Qty x Price (14) | Tax (8) | Total (10) = 32 chars
            const row = `${qtyStr.padEnd(14)} ${taxStr.padStart(7)} ${totalStr.padStart(9)}\n`;
            chunks.push(encoder.encode(row));
            chunks.push(encoder.encode(" . . . . . . . . . . . . . . . .\n"));
        });

        chunks.push(encoder.encode("--------------------------------\n"));

        // Totals
        const subtotalStr = `$${receipt.subtotal.toFixed(2)}`;
        const taxTotalStr = `$${receipt.tax.toFixed(2)}`;
        const totalStr = `$${receipt.total.toFixed(2)}`;

        chunks.push(encoder.encode(`SUBTOTAL (PRE-TAX): ${subtotalStr.padStart(12)}\n`));
        chunks.push(encoder.encode(`TAX (15.5%):        ${taxTotalStr.padStart(12)}\n`));
        chunks.push(boldOn);
        chunks.push(encoder.encode(`TOTAL DUE:          ${totalStr.padStart(12)}\n`));
        chunks.push(boldOff);
        chunks.push(encoder.encode("--------------------------------\n"));

        chunks.push(center);
        chunks.push(encoder.encode(`PAYMENT: ${receipt.paymentMethod.toUpperCase()}\n`));
        chunks.push(encoder.encode(`ORDER: ${receipt.orderId}\n`));

        // QR Code
        const qrData = `VERIFY_NIRVANA_${receipt.transactionId || receipt.orderId}`;
        chunks.push(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06])); // Set QR size (6)
        chunks.push(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30])); // Set error correction

        const dataBytes = encoder.encode(qrData);
        const pL = (dataBytes.length + 3) % 256;
        const pH = Math.floor((dataBytes.length + 3) / 256);
        chunks.push(new Uint8Array([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30])); // Store data
        chunks.push(dataBytes);
        chunks.push(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])); // Print QR

        chunks.push(encoder.encode("\nTHANK YOU FOR SHOPPING!\n"));

        // Footer (Small print feel via normal text at bottom)
        chunks.push(encoder.encode("--------------------------------\n"));
        chunks.push(encoder.encode("FLECTERE TECHNOLOGIES\n"));
        chunks.push(encoder.encode("\n\n\n\n"));
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
        // Just a dummy receipt to test the layout
        const mockReceipt = {
            shopName: "Nirvana Test Shop",
            cashier: "Admin",
            dateStamp: new Date().toLocaleDateString(),
            timeStamp: new Date().toLocaleTimeString(),
            items: [
                { name: "Test Product 1", quantity: 2, priceNet: 10.00, tax: 3.10, totalGross: 23.10 },
                { name: "Test Product 2", quantity: 1, priceNet: 5.00, tax: 0.78, totalGross: 5.78 }
            ],
            subtotal: 15.00,
            tax: 3.88,
            total: 28.88,
            orderId: "TEST-0001",
            paymentMethod: "Cash",
            transactionId: "MOCK-12345"
        };
        await this.printReceipt(mockReceipt);
    }
}

export const thermalPrinter = new ThermalPrinterService();
