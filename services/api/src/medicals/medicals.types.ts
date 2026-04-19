export type MedicalDocumentType = 'bloods' | 'reports' | 'dna' | 'records';

export interface MedicalDocument {
  id: string;
  type: MedicalDocumentType;
  date: string;
  filename: string;
  originalName: string;
  source: 'manual' | 'google_drive' | 'dropbox';
  sourceRef?: string;
  hash: string;
  textPath: string;
  filePath: string;
  createdAt: string;
  notes?: string;
  folder?: string;  // user-defined folder name
}

export interface MedicalFolder {
  name: string;
  createdAt: string;
  documentCount: number;
}

export interface BloodCategory {
  id: string;
  canonical: string;
  synonyms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BloodResult {
  date: string;
  category: string;
  raw_name: string;
  value: number;
  unit?: string;
  source_doc_id: string;
}

export interface MedicalAskRequest {
  question: string;
  type?: MedicalDocumentType;
  from?: string;
  to?: string;
  docIds?: string[];
}

export interface MedicalAskResponse {
  question: string;
  answer: string;
  sources: Array<{ id: string; date: string; filename: string }>;
}
