// Type definitions for GCD USMBA Platform

export type UserRole =
  | 'candidat'
  | 'enseignant_chercheur'
  | 'responsable_labo'
  | 'administration'
  | 'responsable_formation'
  | 'jury'
  | 'doctorant'
  | 'directeur_these'
  | 'responsable_gcd';

export type StudentOriginType = 'interne_usmba' | 'externe';

export type DocumentProvenance = 'recupere_administration' | 'fourni_candidat';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cin: string; // Carte d'Identité Nationale
  cne?: string; // Code National de l'Étudiant (pour candidats/doctorants)
  phone: string;
  establishmentId: string;
  laboratoryId?: string;
  roles: UserRole[];
  currentRole: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  googleId?: string;
  googleLinkedAt?: string;
  avatarUrl?: string;
  createdAt: string;
  studentOriginType?: StudentOriginType;
  originEstablishment?: string;
  masterSpecialty?: string;
  academicYear?: string;
  registrationMethod?: 'camera' | 'upload' | 'manual';
  identityDocuments?: {
    cinImage?: string;
    studentCardImage?: string;
    scannedAt?: string;
  };
  sharedDocuments?: ApplicationDocument[];
}

export interface Establishment {
  id: string;
  name: string;
  shortName: string;
  city: string;
  code: string;
}

export interface Laboratory {
  id: string;
  name: string;
  code: string;
  establishmentId: string;
  directorName: string;
  disciplines: string[];
}

export type SubjectStatus =
  | 'brouillon'
  | 'soumis'
  | 'en_attente_validation'
  | 'correction_demandee'
  | 'valide'
  | 'rejete'
  | 'non_attribue'
  | 'publie'
  | 'archive';

export type SubjectType = 'officiel' | 'indicatif';

export interface SubjectValidationEvent {
  id: string;
  subjectId: string;
  actorName: string;
  actorRole: UserRole;
  action: 'soumission' | 'approbation' | 'rejet' | 'demande_correction';
  comment?: string;
  timestamp: string;
}

export interface DoctoralSubject {
  id: string;
  // Attributs demandés pour la GCD USMBA
  titre?: string;
  title: string;
  description?: string;
  abstract: string;
  problematique?: string;
  objectifs?: string;
  objectives?: string;
  domaine?: string;
  discipline: string;
  specialite?: string;
  mots_cles?: string[];
  keywords: string[];
  professeur_id?: string | null;
  professeur_nom?: string;
  supervisorId?: string | null;
  supervisorName?: string | null;
  coSupervisorName?: string;
  laboratoire?: string;
  laboratoryId: string;
  etablissement?: string;
  establishmentId: string;
  statut?: SubjectStatus;
  status: SubjectStatus;
  type_sujet?: SubjectType;
  date_creation?: string;
  submissionDate: string;
  prerequisites?: string;
  methodology?: string;
  maxCandidates: number;
  rejectionReason?: string;
  correctionComment?: string;
  validationDate?: string;
  academicYear: string;
  requiredExtraDocuments?: {
    type: DocumentType;
    label: string;
    isSubjectSpecific: boolean;
    isRequired?: boolean;
  }[];
}

export type ApplicationStatus =
  | 'brouillon'
  | 'soumise'
  | 'en_cours_verification'
  | 'incomplete'
  | 'correction_demandee'
  | 'corrigee'
  | 'recevable'
  | 'en_cours_evaluation'
  | 'entretien_programme'
  | 'en_attente_decision'
  | 'admise'
  | 'liste_attente'
  | 'non_admise';

export type DocumentType =
  | 'cin'
  | 'bac'
  | 'licence'
  | 'master'
  | 'releves_notes'
  | 'cv'
  | 'lettre_motivation'
  | 'projet_recherche'
  | 'attestation_non_travail'
  | 'autorisation_employeur'
  | 'lettre_recommandation'
  | 'certification_langue';

export interface ApplicationDocument {
  id: string;
  type: DocumentType;
  label: string;
  fileName: string;
  fileSize: number; // in bytes
  fileUrl: string;
  isRequired: boolean;
  status: 'valide' | 'rejete' | 'en_attente' | 'manquant' | 'complement_requis';
  provenance?: DocumentProvenance;
  isDemoApogee?: boolean;
  uploadedAt?: string;
  rejectionReason?: string;
}

export interface CorrectionRequest {
  id: string;
  applicationId: string;
  requestedBy: string;
  requestedAt: string;
  deadline: string;
  comment: string;
  missingOrInvalidDocs: DocumentType[];
  isResolved: boolean;
  resolvedAt?: string;
}

export interface ApplicationStatusHistory {
  id: string;
  status: ApplicationStatus;
  comment?: string;
  changedBy: string;
  timestamp: string;
}

export interface CandidateApplication {
  id: string;
  referenceNumber: string; // e.g. USMBA-DOC-2026-7842
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  cin: string;
  cne: string;
  subjectId: string;
  subjectTitle: string;
  laboratoryId: string;
  establishmentId: string;
  supervisorName: string;
  discipline: string;
  masterOriginUniversity: string;
  masterSpecialty: string;
  masterGraduationYear: number;
  masterMention: 'Très Bien' | 'Bien' | 'Assez Bien' | 'Passable';
  status: ApplicationStatus;
  assignedReviewerId?: string;
  assignedReviewerName?: string;
  documents: ApplicationDocument[];
  correctionRequests: CorrectionRequest[];
  statusHistory: ApplicationStatusHistory[];
  submittedAt: string;
  updatedAt: string;
  score?: number; // consolidated score 0-20
  rank?: number;
  studentOriginType?: StudentOriginType;
  apogeeSyncStatus?: 'not_configured' | 'synced' | 'external';
}

export interface InterviewSlot {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  roomOrLink: string;
  juryMemberNames: string[];
  applicationId?: string;
  candidateName?: string;
  subjectTitle?: string;
  isBooked: boolean;
  notificationSent: boolean;
}

export interface CandidateEvaluation {
  id: string;
  applicationId: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole: 'enseignant_chercheur' | 'jury';
  academicDossierScore: number; // /5
  researchProposalScore: number; // /5
  interviewScore: number; // /5
  fitWithLaboratoryScore: number; // /5
  totalScore: number; // /20
  recommendation: 'favorable_fort' | 'favorable' | 'reserve' | 'defavorable';
  observations: string;
  submittedAt: string;
}

export interface SelectionReportVersion {
  version: number;
  updatedAt: string;
  updatedBy: string;
  summary: string;
  totalAdmitted: number;
  totalWaiting: number;
  totalRejected: number;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface SelectionReport {
  id: string;
  establishmentId: string;
  laboratoryId: string;
  academicYear: string;
  status: 'brouillon' | 'en_validation' | 'valide' | 'publie';
  currentVersion: number;
  versions: SelectionReportVersion[];
  admittedApplicationIds: string[];
  waitingApplicationIds: string[];
  rejectedApplicationIds: string[];
  publishedAt?: string;
}

export type RegistrationStatus =
  | 'en_attente'
  | 'incomplet'
  | 'en_cours_verification'
  | 'valide'
  | 'rejete';

export interface AdministrativeRegistration {
  id: string;
  applicationId: string;
  candidateId: string;
  studentName: string;
  cin: string;
  cne: string;
  subjectTitle: string;
  laboratoryId: string;
  establishmentId: string;
  supervisorName: string;
  academicYear: string;
  status: RegistrationStatus;
  documents: {
    id: string;
    label: string;
    fileName: string;
    fileUrl?: string;
    status: 'fourni' | 'manquant' | 'rejete' | 'conforme';
    required: boolean;
  }[];
  notes?: string;
  submittedAt?: string;
  validatedAt?: string;
  validatedBy?: string;
}

export type ReRegistrationStatus =
  | 'en_attente'
  | 'soumis'
  | 'avis_directeur_donne'
  | 'en_cours_verification'
  | 'valide'
  | 'incomplet'
  | 'rejete';

export interface AnnualReRegistration {
  id: string;
  studentId: string;
  studentName: string;
  cin: string;
  cne: string;
  thesisYear: number; // 2, 3, 4, 5, 6
  academicYear: string;
  supervisorId: string;
  supervisorName: string;
  laboratoryId: string;
  thesisTitle: string;
  status: ReRegistrationStatus;
  priority: 'normale' | 'urgente' | 'critique'; // based on deadlines
  submittedAt: string;
  deadlineDate: string;
  progressSummary: string;
  articlesPublishedCount: number;
  conferencesCount: number;
  trainingHoursCompleted: number;
  supervisorApproval: 'en_attente' | 'favorable' | 'defavorable';
  supervisorComment?: string;
  documents: {
    id: string;
    label: string;
    fileName: string;
    fileUrl?: string;
    status: 'conforme' | 'non_conforme' | 'en_attente';
  }[];
  administrativeCheckComment?: string;
}

export interface InAppNotification {
  id: string;
  userId?: string; // specific user or broadcast
  targetRole?: UserRole;
  title: string;
  message: string;
  category: 'candidature' | 'sujet' | 'entretien' | 'resultat' | 'inscription' | 'reinscription' | 'systeme';
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PlatformMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  recipientName: string;
  subject: string;
  content: string;
  relatedEntityId?: string; // e.g. application reference
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: 'candidature' | 'sujet' | 'utilisateur' | 'entretien' | 'pv' | 'inscription' | 'reinscription' | 'systeme';
  entityId: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface FAQItem {
  id: string;
  category: 'candidature' | 'sujets' | 'selection' | 'inscription' | 'reinscription' | 'technique';
  question: string;
  answer: string;
  officialRef?: string;
  keywords: string[];
}

export interface DoctoralRule {
  id: string;
  code: string;
  title: string;
  category: 'admission' | 'delais' | 'pieces_justificatives' | 'seuils_selection' | 'derogation' | 'reinscription';
  description: string;
  conditionDescription: string;
  minimumScoreThreshold?: number; // e.g. 12/20
  deadlineDate?: string;
  mandatoryDocuments?: DocumentType[];
  isActive: boolean;
  applicableEstablishments?: string[]; // empty means all
  createdBy: string;
  updatedAt: string;
}

export interface DoctoralCampaign {
  id: string;
  code: string;
  title: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: 'ouverte' | 'cloturee' | 'en_preparation' | 'suspendue';
  totalQuota: number;
  openEstablishments: string[];
  currentApplicationsCount: number;
  admittedCount: number;
  description: string;
  createdAt: string;
}

export interface CINVerificationData {
  cin: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  cardValidUntil?: string;
  rawConfidence?: number;
  rawText?: string;
}

export interface StudentCardVerificationData {
  cne: string;
  massarCode?: string;
  studentFullName: string;
  lastName?: string;
  firstName?: string;
  originEstablishment: string;
  masterSpecialty: string;
  academicYear: string;
  degreeType?: string;
  rawConfidence?: number;
  rawText?: string;
}

export interface DocumentReconciliation {
  status: 'match' | 'partial' | 'mismatch' | 'pending';
  score: number; // 0 to 100
  title: string;
  message: string;
  details: {
    cinFullName: string;
    studentCardFullName: string;
    isLastNameMatched: boolean;
    isFirstNameMatched: boolean;
    isEstablishmentRecognized: boolean;
    establishmentBadge?: string;
  };
}

export interface GoogleAuthPayload {
  googleId: string;
  email: string;
  displayName: string;
  givenName: string;
  familyName: string;
  photoUrl?: string;
  idToken?: string;
}

export interface ApogeeLookupResult {
  configured: boolean;
  connectionStatus: 'not_configured' | 'connected' | 'error';
  isDemoData: boolean;
  message: string;
  studentOriginType: StudentOriginType;
  studentRecord?: {
    cne: string;
    cin?: string;
    fullName: string;
    establishmentId: string;
    establishmentName: string;
    masterSpecialty: string;
    graduationYear: number;
    mention?: 'Très Bien' | 'Bien' | 'Assez Bien' | 'Passable';
    availableAdministrativeDocuments: {
      type: DocumentType;
      label: string;
      fileName: string;
      fileUrl?: string;
      status: 'valide' | 'en_attente';
      provenance: DocumentProvenance;
      isDemoApogee: boolean;
    }[];
  };
}

export interface DoctoralTraining {
  id: string;
  code: string;
  title: string;
  category: 'scientifique' | 'transversale' | 'methodologique' | 'langues';
  laboratoryId: string;
  establishmentId: string;
  trainerName: string;
  credits: number;
  hours: number;
  description: string;
  academicYear: string;
  status: 'ouverte' | 'planifiee' | 'cloturee';
}

export interface TrainingSession {
  id: string;
  trainingId: string;
  trainingTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  mode: 'presentiel' | 'distanciel' | 'hybride';
  capacity: number;
  enrolledCount: number;
  status: 'planifiee' | 'en_cours' | 'terminee';
}

export interface TrainingActivity {
  id: string;
  studentId: string;
  studentName: string;
  cne: string;
  trainingId?: string;
  trainingTitle: string;
  type: 'seminaire' | 'atelier' | 'colloque' | 'publication' | 'module_transversal';
  title: string;
  date: string;
  hours: number;
  creditsEarned: number;
  status: 'validee' | 'en_attente' | 'refusee';
  validatedBy?: string;
}

export interface DoctoralCreditRecord {
  id: string;
  studentId: string;
  studentName: string;
  cne: string;
  laboratoryId: string;
  supervisorName: string;
  thesisYear: number;
  requiredHours: number;
  validatedHours: number;
  requiredCredits: number;
  validatedCredits: number;
  status: 'conforme' | 'en_cours' | 'alerte';
}
