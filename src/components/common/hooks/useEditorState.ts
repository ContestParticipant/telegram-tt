import { useCallback, useSignal, useState } from '../../../lib/teact/teact';

export function useEditorState(defaultHtml = '') {
  const [getHtml, originalSetHtml] = useSignal(defaultHtml);
  const [overwrite, setOverwrite] = useState(false);
  const [htmlOverwrite, setHtmlOverwrite] = useSignal(defaultHtml);

  const setHtml = useCallback((html: string) => {
    if (!html) {
      setOverwrite((v) => !v);
    }
    setHtmlOverwrite(html);
  }, [setHtmlOverwrite, setOverwrite]);

  return {
    getHtml,
    setHtml,
    overwrite,
    htmlOverwrite,
    originalSetHtml,
  };
}
