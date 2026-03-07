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
    private device: any | null = null;

    async connect() {
        try {
            this.device = await (navigator as any).usb.requestDevice({
                filters: []
            });

            await this.device.open();
            if (this.device.configuration === null) {
                await this.device.selectConfiguration(1);
            }
            await this.device.claimInterface(0);
            return true;
        } catch (error) {
            console.error("USB Connection failed:", error);
            return false;
        }
    }

    async printRaw(data: Uint8Array) {
        if (!this.device) {
            const connected = await this.connect();
            if (!connected) throw new Error("Printer not connected");
        }

        const interfaceNumber = 0;
        const alternateInterface = this.device?.configuration?.interfaces[interfaceNumber].alternates[0];
        const endpointOut = alternateInterface.endpoints.find(
            (e: any) => e.direction === 'out'
        );

        if (!endpointOut) throw new Error("No bulk out endpoint found");

        await this.device?.transferOut(endpointOut.endpointNumber, data);
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
}

export const thermalPrinter = new ThermalPrinterService();
