import { Download, ExternalLink } from "lucide-react";

export function UpdateFallbackNotice({failed = false}: {failed?: boolean}) {
  return <aside className="update-fallback-notice" aria-label={failed ? "Update recovery options" : "Manual installation option"} role={failed ? "alert" : undefined}>
    <span className="update-fallback-icon" aria-hidden="true"><Download /></span>
    <div>
      <strong>{failed ? "The update could not be completed" : "Having trouble updating?"}</strong>
      <p>{failed ? "Try again, or open the installer folder to download the latest installer and install it manually." : "If the update fails, download the installer from Google Drive and install it manually."}</p>
      <a href="https://drive.google.com/drive/u/0/folders/1B3IWM6GzluVn34pMq0lGy6V2adDyZef5" target="_blank" rel="noopener noreferrer">
        <span>Open installer folder</span><ExternalLink aria-hidden="true" />
      </a>
    </div>
  </aside>;
}
