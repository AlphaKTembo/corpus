import axios, { AxiosInstance } from 'axios';

// API base URL - use /api prefix when behind nginx, direct port when dev
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

class ApiClient {
  private client: AxiosInstance;
  private tokenGetter: (() => Promise<string | null>) | null = null;
  private tokenGetterReady: Promise<void>;
  private resolveTokenGetterReady!: () => void;

  constructor() {
    // Resolves when setTokenGetter() is first called (i.e. Clerk is mounted)
    this.tokenGetterReady = new Promise((resolve) => {
      this.resolveTokenGetterReady = resolve;
      // Auto-resolve after 2s so non-Clerk flows don't hang forever
      setTimeout(resolve, 2000);
    });

    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Wait for Clerk to mount, then attach token
    this.client.interceptors.request.use(async (config) => {
      await this.tokenGetterReady;
      const token = this.tokenGetter ? await this.tokenGetter() : null;
      if (token) {
        config.headers = config.headers ?? {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // On 401, let Clerk middleware handle the redirect — don't force it here
    // (avoids reload loops when token is momentarily unavailable during hydration)
    this.client.interceptors.response.use(
      (res) => res,
      async (error) => {
        return Promise.reject(error);
      },
    );
  }

  /** Called by ClerkTokenProvider once Clerk is ready */
  setTokenGetter(getter: () => Promise<string | null>) {
    this.tokenGetter = getter;
    this.resolveTokenGetterReady();
  }

  /** Get the current token (used by pages that construct raw fetch calls) */
  async getToken(): Promise<string | null> {
    return this.tokenGetter ? this.tokenGetter() : null;
  }

  /** @deprecated use Clerk sign-out instead */
  logout() {
    this.tokenGetter = null;
  }

  // Summary endpoints
  async getTodayBrief() {
    return this.client.get('/v1/summary/today');
  }

  async getRollingSummary(days: number = 28) {
    return this.client.get(`/v1/summary/rolling?days=${days}`);
  }

  // Activities endpoints
  async getActivities(params?: {
    from?: string;
    to?: string;
    sport?: string;
    limit?: number;
    cursor?: string;
  }) {
    return this.client.get('/v1/activities', { params });
  }

  async getActivity(id: string) {
    return this.client.get(`/v1/activities/${id}`);
  }

  async getActivityStreams(id: string, fields?: string[], downsample?: string) {
    return this.client.get(`/v1/activities/${id}/streams`, {
      params: {
        fields: fields?.join(','),
        downsample,
      },
    });
  }

  async getActivityZoneSummary() {
    return this.client.get('/v1/activities/zones/summary');
  }

  async getLatestActivityZoneSummary() {
    return this.client.get('/v1/activities/zones/latest');
  }

  // Metrics endpoints
  async getVitals(from?: string, to?: string) {
    return this.client.get('/v1/metrics/vitals', { params: { from, to } });
  }

  async getSleep(from?: string, to?: string) {
    return this.client.get('/v1/metrics/sleep', { params: { from, to } });
  }

  async getBodyMetrics(from?: string, to?: string) {
    return this.client.get('/v1/metrics/body', { params: { from, to } });
  }

  async getFormScores(from?: string, to?: string) {
    return this.client.get('/v1/metrics/form-scores', { params: { from, to } });
  }

  // Ingest endpoints
  async triggerSync() {
    return this.client.post('/v1/ingest/sync');
  }

  async getIngestStatus() {
    return this.client.get('/v1/ingest/status');
  }

  // FitnessSyncer endpoints
  async getFitnessSyncerAuthUrl() {
    return this.client.get('/v1/fitnesssyncer/authorize');
  }

  async getFitnessSyncerStatus() {
    return this.client.get('/v1/fitnesssyncer/status');
  }

  async triggerFitnessSyncerSync() {
    return this.client.post('/v1/fitnesssyncer/sync');
  }


  // Medicals endpoints
  async uploadMedical(formData: FormData) {
    return this.client.post('/v1/medicals/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async getMedicalDocuments(params?: {
    type?: 'bloods' | 'reports' | 'dna' | 'records';
    from?: string;
    to?: string;
  }) {
    return this.client.get('/v1/medicals/documents', { params });
  }

  async syncMedicalDrive(folderId?: string, type?: 'bloods' | 'reports' | 'dna' | 'records') {
    return this.client.post('/v1/medicals/sync/google-drive', { folderId, type });
  }

  async syncMedicalLocal(rootPath?: string, type?: 'bloods' | 'reports' | 'dna' | 'records') {
    return this.client.post('/v1/medicals/sync/local', { rootPath, type });
  }

  async syncMedicalDropbox(folderPath?: string, type?: 'bloods' | 'reports' | 'dna' | 'records') {
    return this.client.post('/v1/medicals/sync/dropbox', { folderPath, type });
  }

  async rebuildMedicalCsvs() {
    return this.client.post('/v1/medicals/rebuild-csvs');
  }

  async extractPendingMedicalCsvs() {
    return this.client.post('/v1/medicals/extract-pending-csvs');
  }

  async getBloodResults(params?: { from?: string; to?: string; category?: string }) {
    return this.client.get('/v1/medicals/blood-results', { params });
  }

  async askMedicals(payload: {
    question: string;
    type?: 'bloods' | 'reports' | 'dna' | 'records';
    from?: string;
    to?: string;
    docIds?: string[];
  }) {
    return this.client.post('/v1/medicals/ask', payload);
  }

  async generateMedicalSummary(date?: string) {
    return this.client.post('/v1/medicals/summary/generate', { date });
  }

  async getMedicalSummaryLatest() {
    return this.client.get('/v1/medicals/summary/latest');
  }

  async getMedicalSummaryPayload(params?: { date?: string; refresh?: boolean }) {
    return this.client.get('/v1/medicals/summary/payload', {
      params: {
        date: params?.date,
        refresh: params?.refresh ? '1' : undefined,
      },
    });
  }

  async getMedicalCoverLetter() {
    return this.client.get('/v1/medicals/cover-letter');
  }

  async updateMedicalCoverLetter(text: string) {
    return this.client.post('/v1/medicals/cover-letter', { text });
  }

  async getLactateThresholds() {
    return this.client.get('/v1/medicals/lactate-threshold');
  }

  async addLactateThreshold(payload: { date?: string; value: string; unit?: string; notes?: string }) {
    return this.client.post('/v1/medicals/lactate-threshold', payload);
  }

  async getFtpRecords() {
    return this.client.get('/v1/medicals/ftp');
  }

  async addFtp(payload: { date?: string; value: string; unit?: string; notes?: string }) {
    return this.client.post('/v1/medicals/ftp', payload);
  }

  // Intervals.icu API methods
  async getIntervalsFitness(params?: { start_date?: string; end_date?: string }) {
    return this.client.get('/v1/intervals-icu/fitness', { params });
  }

  async getIntervalsRecovery(params?: { start_date?: string; end_date?: string }) {
    return this.client.get('/v1/intervals-icu/recovery', { params });
  }

  async getIntervalsZones(params?: { start_date?: string; end_date?: string; sport?: string }) {
    return this.client.get('/v1/intervals-icu/zones/summary', { params });
  }

  async getIntervalsHrZones(params?: { start_date?: string; end_date?: string; sport?: string }) {
    return this.client.get('/v1/intervals-icu/zones/hr', { params });
  }

  async getIntervalsPowerZones(params?: { start_date?: string; end_date?: string; sport?: string }) {
    return this.client.get('/v1/intervals-icu/zones/power', { params });
  }

  // General ask endpoint (medical + fitness)
  async ask(payload: {
    question: string;
    dateRange?: { from?: string; to?: string };
    activityId?: string;
    days?: number;
    activityLimit?: number;
    includeContext?: boolean;
  }) {
    return this.client.post('/v1/ask', payload);
  }

  async transcribeAudio(audioBlob: Blob, filename = 'recording.webm') {
    const form = new FormData();
    form.append('audio', audioBlob, filename);
    return this.client.post<{ transcript: string }>('/v1/ask/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async syncIntervalsIcu(days?: number) {
    return this.client.get('/v1/intervals-icu/sync', { params: { days: days?.toString() } });
  }

  // Medical file manager
  async getMedicalFolders() {
    return this.client.get('/v1/medicals/folders');
  }

  async createMedicalFolder(name: string) {
    return this.client.post('/v1/medicals/folders', { name });
  }

  async renameMedicalFolder(name: string, newName: string) {
    return this.client.patch(`/v1/medicals/folders/${encodeURIComponent(name)}`, { newName });
  }

  async deleteMedicalFolder(name: string) {
    return this.client.delete(`/v1/medicals/folders/${encodeURIComponent(name)}`);
  }

  async getFolderDocuments(folder: string) {
    return this.client.get(`/v1/medicals/folders/${encodeURIComponent(folder)}/documents`);
  }

  async uploadToMedicalFolder(
    folder: string,
    file: File,
    meta?: { type?: string; date?: string; notes?: string },
    onProgress?: (pct: number) => void,
  ) {
    const form = new FormData();
    form.append('file', file);
    if (meta?.type) form.append('type', meta.type);
    if (meta?.date) form.append('date', meta.date);
    if (meta?.notes) form.append('notes', meta.notes);
    return this.client.post(`/v1/medicals/folders/${encodeURIComponent(folder)}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e: any) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    });
  }

  async previewMedicalUploadToFolder(
    folder: string,
    file: File,
    meta?: { type?: string; date?: string },
  ) {
    const form = new FormData();
    form.append('file', file);
    if (meta?.type) form.append('type', meta.type);
    if (meta?.date) form.append('date', meta.date);
    return this.client.post<{
      type: string;
      date: string;
      sourceDocId: string;
      extractedRows: number;
      sampleRows: Array<Record<string, string | number>>;
      warning?: string;
    }>(`/v1/medicals/folders/${encodeURIComponent(folder)}/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async deleteMedicalDocument(id: string) {
    return this.client.delete(`/v1/medicals/documents/${id}`);
  }

  getMedicalDocumentDownloadUrl(id: string): string {
    return `${API_BASE_URL}/v1/medicals/documents/${id}/download`;
  }

  // User credentials / connections
  async getMyCredentials() {
    return this.client.get('/v1/users/me/credentials');
  }

  async generateApiKey() {
    return this.client.post<{ apiKey: string }>('/v1/users/me/api-key/generate');
  }

  async saveIntervalsCredentials(apiKey: string, athleteId?: string) {
    return this.client.put('/v1/users/me/credentials/intervals', { apiKey, athleteId });
  }

  async disconnectIntervals(clearData = false) {
    return this.client.put(`/v1/users/me/credentials/intervals/disconnect?clearData=${clearData}`);
  }

  async askCorpus(question: string, options?: { days?: number }) {
    return this.client.post('/v1/ask', { question, days: options?.days ?? 60 });
  }

  async askWithFile(question: string, file: File, mode?: 'fuel-plan-image') {
    const form = new FormData();
    form.append('question', question);
    if (mode) form.append('mode', mode);
    form.append('file', file);
    return this.client.post<{ question: string; answer: string; filename: string; imageBase64?: string; imageMimeType?: string }>(
      '/v1/ask/with-file',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  }
}

export const apiClient = new ApiClient();

