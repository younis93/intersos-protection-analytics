import {RefreshCw} from "lucide-react";
import {UpdateFallbackNotice} from "./UpdateFallbackNotice";
import {formatUpdateSize, UpdateReleaseNotes} from "./UpdateReleaseNotes";
import {activeUpdatePhases, type useAppUpdate} from "./useAppUpdate";

export function AppUpdateDialog({info, status, open, checking, checkError, check, install, close}: ReturnType<typeof useAppUpdate>) {
  if (!open) return null;

  let heading = "Checking for updates…";
  if (checkError) heading = "Unable to check for updates";
  else if (info?.available) heading = `Version ${info.latestVersion} is available`;
  else if (!checking && info) heading = info.enabled ? "You’re up to date" : "Updates need configuration";

  const updating = status && activeUpdatePhases.includes(status.phase);
  const canInstall = info?.available && !checkError && !updating;
  const closingDisabled = status?.phase === "installing" || status?.phase === "restarting";

  return <div className="modal-backdrop">
    <section className="update-modal glass" role="dialog" aria-modal="true" aria-label="Application update">
      <div className="update-icon" data-updating={checking || Boolean(updating)} aria-hidden="true"><RefreshCw/></div>
      <span className="eyebrow">APPLICATION UPDATE</span>
      <h2>{heading}</h2>
      {checking && <p role="status" className="update-check-status">Looking for the latest version of Iraq Data Analysis.</p>}
      {checkError && <p role="alert" className="update-check-error">{checkError}</p>}
      {info?.available && <>
        {checkError && <p>Release notes from the last check for version {info.latestVersion}.</p>}
        <UpdateReleaseNotes notes={info.notes} sizeBytes={info.sizeBytes}/>
      </>}
      {!checking && !checkError && info && !info.available &&
        <p>{info.message || `You are using version ${info.currentVersion}.`}</p>}
      {status && status.phase !== "idle" && <div className="update-progress">
        <div><span>{status.phase}</span><strong>{status.progress}%</strong></div>
        <i><b style={{width: `${status.progress}%`}}/></i>
        {status.phase === "downloading" && <small>
          Downloaded {formatUpdateSize(status.downloadedBytes)} of {formatUpdateSize(status.totalBytes || info?.sizeBytes)}
        </small>}
        {status.error && <em>{status.error}</em>}
      </div>}
      {info?.available && <UpdateFallbackNotice failed={status?.phase === "error"}/>}
      <div className="update-actions">
        {checkError && <button className="primary" onClick={check}>Check again</button>}
        {canInstall && <button className="primary" onClick={install}>{status?.phase === "error" ? "Try again" : "Update now"}</button>}
        <button className="soft" onClick={close} disabled={closingDisabled}>{info?.available && !checkError ? "Later" : "Close"}</button>
      </div>
    </section>
  </div>;
}
