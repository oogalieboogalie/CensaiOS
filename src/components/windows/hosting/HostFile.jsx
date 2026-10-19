/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

// One file a place to host reads, with Copy and Download.
export function HostFile({ file }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <figure className="hb-host-file" data-testid={`host-file-${file.name}`}>
      <figcaption className="hb-host-file-head">
        <code className="hb-host-file-name">{file.name}</code>
        <span className="hb-host-spacer" />
        <button type="button" className="hb-host-btn" onClick={copy}>{copied ? <><Icon.Check size={12} /> Copied</> : <><Icon.Copy size={12} /> Copy</>}</button>
        <button type="button" className="hb-host-btn" onClick={download}><Icon.Download size={12} /> Download</button>
      </figcaption>
      <pre className="hb-host-code">{file.text}</pre>
    </figure>
  );
}
