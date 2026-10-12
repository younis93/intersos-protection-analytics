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

export const exportSvgChart: typeof import("./chartExport").exportSvgChart = async (...args) => (await import("./chartExport")).exportSvgChart(...args);
