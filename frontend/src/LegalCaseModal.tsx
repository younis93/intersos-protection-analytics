
import {
FileQuestion,
X
} from "lucide-react";
import { useEffect,useState } from "react";
import {
getLegalCase
} from "./api";
import { CaseTree } from './LegalCaseTree';
import { LegalSkeleton } from './LegalSkeleton';
import type { LegalMetadata } from "./types";

export function CaseReviewModal({ caseId, metadata, onClose }: { caseId: string; metadata: LegalMetadata; onClose: () => void }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);setError("");
    getLegalCase(caseId, {}, {}, controller.signal).then(next => {if(!controller.signal.aborted)setData(next)}).catch((reason) => {
      if (reason.name !== "AbortError") setError(reason.message || "Unable to open this case.");
    });
    return () => controller.abort();
  }, [caseId]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const item=data?.cases?.[0];
  return <div className="case-review-modal" role="dialog" aria-modal="true" aria-label={`Case ${caseId}`}>
    <button className="case-modal-backdrop" aria-label="Close case" onClick={onClose} />
    <section className="case-modal-panel">
      <header><div><span className="eyebrow">CASE REVIEW</span><h2 data-copy-value={caseId} title="Click to copy Case ID">Case {caseId}</h2></div><button className="soft" onClick={onClose} aria-label="Close case review" title="Close"><X /></button></header>
      <div className="case-modal-scroll">
        {error && <div className="error">{error}</div>}
        {!data ? <LegalSkeleton variant="cases" /> : item ? <CaseTree item={item} metadata={metadata} showBeneficiary /> : <div className="legal-empty"><FileQuestion /><h3>Case not found</h3></div>}
      </div>
    </section>
  </div>;
}
