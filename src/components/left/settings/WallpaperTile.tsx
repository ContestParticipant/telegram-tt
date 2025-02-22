import { GZIPPacked } from '../../../lib/gramjs/tl/core';
import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useMemo, useRef,
  useState,
} from '../../../lib/teact/teact';

import type { ApiWallpaper } from '../../../api/types';
import type { ThemeKey } from '../../../types';
import { UPLOADING_WALLPAPER_SLUG } from '../../../types';

import { CUSTOM_BG_CACHE_NAME, WALLPAPER_PATTERN_MIME_TYPE } from '../../../config';
import buildClassName from '../../../util/buildClassName';
import * as cacheApi from '../../../util/cacheApi';
import { fetchBlob } from '../../../util/files';

import useCanvasBlur from '../../../hooks/useCanvasBlur';
import useDerivedState from '../../../hooks/useDerivedState';
import useMedia from '../../../hooks/useMedia';
import useMediaWithLoadProgress from '../../../hooks/useMediaWithLoadProgress';
import usePreviousDeprecated from '../../../hooks/usePreviousDeprecated';
import useShowTransitionDeprecated from '../../../hooks/useShowTransitionDeprecated';

import BackgroundGradient from '../../main/BackgroundGradient';
import ProgressSpinner from '../../ui/ProgressSpinner';

import './WallpaperTile.scss';

type OwnProps = {
  wallpaper: ApiWallpaper;
  theme: ThemeKey;
  isSelected: boolean;
  onClick: (id: string, opacity: number, isMask: boolean, colors?: string[]) => void;
};

const WallpaperTile: FC<OwnProps> = ({
  wallpaper,
  theme,
  isSelected,
  onClick,
}) => {
  // eslint-disable-next-line no-null/no-null
  const divRef = useRef<HTMLDivElement>(null);
  const { id, slug, document } = wallpaper;
  const localMediaHash = `wallpaper${document.id!}`;
  const localBlobUrl = document.previewBlobUrl;
  const previewBlobUrl = useMedia(`${localMediaHash}?size=m`);
  const thumbRef = useCanvasBlur(document.thumbnail?.dataUri, Boolean(previewBlobUrl), true);
  const { transitionClassNames } = useShowTransitionDeprecated(
    Boolean(previewBlobUrl || localBlobUrl),
    undefined,
    undefined,
    'slow',
  );
  const isLoadingRef = useRef(false);
  const [isLoadAllowed, setIsLoadAllowed] = useState(false);
  const {
    mediaData: fullMedia, loadProgress,
  } = useMediaWithLoadProgress(localMediaHash, !isLoadAllowed);
  const wasLoadDisabled = usePreviousDeprecated(isLoadAllowed) === false;
  const { shouldRender: shouldRenderSpinner, transitionClassNames: spinnerClassNames } = useShowTransitionDeprecated(
    (isLoadAllowed && !fullMedia) || slug === UPLOADING_WALLPAPER_SLUG,
    undefined,
    wasLoadDisabled,
    'slow',
  );
  // To prevent triggering of the effect for useCallback
  const cacheKeyRef = useRef<string>();
  cacheKeyRef.current = theme;

  const gradient = useDerivedState(() => {
    return getWallpaperColors(wallpaper);
  }, [wallpaper]);

  const [opacity, isMask] = useMemo(() => {
    return getWallpaperOpacity(wallpaper.pattern, wallpaper.intensity);
  }, [wallpaper]);

  const handleSelect = useCallback(() => {
    (async () => {
      let isPattern = false;
      let blob = await fetchBlob(fullMedia!);
      if (blob.type === WALLPAPER_PATTERN_MIME_TYPE) {
        blob = new Blob([GZIPPacked.ungzip(Buffer.from(await blob.arrayBuffer()))], { type: 'image/svg+xml' });
        isPattern = true;
      }
      await cacheApi.save(CUSTOM_BG_CACHE_NAME, cacheKeyRef.current!, blob);
      onClick(id.toString(), opacity, isMask, isPattern ? gradient : undefined);
    })();
  }, [fullMedia, onClick, id, isMask, opacity, gradient]);

  useEffect(() => {
    // If we've clicked on a wallpaper, select it when full media is loaded
    if (fullMedia && isLoadingRef.current) {
      handleSelect();
      isLoadingRef.current = false;
    }
  }, [fullMedia, handleSelect]);

  const handleClick = useCallback(() => {
    if (fullMedia) {
      handleSelect();
    } else {
      isLoadingRef.current = true;
      setIsLoadAllowed((isAllowed) => !isAllowed);
    }
  }, [fullMedia, handleSelect]);

  const className = buildClassName(
    'WallpaperTile',
    isSelected && 'selected',
  );

  return (
    <div ref={divRef} className={className} onClick={handleClick}>
      <div className="media-inner" style={isMask ? 'background-color: #000' : undefined}>
        <BackgroundGradient
          colors={gradient || undefined}
          size={50}
          maskImage={isMask ? `url(${(previewBlobUrl || localBlobUrl)}` : undefined}
          cover
          noAnimate
        />
        <canvas
          ref={thumbRef}
          className="thumbnail"
        />
        <img
          style={`opacity: ${isMask ? 0 : opacity}; mix-blend-mode: soft-light`}
          src={previewBlobUrl || localBlobUrl}
          className={buildClassName('full-media', transitionClassNames)}
          alt=""
          draggable={false}
        />
        {shouldRenderSpinner && (
          <div className={buildClassName('spinner-container', spinnerClassNames)}>
            <ProgressSpinner progress={loadProgress} onClick={handleClick} />
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(WallpaperTile);

export function getWallpaperColors(wallpaper: ApiWallpaper) {
  let colors = [
    wallpaper.backgroundColor,
    wallpaper.secondBackgroundColor,
    wallpaper.thirdBackgroundColor,
    wallpaper.fourthBackgroundColor,
  ].filter((v) => v);
  if (!colors.length) {
    // fallback colors
    colors = ['#dbddbb', '#6ba587', '#d5d88d', '#88b884'];
  }
  return colors as string[];
}

function getWallpaperOpacity(isPattern: boolean, intensity_?: number) {
  let value = 1;
  const intensity = intensity_ && intensity_ / 100;
  const isDarkPattern = !!intensity && intensity < 0;
  if (intensity) {
    value = Math.abs(intensity) * (isDarkPattern ? 0.5 : 1);
    if (isPattern) {
      value = Math.max(0.3, value);
    } else {
      value = Math.max(0.3, 1 - intensity);
    }
  }
  return [value, isDarkPattern] as const;
}
