declare module "pica" {
  interface PicaOptions {
    features?: Array<"js" | "wasm" | "ww">;
  }

  interface ResizeOptions {
    filter?: "lanczos2" | "lanczos3" | "hamming" | "box";
    unsharpAmount?: number;
    unsharpRadius?: number;
    unsharpThreshold?: number;
    alpha?: boolean;
  }

  interface PicaInstance {
    resize(
      from: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
      to: HTMLCanvasElement | OffscreenCanvas,
      options?: ResizeOptions
    ): Promise<HTMLCanvasElement | OffscreenCanvas>;
    toBlob(
      canvas: HTMLCanvasElement | OffscreenCanvas,
      mimeType: string,
      quality?: number
    ): Promise<Blob>;
  }

  export default function Pica(options?: PicaOptions): PicaInstance;
}