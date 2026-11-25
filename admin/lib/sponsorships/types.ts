// Shapes shared by the sponsorship history component and the server actions. No server code here, so client files can import it.
export type SponsorshipSide = 'creator' | 'brand';
export type SourceLabel = 'confirmed' | 'detected';
export type Origin = 'manual' | 'import' | 'deal' | 'detected';

/** One record as the screen needs it (already joined with the other party and the person who confirmed it). */
export type HistoryRecord = {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorChannel: string | null;
  creatorSubscribers: number | null;
  brandId: string | null;
  /** Linked sponsor name, or the raw name the scanner saw when no sponsor is linked. */
  brandName: string | null;
  brandLinked: boolean;
  /** YYYY-MM-DD or null when the date is not known. */
  sponsoredOn: string | null;
  videoUrl: string | null;
  videoTitle: string | null;
  label: SourceLabel;
  origin: Origin;
  detectionSignal: string | null;
  detectionConfidence: 'high' | 'medium' | 'low' | null;
  evidenceNote: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  createdAt: string;
  rejected: boolean;
};

/** A choice in the "other party" list of the form: a sponsor (side "creator") or a creator (side "brand"). */
export type PartyOption = { id: string; label: string };

export type ActionResult =
  | { ok: true; message: string; /** Name of a sponsor created by this save, so the screen can say so. */ brandCreated?: string }
  | { ok: false; error: string };
