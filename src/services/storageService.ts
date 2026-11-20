import {
  User,
  DoctoralSubject,
  CandidateApplication,
  InterviewSlot,
  CandidateEvaluation,
  SelectionReport,
  AdministrativeRegistration,
  AnnualReRegistration,
  InAppNotification,
  PlatformMessage,
  AuditLog,
  FAQItem,
  UserRole,
  ApplicationStatus,
  SubjectStatus,
  DoctoralRule,
  DoctoralCampaign,
  DoctoralTraining,
  TrainingSession,
  TrainingActivity,
  DoctoralCreditRecord
} from '../types';
import {
  DEMO_USERS,
  DOCTORAL_SUBJECTS,
  INITIAL_APPLICATIONS,
  INITIAL_INTERVIEW_SLOTS,
  INITIAL_EVALUATIONS,
  INITIAL_SELECTION_REPORT,
  INITIAL_ADMINISTRATIVE_REGISTRATIONS,
  INITIAL_ANNUAL_RE_REGISTRATIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_MESSAGES,
  INITIAL_AUDIT_LOGS,
  FAQ_DATA,
  INITIAL_DOCTORAL_RULES,
  INITIAL_DOCTORAL_CAMPAIGNS,
  INITIAL_DOCTORAL_TRAININGS,
  INITIAL_TRAINING_SESSIONS,
  INITIAL_TRAINING_ACTIVITIES,
  INITIAL_CREDIT_RECORDS
} from '../data/seedData';

import {
  isCommonDocumentType,
  isDocumentProvided,
  summarizeApplicationDocuments
} from '../utils/documentRequirements';

const STORAGE_KEYS = {
  USERS: 'gcd_usmba_users_v5',
  SUBJECTS: 'gcd_usmba_subjects_v5',
  APPLICATIONS: 'gcd_usmba_applications_v5',
  INTERVIEWS: 'gcd_usmba_interviews_v5',
  EVALUATIONS: 'gcd_usmba_evaluations_v5',
  SELECTION_REPORT: 'gcd_usmba_selection_report_v5',
  ADMIN_REGISTRATIONS: 'gcd_usmba_admin_registrations_v5',
  ANNUAL_RE_REGISTRATIONS: 'gcd_usmba_annual_re_registrations_v5',
  NOTIFICATIONS: 'gcd_usmba_notifications_v5',
  MESSAGES: 'gcd_usmba_messages_v5',
  AUDIT_LOGS: 'gcd_usmba_audit_logs_v5',
  FAQ: 'gcd_usmba_faq_v5',
  RULES: 'gcd_usmba_rules_v5',
  CAMPAIGNS: 'gcd_usmba_campaigns_v5',
  DOCTORAL_TRAININGS: 'gcd_usmba_doctoral_trainings_v5',
  TRAINING_SESSIONS: 'gcd_usmba_training_sessions_v5',
  TRAINING_ACTIVITIES: 'gcd_usmba_training_activities_v5',
  CREDIT_RECORDS: 'gcd_usmba_credit_records_v5',
  SETTINGS: 'gcd_usmba_settings_v5'
};

export interface PlatformSettings {
  academicYear: string;
  resultsPublished: boolean;
  applicationDeadline: string;
  reRegistrationDeadline: string;
  autoValidateEmail: boolean;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  academicYear: '2026-2027',
  resultsPublished: true,
  applicationDeadline: '2026-11-20',
  reRegistrationDeadline: '2026-11-30',
  autoValidateEmail: true
};

class StorageService {
  constructor() {
    this.initStorage();
  }

  private initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.resetToDefaults();
      return;
    }

    // Auto-migration: ensure catalogue subjects are loaded if existing count < 50
    try {
      const storedSubjects = this.getSubjects();
      if (storedSubjects.length < 50) {
        // Merge stored subjects with all DOCTORAL_SUBJECTS to retain user subjects while adding 100 catalog items
        const existingIds = new Set(storedSubjects.map((s) => s.id));
        const merged = [...storedSubjects];
        for (const defaultSub of DOCTORAL_SUBJECTS) {
          if (!existingIds.has(defaultSub.id)) {
            merged.push(defaultSub);
          }
        }
        this.setItem(STORAGE_KEYS.SUBJECTS, merged);
      }

      // Ensure demo professors are available in users
      const storedUsers = this.getUsers();
      const existingUserIds = new Set(storedUsers.map((u) => u.id));
      let usersUpdated = false;
      for (const demoUser of DEMO_USERS) {
        if (!existingUserIds.has(demoUser.id)) {
          storedUsers.push(demoUser);
          usersUpdated = true;
        }
      }
      if (usersUpdated) {
        this.setItem(STORAGE_KEYS.USERS, storedUsers);
      }
    } catch (e) {
      console.warn('Auto-migration error:', e);
    }
  }

  public resetToDefaults() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEMO_USERS));
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(DOCTORAL_SUBJECTS));
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(INITIAL_APPLICATIONS));
    localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(INITIAL_INTERVIEW_SLOTS));
    localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(INITIAL_EVALUATIONS));
    localStorage.setItem(STORAGE_KEYS.SELECTION_REPORT, JSON.stringify(INITIAL_SELECTION_REPORT));
    localStorage.setItem(STORAGE_KEYS.ADMIN_REGISTRATIONS, JSON.stringify(INITIAL_ADMINISTRATIVE_REGISTRATIONS));
    localStorage.setItem(STORAGE_KEYS.ANNUAL_RE_REGISTRATIONS, JSON.stringify(INITIAL_ANNUAL_RE_REGISTRATIONS));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(INITIAL_NOTIFICATIONS));
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(INITIAL_MESSAGES));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(INITIAL_AUDIT_LOGS));
    localStorage.setItem(STORAGE_KEYS.FAQ, JSON.stringify(FAQ_DATA));
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(INITIAL_DOCTORAL_RULES));
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(INITIAL_DOCTORAL_CAMPAIGNS));
    localStorage.setItem(STORAGE_KEYS.DOCTORAL_TRAININGS, JSON.stringify(INITIAL_DOCTORAL_TRAININGS));
    localStorage.setItem(STORAGE_KEYS.TRAINING_SESSIONS, JSON.stringify(INITIAL_TRAINING_SESSIONS));
    localStorage.setItem(STORAGE_KEYS.TRAINING_ACTIVITIES, JSON.stringify(INITIAL_TRAINING_ACTIVITIES));
    localStorage.setItem(STORAGE_KEYS.CREDIT_RECORDS, JSON.stringify(INITIAL_CREDIT_RECORDS));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  }

  // Generic getter & setter
  private getItem<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  private setItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage full or error', e);
    }
  }

  // Audit Logs (Activity 34)
  public logAction(
    user: { id: string; name: string; role: UserRole },
    action: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    details: string
  ): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action,
      entityType,
      entityId,
      details,
      ipAddress: '196.200.142.' + Math.floor(Math.random() * 200 + 10),
      timestamp: new Date().toISOString()
    };
    logs.unshift(newLog);
    this.setItem(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 300));
  }

  public getAuditLogs(): AuditLog[] {
    return this.getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  }

  // Users & RBAC (Activity 1, 33)
  public getUsers(): User[] {
    return this.getItem<User[]>(STORAGE_KEYS.USERS, DEMO_USERS);
  }

  public getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    return this.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public saveUser(user: User): void {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    this.setItem(STORAGE_KEYS.USERS, users);
  }

  // Subjects (Activity 4, 5, 6)
  public getSubjects(): DoctoralSubject[] {
    return this.getItem<DoctoralSubject[]>(STORAGE_KEYS.SUBJECTS, DOCTORAL_SUBJECTS);
  }

  public getSubjectById(id: string): DoctoralSubject | undefined {
    return this.getSubjects().find((s) => s.id === id);
  }

  public saveSubject(subject: DoctoralSubject, actor: { id: string; name: string; role: UserRole }): void {
    const subjects = this.getSubjects();
    const index = subjects.findIndex((s) => s.id === subject.id);
    const isNew = index === -1;
    if (isNew) {
      subjects.unshift(subject);
      this.logAction(actor, 'PROPOSITION_SUJET', 'sujet', subject.id, `Nouveau sujet proposé : "${subject.title.substring(0, 50)}..."`);
    } else {
      subjects[index] = subject;
      this.logAction(actor, 'MISE_A_JOUR_SUJET', 'sujet', subject.id, `Mise à jour statut : ${subject.status || subject.statut}`);
    }
    this.setItem(STORAGE_KEYS.SUBJECTS, subjects);
  }

  // Get all registered professors (for dynamic professor filtering and assignment)
  public getProfessors(): User[] {
    const users = this.getUsers();
    return users.filter((u) =>
      u.roles?.some((r) =>
        ['enseignant_chercheur', 'directeur_these', 'responsable_labo', 'jury'].includes(r)
      )
    );
  }

  // Assign professor to a subject (by Admin or Professor self-assigning)
  public assignProfessorToSubject(
    subjectId: string,
    professorId: string,
    actor: { id: string; name: string; role: UserRole }
  ): DoctoralSubject | undefined {
    const subjects = this.getSubjects();
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return undefined;

    const professor = this.getUserById(professorId);
    if (!professor) return undefined;

    const profFullName = `Pr. ${professor.firstName} ${professor.lastName.toUpperCase()}`;
    subject.supervisorId = professor.id;
    subject.supervisorName = profFullName;
    subject.professeur_id = professor.id;
    subject.professeur_nom = profFullName;
    subject.type_sujet = 'officiel';
    subject.statut = 'valide';
    subject.status = 'valide';
    if (!subject.laboratoryId && professor.laboratoryId) {
      subject.laboratoryId = professor.laboratoryId;
      subject.laboratoire = professor.laboratoryId.toUpperCase();
    }
    if (!subject.establishmentId && professor.establishmentId) {
      subject.establishmentId = professor.establishmentId;
      subject.etablissement = professor.establishmentId.toUpperCase();
    }

    this.saveSubject(subject, actor);
    this.logAction(
      actor,
      'ATTRIBUTION_PROFESSEUR',
      'sujet',
      subject.id,
      `Sujet attribué au ${profFullName}`
    );
    return subject;
  }

  // Toggle subject status (publish, withdraw, archive)
  public toggleSubjectStatus(
    subjectId: string,
    newStatus: SubjectStatus,
    actor: { id: string; name: string; role: UserRole }
  ): DoctoralSubject | undefined {
    const subjects = this.getSubjects();
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return undefined;

    subject.status = newStatus;
    subject.statut = newStatus;
    if (newStatus === 'valide' || newStatus === 'publie') {
      subject.validationDate = new Date().toISOString();
    }

    this.saveSubject(subject, actor);
    this.logAction(
      actor,
      'CHANGEMENT_STATUT_SUJET',
      'sujet',
      subject.id,
      `Nouveau statut : ${newStatus}`
    );
    return subject;
  }

  // Applications (Activity 7, 8, 9, 10, 11, 12, 13)
  public getApplications(): CandidateApplication[] {
    return this.getItem<CandidateApplication[]>(STORAGE_KEYS.APPLICATIONS, INITIAL_APPLICATIONS);
  }

  // Strict Candidate Application Isolation — returns ALL applications strictly belonging to the candidate
  public getCandidateApplicationsStrict(
    candidateId?: string,
    email?: string,
    cin?: string
  ): CandidateApplication[] {
    if (!candidateId && !email && !cin) return [];
    const apps = this.getApplications();
    return apps.filter((a) => {
      if (candidateId && a.candidateId === candidateId) return true;
      if (email && a.candidateEmail?.toLowerCase() === email.toLowerCase()) return true;
      if (cin && a.cin?.toUpperCase() === cin.toUpperCase()) return true;
      return false;
    });
  }

  public getCandidateApplicationStrict(
    candidateId?: string,
    email?: string,
    cin?: string
  ): CandidateApplication | undefined {
    return this.getCandidateApplicationsStrict(candidateId, email, cin)[0];
  }

  // Centralized Candidate Document Vault (reusable personal & academic common documents across applications)
  public getSharedCandidateDocuments(
    candidateId?: string,
    email?: string,
    cin?: string
  ): Partial<Record<string, any>> {
    const collected: Record<string, any> = {};

    const user =
      (candidateId ? this.getUserById(candidateId) : undefined) ||
      (email ? this.getUserByEmail(email) : undefined);

    if (user?.identityDocuments?.cinImage) {
      collected['cin'] = {
        id: `shared-cin-${user.id}`,
        type: 'cin',
        label: "Carte d'Identité Nationale (CIN)",
        fileName: `CIN_${user.cin || 'Document'}.jpg`,
        fileSize: Math.round(user.identityDocuments.cinImage.length * 0.75),
        fileUrl: user.identityDocuments.cinImage,
        isRequired: true,
        status: 'en_attente',
        provenance: 'fourni_candidat',
        uploadedAt: user.identityDocuments.scannedAt || user.createdAt,
      };
    }

    // Priority 1: Vault documents explicitly stored in user.sharedDocuments (never pull rejected/missing)
    if (user?.sharedDocuments) {
      for (const doc of user.sharedDocuments) {
        if (isCommonDocumentType(doc.type) && isDocumentProvided(doc)) {
          collected[doc.type] = doc;
        }
      }
    }

    // Priority 2: Valid/pending common documents from strictly isolated candidate's own applications
    const apps = this.getCandidateApplicationsStrict(candidateId || user?.id, email || user?.email, cin || user?.cin);
    for (const app of apps) {
      for (const doc of app.documents || []) {
        if (isCommonDocumentType(doc.type) && isDocumentProvided(doc)) {
          const existing = collected[doc.type];
          if (!existing || (existing.status !== 'valide' && doc.status === 'valide')) {
            collected[doc.type] = doc;
          }
        }
      }
    }

    return collected;
  }

  // Saves/updates a common document into the candidate's personal vault and optionally syncs open/incomplete applications
  public saveCandidateSharedDocument(
    candidateId: string,
    doc: any,
    options?: {
      syncPendingApps?: boolean;
      actor?: { id: string; name: string; role: UserRole };
    }
  ): CandidateApplication[] {
    if (!isCommonDocumentType(doc.type)) return [];

    const user = this.getUserById(candidateId);
    if (user) {
      const existingShared = Array.isArray(user.sharedDocuments) ? [...user.sharedDocuments] : [];
      const idx = existingShared.findIndex((d) => d.type === doc.type);
      const normalizedDoc = {
        ...doc,
        id: doc.id || `vault-${candidateId}-${doc.type}`,
        isRequired: true,
        uploadedAt: doc.uploadedAt || new Date().toISOString(),
      };
      if (idx >= 0) {
        existingShared[idx] = normalizedDoc;
      } else {
        existingShared.push(normalizedDoc);
      }
      this.saveUser({ ...user, sharedDocuments: existingShared });
    }

    if (options?.syncPendingApps === false) {
      return [];
    }

    const updatedApps: CandidateApplication[] = [];
    const candidateApps = this.getCandidateApplicationsStrict(candidateId, user?.email, user?.cin);
    const allApps = this.getApplications();

    for (const app of candidateApps) {
      const canSyncApp = ['brouillon', 'incomplete', 'correction_demandee', 'soumise', 'corrigee'].includes(app.status);
      if (!canSyncApp) continue;

      const targetIdx = app.documents.findIndex((d) => d.type === doc.type);
      const targetDoc = targetIdx >= 0 ? app.documents[targetIdx] : null;
      const shouldReplaceDoc =
        !targetDoc ||
        targetDoc.status === 'manquant' ||
        targetDoc.status === 'rejete' ||
        targetDoc.status === 'complement_requis' ||
        !targetDoc.fileName ||
        doc.status === 'en_attente';

      if (!shouldReplaceDoc) continue;

      const updatedDocs =
        targetIdx >= 0
          ? app.documents.map((d, i) =>
              i === targetIdx
                ? {
                    ...d,
                    fileName: doc.fileName,
                    fileSize: doc.fileSize,
                    fileUrl: doc.fileUrl,
                    status: doc.status === 'valide' ? 'valide' : 'en_attente',
                    provenance: doc.provenance || d.provenance || 'fourni_candidat',
                    rejectionReason: undefined,
                    uploadedAt: doc.uploadedAt || new Date().toISOString(),
                  }
                : d
            )
          : [
              ...app.documents,
              {
                ...doc,
                id: `doc-${app.id}-${doc.type}-${Date.now()}`,
                rejectionReason: undefined,
              },
            ];

      const summary = summarizeApplicationDocuments(updatedDocs as any);
      let nextStatus = app.status;
      let nextHistory = [...(app.statusHistory || [])];
      let nextCorrections = [...(app.correctionRequests || [])];

      if (summary.isComplete && (app.status === 'incomplete' || app.status === 'correction_demandee')) {
        nextStatus = app.status === 'correction_demandee' ? 'corrigee' : 'soumise';
        nextCorrections = nextCorrections.map((cr) =>
          !cr.isResolved ? { ...cr, isResolved: true, resolvedAt: new Date().toISOString() } : cr
        );
        nextHistory.push({
          id: `sh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          status: nextStatus,
          comment: `Dossier complété via le coffre personnel (${doc.label}).`,
          changedBy: options?.actor?.name || app.candidateName,
          timestamp: new Date().toISOString(),
        });
      }

      const updatedApp: CandidateApplication = {
        ...app,
        status: nextStatus,
        documents: updatedDocs as any,
        correctionRequests: nextCorrections,
        statusHistory: nextHistory,
        updatedAt: new Date().toISOString(),
      };

      const globalIdx = allApps.findIndex((a) => a.id === app.id);
      if (globalIdx >= 0) {
        allApps[globalIdx] = updatedApp;
        updatedApps.push(updatedApp);
      }
    }

    if (updatedApps.length > 0) {
      this.setItem(STORAGE_KEYS.APPLICATIONS, allApps);
      if (options?.actor) {
        this.logAction(
          options.actor,
          'SYNCHRONISATION_COFFRE_PIECES',
          'candidature',
          updatedApps.map((a) => a.referenceNumber).join(', '),
          `Pièce commune "${doc.label}" mise à jour et synchronisée sur ${updatedApps.length} candidature(s).`
        );
      }
    }

    return updatedApps;
  }

  public syncApplicationCommonDocsToVault(application: CandidateApplication): void {
    const user = this.getUserById(application.candidateId);
    if (!user) return;

    const vaultDocs = Array.isArray(user.sharedDocuments) ? [...user.sharedDocuments] : [];
    let changed = false;

    for (const doc of application.documents || []) {
      if (!isCommonDocumentType(doc.type) || !isDocumentProvided(doc)) continue;
      const idx = vaultDocs.findIndex((vd) => vd.type === doc.type);
      if (idx === -1) {
        vaultDocs.push({ ...doc, id: doc.id || `vault-${user.id}-${doc.type}` });
        changed = true;
      } else if (!isDocumentProvided(vaultDocs[idx]) || (doc.uploadedAt && (!vaultDocs[idx].uploadedAt || doc.uploadedAt > vaultDocs[idx].uploadedAt!))) {
        vaultDocs[idx] = { ...doc, id: vaultDocs[idx].id || doc.id };
        changed = true;
      }
    }

    if (changed) {
      this.saveUser({ ...user, sharedDocuments: vaultDocs });
    }
  }

  public getApplicationById(id: string): CandidateApplication | undefined {
    return this.getApplications().find((a) => a.id === id);
  }

  public getApplicationByReference(ref: string): CandidateApplication | undefined {
    return this.getApplications().find((a) => a.referenceNumber === ref);
  }

  public saveApplication(application: CandidateApplication, actor: { id: string; name: string; role: UserRole }): void {
    const applications = this.getApplications();
    const index = applications.findIndex((a) => a.id === application.id);
    if (index >= 0) {
      applications[index] = application;
      this.logAction(actor, 'MISE_A_JOUR_CANDIDATURE', 'candidature', application.referenceNumber, `Statut : ${application.status}`);
    } else {
      applications.unshift(application);
      this.logAction(actor, 'NOUVELLE_CANDIDATURE', 'candidature', application.referenceNumber, `Dossier créé et soumis.`);
    }
    this.setItem(STORAGE_KEYS.APPLICATIONS, applications);
    this.syncApplicationCommonDocsToVault(application);
  }

  // Interview Slots (Activity 15, 16)
  public getInterviews(): InterviewSlot[] {
    return this.getItem<InterviewSlot[]>(STORAGE_KEYS.INTERVIEWS, INITIAL_INTERVIEW_SLOTS);
  }

  public saveInterviewSlot(slot: InterviewSlot, actor: { id: string; name: string; role: UserRole }): void {
    const slots = this.getInterviews();
    const idx = slots.findIndex((s) => s.id === slot.id);
    if (idx >= 0) {
      slots[idx] = slot;
    } else {
      slots.push(slot);
    }
    this.setItem(STORAGE_KEYS.INTERVIEWS, slots);
    this.logAction(actor, 'GESTION_CRENEAU_ENTRETIEN', 'entretien', slot.id, `Créneau ${slot.date} ${slot.startTime} mis à jour.`);
  }

  // Evaluations (Activity 17, 18)
  public getEvaluations(): CandidateEvaluation[] {
    return this.getItem<CandidateEvaluation[]>(STORAGE_KEYS.EVALUATIONS, INITIAL_EVALUATIONS);
  }

  public saveEvaluation(evaluation: CandidateEvaluation, actor: { id: string; name: string; role: UserRole }): void {
    const evals = this.getEvaluations();
    const idx = evals.findIndex((e) => e.id === evaluation.id);
    if (idx >= 0) {
      evals[idx] = evaluation;
    } else {
      evals.push(evaluation);
    }
    this.setItem(STORAGE_KEYS.EVALUATIONS, evals);
    this.logAction(actor, 'SAISIE_EVALUATION', 'candidature', evaluation.applicationId, `Note attribuée : ${evaluation.totalScore}/20.`);
  }

  // Selection Report / Procès-Verbal (Activity 19, 20, 21)
  public getSelectionReport(): SelectionReport {
    return this.getItem<SelectionReport>(STORAGE_KEYS.SELECTION_REPORT, INITIAL_SELECTION_REPORT);
  }

  public saveSelectionReport(report: SelectionReport, actor: { id: string; name: string; role: UserRole }): void {
    this.setItem(STORAGE_KEYS.SELECTION_REPORT, report);
    this.logAction(actor, 'VALIDATION_PV', 'pv', report.id, `Statut PV : ${report.status}, Version : ${report.currentVersion}`);
  }

  // Administrative Registrations (Activity 23, 24, 25, 26)
  public getAdministrativeRegistrations(): AdministrativeRegistration[] {
    return this.getItem<AdministrativeRegistration[]>(STORAGE_KEYS.ADMIN_REGISTRATIONS, INITIAL_ADMINISTRATIVE_REGISTRATIONS);
  }

  public saveAdministrativeRegistration(reg: AdministrativeRegistration, actor: { id: string; name: string; role: UserRole }): void {
    const regs = this.getAdministrativeRegistrations();
    const idx = regs.findIndex((r) => r.id === reg.id);
    if (idx >= 0) {
      regs[idx] = reg;
    } else {
      regs.unshift(reg);
    }
    this.setItem(STORAGE_KEYS.ADMIN_REGISTRATIONS, regs);
    this.logAction(actor, 'INSCRIPTION_ADMINISTRATIVE', 'inscription', reg.id, `Statut inscription : ${reg.status}`);
  }

  // Annual Re-Registrations (Activity 27, 28, 29, 30)
  public getAnnualReRegistrations(): AnnualReRegistration[] {
    return this.getItem<AnnualReRegistration[]>(STORAGE_KEYS.ANNUAL_RE_REGISTRATIONS, INITIAL_ANNUAL_RE_REGISTRATIONS);
  }

  public saveAnnualReRegistration(reReg: AnnualReRegistration, actor: { id: string; name: string; role: UserRole }): void {
    const list = this.getAnnualReRegistrations();
    const idx = list.findIndex((r) => r.id === reReg.id);
    if (idx >= 0) {
      list[idx] = reReg;
    } else {
      list.unshift(reReg);
    }
    this.setItem(STORAGE_KEYS.ANNUAL_RE_REGISTRATIONS, list);
    this.logAction(actor, 'REINSCRIPTION_ANNUELLE', 'reinscription', reReg.id, `Statut : ${reReg.status}`);
  }

  // Notifications (Activity 8, 11, 16, 22, 31)
  public getNotifications(): InAppNotification[] {
    return this.getItem<InAppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
  }

  public addNotification(notification: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'>): void {
    const list = this.getNotifications();
    const newNotif: InAppNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    list.unshift(newNotif);
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  public markNotificationAsRead(id: string): void {
    const list = this.getNotifications();
    const notif = list.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
      this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
    }
  }

  public markAllNotificationsAsRead(userOrRole?: { userId?: string; role?: UserRole }): void {
    const list = this.getNotifications();
    list.forEach((n) => {
      if (!userOrRole || n.userId === userOrRole.userId || n.targetRole === userOrRole.role) {
        n.isRead = true;
      }
    });
    this.setItem(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  // Messages (Activity 31)
  public getMessages(): PlatformMessage[] {
    return this.getItem<PlatformMessage[]>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
  }

  public sendMessage(msg: Omit<PlatformMessage, 'id' | 'createdAt' | 'isRead'>): void {
    const messages = this.getMessages();
    const newMsg: PlatformMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    messages.unshift(newMsg);
    this.setItem(STORAGE_KEYS.MESSAGES, messages);
  }

  // FAQ (Activity 32)
  public getFAQ(): FAQItem[] {
    return this.getItem<FAQItem[]>(STORAGE_KEYS.FAQ, FAQ_DATA);
  }

  public saveFAQItem(item: FAQItem): void {
    const faqs = this.getFAQ();
    const idx = faqs.findIndex((f) => f.id === item.id);
    if (idx >= 0) {
      faqs[idx] = item;
    } else {
      faqs.push(item);
    }
    this.setItem(STORAGE_KEYS.FAQ, faqs);
  }

  // Doctoral Operational Rules Management
  public getRules(): DoctoralRule[] {
    return this.getItem<DoctoralRule[]>(STORAGE_KEYS.RULES, INITIAL_DOCTORAL_RULES);
  }

  public saveRule(rule: DoctoralRule, actor?: { id: string; name: string; role: UserRole }): void {
    const rules = this.getRules();
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      rules[idx] = { ...rule, updatedAt: new Date().toISOString() };
    } else {
      rules.push({ ...rule, updatedAt: new Date().toISOString() });
    }
    this.setItem(STORAGE_KEYS.RULES, rules);
    if (actor) {
      this.logAction(actor, 'GESTION_REGLE_DOCTORALE', 'systeme', rule.id, `Règle ${rule.code} : ${rule.title} enregistrée.`);
    }
  }

  public deleteRule(id: string, actor?: { id: string; name: string; role: UserRole }): void {
    const rules = this.getRules().filter((r) => r.id !== id);
    this.setItem(STORAGE_KEYS.RULES, rules);
    if (actor) {
      this.logAction(actor, 'SUPPRESSION_REGLE', 'systeme', id, `Suppression de la règle ${id}`);
    }
  }

  public toggleRuleStatus(id: string, actor?: { id: string; name: string; role: UserRole }): void {
    const rules = this.getRules();
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      rule.isActive = !rule.isActive;
      rule.updatedAt = new Date().toISOString();
      this.setItem(STORAGE_KEYS.RULES, rules);
      if (actor) {
        this.logAction(actor, 'MODIFICATION_REGLE', 'systeme', id, `Règle ${rule.code} désormais ${rule.isActive ? 'ACTIVE' : 'INACTIVE'}`);
      }
    }
  }

  // Doctoral Campaigns Management
  public getCampaigns(): DoctoralCampaign[] {
    return this.getItem<DoctoralCampaign[]>(STORAGE_KEYS.CAMPAIGNS, INITIAL_DOCTORAL_CAMPAIGNS);
  }

  public getActiveCampaign(): DoctoralCampaign | undefined {
    return this.getCampaigns().find((c) => c.status === 'ouverte');
  }

  public saveCampaign(campaign: DoctoralCampaign, actor?: { id: string; name: string; role: UserRole }): void {
    const campaigns = this.getCampaigns();
    const idx = campaigns.findIndex((c) => c.id === campaign.id);
    if (idx >= 0) {
      campaigns[idx] = campaign;
    } else {
      campaigns.unshift(campaign);
    }
    this.setItem(STORAGE_KEYS.CAMPAIGNS, campaigns);
    if (actor) {
      this.logAction(actor, 'GESTION_CAMPAGNE_DOCTORALE', 'systeme', campaign.id, `Campagne ${campaign.code} mise à jour (Statut: ${campaign.status})`);
    }
  }

  // Doctoral Trainings, Sessions, Activities & Credit Tracking
  public getDoctoralTrainings(): DoctoralTraining[] {
    return this.getItem<DoctoralTraining[]>(STORAGE_KEYS.DOCTORAL_TRAININGS, INITIAL_DOCTORAL_TRAININGS);
  }

  public saveDoctoralTraining(training: DoctoralTraining, actor?: { id: string; name: string; role: UserRole }): void {
    const list = this.getDoctoralTrainings();
    const idx = list.findIndex((t) => t.id === training.id);
    if (idx >= 0) {
      list[idx] = training;
    } else {
      list.unshift(training);
    }
    this.setItem(STORAGE_KEYS.DOCTORAL_TRAININGS, list);
    if (actor) {
      this.logAction(actor, 'GESTION_FORMATION_DOCTORALE', 'systeme', training.id, `Formation ${training.code} enregistrée.`);
    }
  }

  public getTrainingSessions(): TrainingSession[] {
    return this.getItem<TrainingSession[]>(STORAGE_KEYS.TRAINING_SESSIONS, INITIAL_TRAINING_SESSIONS);
  }

  public saveTrainingSession(session: TrainingSession, actor?: { id: string; name: string; role: UserRole }): void {
    const list = this.getTrainingSessions();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.unshift(session);
    }
    this.setItem(STORAGE_KEYS.TRAINING_SESSIONS, list);
    if (actor) {
      this.logAction(actor, 'GESTION_SESSION_FORMATION', 'systeme', session.id, `Session ${session.date} enregistrée.`);
    }
  }

  public getTrainingActivities(): TrainingActivity[] {
    return this.getItem<TrainingActivity[]>(STORAGE_KEYS.TRAINING_ACTIVITIES, INITIAL_TRAINING_ACTIVITIES);
  }

  public validateTrainingActivity(
    activityId: string,
    decision: 'validee' | 'refusee',
    actor: { id: string; name: string; role: UserRole }
  ): void {
    const activities = this.getTrainingActivities();
    const target = activities.find((a) => a.id === activityId);
    if (!target) return;

    const wasValidated = target.status === 'validee';
    target.status = decision;
    target.validatedBy = actor.name;
    this.setItem(STORAGE_KEYS.TRAINING_ACTIVITIES, activities);

    if (decision === 'validee' && !wasValidated) {
      const credits = this.getCreditRecords();
      const rec = credits.find((c) => c.studentId === target.studentId || c.cne === target.cne);
      if (rec) {
        rec.validatedHours += target.hours;
        rec.validatedCredits += target.creditsEarned;
        rec.status =
          rec.validatedHours >= rec.requiredHours && rec.validatedCredits >= rec.requiredCredits
            ? 'conforme'
            : 'en_cours';
        this.setItem(STORAGE_KEYS.CREDIT_RECORDS, credits);
      }
    }

    this.logAction(
      actor,
      'VALIDATION_ACTIVITE_DOCTORALE',
      'systeme',
      activityId,
      `Activité "${target.title}" marquée ${decision} (${target.hours}h / ${target.creditsEarned} crédits).`
    );
  }

  public getCreditRecords(): DoctoralCreditRecord[] {
    return this.getItem<DoctoralCreditRecord[]>(STORAGE_KEYS.CREDIT_RECORDS, INITIAL_CREDIT_RECORDS);
  }

  // Settings (Activity 35, 36)
  public getSettings(): PlatformSettings {
    return this.getItem<PlatformSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  public updateSettings(settings: Partial<PlatformSettings>): void {
    const current = this.getSettings();
    this.setItem(STORAGE_KEYS.SETTINGS, { ...current, ...settings });
  }

  // Platform Metrics & Bottleneck Analysis (Activity 35)
  public getPlatformMetrics() {
    const subjects = this.getSubjects();
    const applications = this.getApplications();
    const interviews = this.getInterviews();
    const registrations = this.getAdministrativeRegistrations();
    const reRegistrations = this.getAnnualReRegistrations();

    // Bottlenecks calculation
    const pendingSubjectsCount = subjects.filter((s) => s.status === 'en_attente_validation').length;
    const incompleteApplicationsCount = applications.filter((a) => a.status === 'incomplete' || a.status === 'correction_demandee').length;
    const pendingAdminVerificationCount = applications.filter((a) => a.status === 'soumise' || a.status === 'en_cours_verification' || a.status === 'corrigee').length;
    const unassignedInterviewsCount = applications.filter((a) => a.status === 'recevable').length;
    const pendingRegistrationsCount = registrations.filter((r) => r.status === 'en_cours_verification' || r.status === 'en_attente').length;
    const pendingReRegistrationsCount = reRegistrations.filter((r) => r.status === 'avis_directeur_donne' || r.status === 'en_cours_verification').length;

    return {
      totalSubjects: subjects.length,
      validatedSubjects: subjects.filter((s) => s.status === 'valide').length,
      pendingSubjects: pendingSubjectsCount,
      totalApplications: applications.length,
      applicationsByStatus: {
        soumise: applications.filter((a) => a.status === 'soumise').length,
        en_verification: applications.filter((a) => a.status === 'en_cours_verification').length,
        correction_demandee: applications.filter((a) => a.status === 'correction_demandee').length,
        recevable: applications.filter((a) => a.status === 'recevable').length,
        entretien: applications.filter((a) => a.status === 'entretien_programme').length,
        admise: applications.filter((a) => a.status === 'admise').length
      },
      interviewsTotal: interviews.length,
      interviewsBooked: interviews.filter((i) => i.isBooked).length,
      registrationsTotal: registrations.length,
      reRegistrationsTotal: reRegistrations.length,
      bottlenecks: [
        {
          id: 'bn-1',
          severity: pendingSubjectsCount > 0 ? 'warning' : 'ok',
          title: 'Sujets doctoraux en attente de visa de laboratoire',
          count: pendingSubjectsCount,
          description: `${pendingSubjectsCount} sujet(s) soumis par des chercheurs attendent la validation formelle des directeurs de labo.`
        },
        {
          id: 'bn-2',
          severity: incompleteApplicationsCount > 0 ? 'alert' : 'ok',
          title: 'Dossiers incomplets nécessitant régularisation',
          count: incompleteApplicationsCount,
          description: `${incompleteApplicationsCount} candidat(s) doivent déposer des pièces conformes avant la date limite.`
        },
        {
          id: 'bn-3',
          severity: pendingAdminVerificationCount > 2 ? 'warning' : 'ok',
          title: 'File d\'instruction administrative',
          count: pendingAdminVerificationCount,
          description: `${pendingAdminVerificationCount} dossier(s) déposé(s) en attente de vérification formelle par la scolarité.`
        },
        {
          id: 'bn-4',
          severity: unassignedInterviewsCount > 0 ? 'info' : 'ok',
          title: 'Candidats recevables sans convocation d\'audition',
          count: unassignedInterviewsCount,
          description: `${unassignedInterviewsCount} dossier(s) recevable(s) prêt(s) pour la programmation des créneaux de jury.`
        }
      ]
    };
  }
}

export const storageService = new StorageService();
