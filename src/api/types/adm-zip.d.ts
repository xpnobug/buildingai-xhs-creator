declare module "adm-zip" {
    import type { Buffer } from "node:buffer";

    export default class AdmZip {
        constructor(input?: string | Buffer | undefined);
        addFile(entryName: string, data: Buffer): void;
        toBuffer(): Buffer;
    }
}

