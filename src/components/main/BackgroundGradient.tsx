import React, { memo, useEffect, useRef } from '../../lib/teact/teact';

import { getAnimate } from '../../lib/twallpaper-webgl';
import buildClassName from '../../util/buildClassName';

import styles from './BackgroundGradient.module.scss';

// eslint-disable-next-line no-spaced-func
const instances = new Map<HTMLCanvasElement, () => void>();
function BackgroundGradient({
  colors,
  size,
  maskImage,
  cover,
  noAnimate,
}: { colors?: string[]; size?: number; maskImage?: string; cover?: boolean; noAnimate?: boolean }) {
  // eslint-disable-next-line no-null/no-null
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  useEffect(() => {
    if (!colors) {
      return () => {};
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return () => {};
    }
    if (noAnimate) {
      getAnimate(canvas, colors ?? []);
      return () => {};
    }
    let currentInstance = instances.get(canvas);
    if (!currentInstance) {
      currentInstance = getAnimate(canvas, colors ?? []);
      instances.set(canvas, currentInstance);
    }
    return () => instances.delete(canvas);
  }, [canvasRef, colors, noAnimate, cover]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={buildClassName(maskImage && styles.mask, cover && styles.cover)}
      style={maskImage ? `--mask-image: ${maskImage}` : undefined}
    />
  );
}

export default memo(BackgroundGradient);

export function toNextPositionGlobal() {
  for (const instance of instances.values()) {
    instance();
  }
}
