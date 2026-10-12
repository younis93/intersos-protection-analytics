import {
X
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
legalAttachmentDownloadUrl
} from "./api";
import { formatTableValue } from "./dateFormat";

export const value = (input: unknown) => formatTableValue(input);

export function SecuredDocumentActions({ url }: { url: string }) {
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "failed"
  >("idle");
  const [viewerOpen, setViewerOpen] = useState(false);
  const pdf = /\.pdf(?:\?|$)/i.test(url);
  const filename = decodeURIComponent(url.split("?")[0].split("/").pop() || "Secured document");

  const download = async () => {
    if (downloadState === "downloading") return;
    setDownloadState("downloading");
    try {
      const response = await fetch(legalAttachmentDownloadUrl(url));
      if (!response.ok) throw new Error("The document could not be downloaded.");
      const attachment = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
        "secured-document";
      const objectUrl = URL.createObjectURL(attachment);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setDownloadState("idle");
    } catch {
      setDownloadState("failed");
    }
  };

  return (
    <>
      <span className="attachment-actions">
        <button
          className="attachment-preview-trigger"
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Preview ${filename}`}
        >
          {pdf ? (
            <iframe src={url} title="PDF thumbnail" loading="lazy" />
          ) : (
            <img src={url} alt="Document thumbnail" loading="lazy" />
          )}
          <span>Preview</span>
        </button>
        <button type="button" onClick={() => setViewerOpen(true)}>
          View
        </button>
        <button
          type="button"
          onClick={download}
          disabled={downloadState === "downloading"}
          aria-busy={downloadState === "downloading"}
        >
          {downloadState === "downloading" ? (
            <>
              <span className="attachment-download-spinner" aria-hidden="true" />
              Downloading…
            </>
          ) : downloadState === "failed" ? (
            "Try again"
          ) : (
            "Download"
          )}
        </button>
      </span>
      {viewerOpen &&
        createPortal(
          <div className="attachment-viewer-modal" role="dialog" aria-modal="true" aria-label={`Preview ${filename}`}>
            <button className="case-modal-backdrop" aria-label="Close document preview" onClick={() => setViewerOpen(false)} />
            <section className="attachment-viewer-panel">
              <header>
                <div>
                  <span>SECURED DOCUMENT</span>
                  <h2>{filename}</h2>
                  <p>{pdf ? "PDF preview" : "Image preview"}</p>
                </div>
                <div className="attachment-viewer-actions">
                  <a href={url} target="_blank" rel="noreferrer">Open in browser</a>
                  <button className="icon" type="button" onClick={() => setViewerOpen(false)} aria-label="Close document preview"><X /></button>
                </div>
              </header>
              <div className="attachment-viewer-content">
                {pdf ? <iframe src={url} title={filename} /> : <img src={url} alt={filename} />}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

export function renderCell(input: unknown, column = "") {
  const text = value(input);
  if (/^https?:\/\//i.test(text)) {
    const secured = /secured documents files/i.test(column),
      pdf = /\.pdf(?:\?|$)/i.test(text),
      image = !pdf && (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(text) || secured);
    return (
      <span
        className={`legal-link-cell ${image || pdf ? "image-attachment" : ""}`}
      >
        {secured ? (
          <SecuredDocumentActions url={text} />
        ) : (
          <a href={text} target="_blank" rel="noreferrer">
            Open attachment
          </a>
        )}
      </span>
    );
  }
  return text;
}

export function englishOnly(input: unknown) {
  const values = String(input || "")
    .split(",")
    .map((part) =>
      (part.split(/[\u0600-\u06ff]/)[0] || "")
        .replace(/[\s,\-/–—]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return Array.from(new Set(values)).join(", ") || "Not specified";
}
