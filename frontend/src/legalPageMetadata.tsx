import {
ArrowRight,
ChevronDown,
ChevronLeft,
ChevronRight,
Download,
Expand,
FileText,
Maximize2,
RotateCcw,
Search,
SlidersHorizontal,
X
} from "lucide-react";
import { useEffect,useRef,useState,type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExcelDownloadButton } from './SelectionControls';
import { ValueTable } from "./ValueTable";
import {
exportLegalCases,
exportTableWorkbook,
legalAttachmentDownloadUrl
} from "./api";
import { formatTableValue } from "./dateFormat";
import { mapIntensity,projectGovernorates,type MapFeature } from "./iraqMap";
import type { LegalMetadata } from "./types";

export type LegalPage =
  | "hotline"
  | "legalhotlines"
  | "overview"
  | "beneficiaries"
  | "assessments"
  | "legalservices"
  | "awareness"
  | "deportation"
  | "studio"
  | "detention"
  | "explorer"
  | "cases"
  | "lawyer-intelligence"
  | "send-issues"
  | "indicators";

export const labels: Record<LegalPage, string> = {
  hotline: "Hotline",
  legalhotlines: "Hotline Review",
  overview: "Overview",
  beneficiaries: "Beneficiaries Review",
  assessments: "Assessments Review",
  legalservices: "Legal Services Review",
  awareness: "Awareness Review",
  deportation: "Deportation",
  studio: "Analytics Studio",
  detention: "Detention",
  explorer: "Data Explorer",
  cases: "Beneficiary Cases",
  "lawyer-intelligence": "Lawyer Overview",
  indicators: "Indicator Reporting",
  "send-issues": "Send Issues",
};
