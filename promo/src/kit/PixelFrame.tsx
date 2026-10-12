import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { useDelayRender } from "remotion";

export type Crop = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type PixelFrameProps = {
  // A 384 x 216 picture of the game.
  readonly src: string;
  // The part of it to show, in game pixels. Default: all of it.
  readonly crop?: Crop;
  // The width it is shown at. The height follows from the crop.
  readonly width: number;
  readonly style?: React.CSSProperties;
};

const images = new Map<string, Promise<HTMLImageElement>>();

const loadImage = (src: string) => {
  let p = images.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${src}`));
      img.src = src;
    });
    images.set(src, p);
    // Frames are small, but a long preview would otherwise keep every one of them.
    if (images.size > 400) {
      const first = images.keys().next().value;
      if (first !== undefined) images.delete(first);
    }
  }
  return p;
};

// Draws a game frame with hard pixel edges. The picture is enlarged by a whole number on a canvas
// (no smoothing), and the canvas is then shown at `width`. When `width` is a whole multiple of the
// crop's width, every game pixel is an exact square.
export const PixelFrame: React.FC<PixelFrameProps> = ({ src, crop, width, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const cx = crop ? crop.x : 0;
  const cy = crop ? crop.y : 0;
  const cw = crop ? crop.w : 384;
  const ch = crop ? crop.h : 216;
  const k = Math.max(1, Math.ceil(width / cw - 1e-6));
  const pw = Math.round(cw * k);
  const ph = Math.round(ch * k);

  useLayoutEffect(() => {
    const handle = delayRender(`frame ${src}`);
    let live = true;
    loadImage(src)
      .then((img) => {
        const canvas = ref.current;
        if (live && canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, pw, ph);
            ctx.drawImage(img, cx, cy, cw, ch, 0, 0, pw, ph);
          }
        }
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
    return () => {
      live = false;
    };
  }, [src, cx, cy, cw, ch, pw, ph, delayRender, continueRender, cancelRender]);

  return (
    <canvas
      ref={ref}
      width={pw}
      height={ph}
      style={{ display: "block", width, height: (width * ch) / cw, ...style }}
    />
  );
};
