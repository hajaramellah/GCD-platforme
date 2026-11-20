import { ApplicationDocument, DoctoralSubject, DocumentType } from '../types';

export interface DocumentRequirementSpec {
  type: DocumentType;
  label: string;
  isRequired: boolean;
  category: 'commun' | 'specifique_sujet';
  apogeeAutoEligible?: boolean;
}

export const COMMON_DOCUMENT_TYPES = new Set<DocumentType>([
  'cin',
  'bac',
  'licence',
  'master',
  'releves_notes',
  'cv',
  'attestation_non_travail',
  'autorisation_employeur',
]);

export const SUBJECT_SPECIFIC_DOCUMENT_TYPES = new Set<DocumentType>([
  'lettre_motivation',
  'projet_recherche',
  'lettre_recommandation',
  'certification_langue',
]);

export const COMMON_DOCUMENT_SPECS: DocumentRequirementSpec[] = [
  { type: 'cin', label: "Carte d'Identité Nationale (CIN)", isRequired: true, category: 'commun' },
  { type: 'bac', label: 'Baccalauréat', isRequired: true, category: 'commun', apogeeAutoEligible: true },
  { type: 'licence', label: 'Diplôme de Licence', isRequired: true, category: 'commun', apogeeAutoEligible: true },
  { type: 'master', label: "Diplôme de Master ou d'Ingénieur", isRequired: true, category: 'commun', apogeeAutoEligible: true },
  { type: 'releves_notes', label: 'Relevés de notes (Master S1-S4)', isRequired: true, category: 'commun', apogeeAutoEligible: true },
  { type: 'cv', label: 'Curriculum Vitae (CV Académique)', isRequired: true, category: 'commun' },
  { type: 'attestation_non_travail', label: 'Attestation de non-travail (ou justificatif de statut)', isRequired: true, category: 'commun' },
];

export const BASE_SUBJECT_DOCUMENT_SPECS: DocumentRequirementSpec[] = [
  { type: 'lettre_motivation', label: 'Lettre de motivation', isRequired: true, category: 'specifique_sujet' },
  { type: 'projet_recherche', label: 'Projet de thèse / Avant-projet de recherche', isRequired: true, category: 'specifique_sujet' },
];

export function isCommonDocumentType(type: DocumentType): boolean {
  return COMMON_DOCUMENT_TYPES.has(type);
}

export function isSubjectSpecificDocumentType(type: DocumentType): boolean {
  return SUBJECT_SPECIFIC_DOCUMENT_TYPES.has(type);
}

export function getRequiredDocumentsForSubject(subject?: DoctoralSubject | null): DocumentRequirementSpec[] {
  const base = [...COMMON_DOCUMENT_SPECS, ...BASE_SUBJECT_DOCUMENT_SPECS];
  if (!subject?.requiredExtraDocuments || subject.requiredExtraDocuments.length === 0) {
    return base;
  }

  const existingTypes = new Set(base.map((item) => item.type));
  const merged = [...base];
  for (const extra of subject.requiredExtraDocuments) {
    if (existingTypes.has(extra.type)) continue;
    merged.push({
      type: extra.type,
      label: extra.label,
      isRequired: extra.isRequired ?? true,
      category: extra.isSubjectSpecific ? 'specifique_sujet' : 'commun',
    });
    existingTypes.add(extra.type);
  }
  return merged;
}

export function isDocumentProvided(doc?: Pick<ApplicationDocument, 'status' | 'fileName'> | null): boolean {
  if (!doc) return false;
  return (
    doc.status !== 'manquant' &&
    doc.status !== 'rejete' &&
    doc.status !== 'complement_requis' &&
    Boolean(doc.fileName && doc.fileName.trim().length > 0)
  );
}

export interface ApplicationDocumentSummary {
  totalRequired: number;
  providedRequiredCount: number;
  validatedRequiredCount: number;
  pendingRequiredCount: number;
  missingDocs: ApplicationDocument[];
  rejectedDocs: ApplicationDocument[];
  complementDocs: ApplicationDocument[];
  validDocs: ApplicationDocument[];
  pendingDocs: ApplicationDocument[];
  commonDocs: ApplicationDocument[];
  subjectSpecificDocs: ApplicationDocument[];
  isComplete: boolean;
  hasIssues: boolean;
  completionRate: number;
}

export function summarizeApplicationDocuments(documents: ApplicationDocument[] = []): ApplicationDocumentSummary {
  const requiredDocs = documents.filter((d) => d.isRequired);
  const missingDocs = requiredDocs.filter((d) => d.status === 'manquant' || !d.fileName);
  const rejectedDocs = requiredDocs.filter((d) => d.status === 'rejete');
  const complementDocs = requiredDocs.filter((d) => d.status === 'complement_requis');
  const validDocs = requiredDocs.filter((d) => d.status === 'valide');
  const pendingDocs = requiredDocs.filter((d) => d.status === 'en_attente' && Boolean(d.fileName));

  const providedRequiredCount = requiredDocs.filter((d) => isDocumentProvided(d)).length;
  const totalRequired = requiredDocs.length;
  const completionRate = totalRequired > 0 ? Math.round((providedRequiredCount / totalRequired) * 100) : 100;

  return {
    totalRequired,
    providedRequiredCount,
    validatedRequiredCount: validDocs.length,
    pendingRequiredCount: pendingDocs.length,
    missingDocs,
    rejectedDocs,
    complementDocs,
    validDocs,
    pendingDocs,
    commonDocs: documents.filter((d) => isCommonDocumentType(d.type)),
    subjectSpecificDocs: documents.filter((d) => !isCommonDocumentType(d.type)),
    isComplete: missingDocs.length === 0 && rejectedDocs.length === 0 && complementDocs.length === 0,
    hasIssues: missingDocs.length > 0 || rejectedDocs.length > 0 || complementDocs.length > 0,
    completionRate,
  };
}
