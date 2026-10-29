declare module "icojs" {
  export interface EncodeIcoInput {
    buffer: ArrayBuffer | Uint8Array;
  }

  export function encodeIco(input: EncodeIcoInput[]): Promise<Uint8Array>;
}