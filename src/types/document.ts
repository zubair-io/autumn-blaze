/**
 * Document type definition for Papers
 *
 * Documents are stored as Papers with type='document' and contain
 * TipTap/ProseMirror JSON content for rich text editing.
 */

export interface IDocumentData {
  /** Unique identifier for the document (client-generated UUID v4) */
  documentId: string;

  /** Document title (extracted from first line or first 50 chars) */
  title: string;

  /** TipTap/ProseMirror JSON content */
  content: any;

  /** Last modified timestamp (for conflict resolution) */
  lastModified: Date;

  /** Client version number (for optimistic locking) */
  version?: number;
}
