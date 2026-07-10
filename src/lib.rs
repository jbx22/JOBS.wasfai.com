use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{Html, Json, Redirect, Response},
    routing::{get, patch, post, put},
    Router,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path as FsPath,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tower_http::services::{ServeDir, ServeFile};
use typst::foundations::{Dict, IntoValue};
use typst_as_lib::TypstEngine;

mod connectors;
use connectors::{connector_profile, fetch_and_parse, ConnectorMode};

type StoreResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Discovered,
    Processing,
    Ready,
    Applied,
    InProgress,
    Expired,
    Skipped,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Job {
    pub id: String,
    pub title: String,
    pub employer: String,
    pub source: String,
    pub location: String,
    pub score: u8,
    pub status: JobStatus,
    pub deadline: String,
    pub description: String,
    pub tailored_resume: String,
    pub cover_letter: String,
    pub fit_explanation: String,
    pub timeline: Vec<TimelineEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RecruiterMessage {
    pub id: String,
    pub provider: String,
    pub subject: String,
    pub sender: String,
    pub matched_job_id: Option<String>,
    pub message_type: String,
    pub timeline_action: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TimelineEvent {
    pub label: String,
    pub timestamp: String,
    pub tone: String,
    #[serde(default = "default_timeline_category")]
    pub category: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ActivityFeedItem {
    pub job_id: String,
    pub job_title: String,
    pub employer: String,
    pub label: String,
    pub timestamp: String,
    pub tone: String,
    pub category: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ApplicationChecklistItem {
    pub key: String,
    pub label: String,
    pub completed: bool,
    pub detail: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct JobApplicationChecklist {
    pub job_id: String,
    pub completed_count: usize,
    pub total_count: usize,
    pub items: Vec<ApplicationChecklistItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ApplicationPackage {
    pub job_id: String,
    pub resume_title: String,
    pub resume_body: String,
    pub cover_letter_title: String,
    pub cover_letter_body: String,
    pub pdf_status: String,
    pub generated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ApplicationPackageVersion {
    pub job_id: String,
    pub version: u32,
    pub resume_title: String,
    pub resume_body: String,
    pub cover_letter_title: String,
    pub cover_letter_body: String,
    pub pdf_status: String,
    pub generated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AssistantDraft {
    pub job_id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AssistantDraftVersion {
    pub job_id: String,
    pub version: u32,
    pub content: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SourceSummary {
    pub id: String,
    pub label: String,
    pub region: String,
    pub enabled: bool,
    pub import_url_template: String,
    pub import_hint: String,
    pub url: String,
    pub custom: bool,
    pub last_scanned_at: String,
    pub job_count: usize,
    pub connector: String,
    pub connector_mode: String,
    pub connector_note: String,
    pub last_error: String,
    pub scheduled: bool,
    pub interval_minutes: u32,
    pub next_scan_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub display_name: String,
    pub preferred_language: String,
    pub target_roles: String,
    pub target_locations: String,
    pub resume_filename: String,
    pub resume_skills: String,
    pub resume_languages: String,
    pub resume_seniority: String,
    pub resume_regions: String,
    pub resume_work_examples: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Bootstrap {
    pub profile: UserProfile,
    pub jobs: Vec<Job>,
    pub messages: Vec<RecruiterMessage>,
    pub packages: Vec<ApplicationPackage>,
    pub package_history: Vec<ApplicationPackageVersion>,
    pub sources: Vec<SourceSummary>,
    pub drafts: Vec<AssistantDraft>,
    pub draft_history: Vec<AssistantDraftVersion>,
    pub activity_feed: Vec<ActivityFeedItem>,
    pub application_checklists: Vec<JobApplicationChecklist>,
}

#[derive(Clone)]
pub struct AppState {
    store: PersistentStore,
}

#[derive(Clone)]
pub struct PersistentStore {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateJobStatusRequest {
    pub status: JobStatus,
}

#[derive(Debug, Deserialize)]
pub struct BulkJobStatusRequest {
    pub ids: Vec<String>,
    pub status: JobStatus,
}

#[derive(Debug, Deserialize)]
pub struct UpdateJobDetailsRequest {
    pub title: String,
    pub employer: String,
    pub location: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveProfileRequest {
    pub display_name: String,
    pub preferred_language: String,
    pub target_roles: String,
    pub target_locations: String,
    pub resume_filename: String,
    #[serde(default)]
    pub resume_skills: String,
    #[serde(default)]
    pub resume_languages: String,
    #[serde(default)]
    pub resume_seniority: String,
    #[serde(default)]
    pub resume_regions: String,
    #[serde(default)]
    pub resume_work_examples: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ResumeTextParseRequest {
    pub filename: String,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ResumeTextParsePreview {
    pub display_name: String,
    pub preferred_language: String,
    pub target_roles: String,
    pub target_locations: String,
    pub resume_filename: String,
    pub resume_skills: String,
    pub resume_languages: String,
    pub resume_seniority: String,
    pub resume_regions: String,
    pub resume_work_examples: String,
    pub extraction_summary: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveDraftRequest {
    pub job_id: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct SavePackageRequest {
    pub resume_title: String,
    pub resume_body: String,
    pub cover_letter_title: String,
    pub cover_letter_body: String,
    pub pdf_status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ManualJobImportInput {
    pub url: String,
    pub title: String,
    pub employer: String,
    pub location: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct AddSourceRequest {
    pub label: String,
    pub url: String,
    pub region: String,
}

#[derive(Debug, Deserialize)]
pub struct ScanSourceRequest {
    pub query: String,
    pub location: String,
    pub max_results: usize,
}

#[derive(Debug, Deserialize)]
pub struct ScheduleSourceRequest {
    pub enabled: bool,
    pub interval_minutes: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanSourceResult {
    pub source: SourceSummary,
    pub jobs: Vec<Job>,
    pub scanned_at: String,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ManualJobImportPreview {
    pub url: String,
    pub title: String,
    pub employer: String,
    pub source: String,
    pub location: String,
    pub description: String,
    pub fit_explanation: String,
    pub extraction_quality: String,
    pub extraction_summary: String,
    pub field_sources: ImportFieldSources,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportFieldSources {
    pub title: String,
    pub employer: String,
    pub location: String,
    pub description: String,
}

pub fn seed_jobs() -> Vec<Job> {
    vec![
        Job {
            id: "job-1".into(),
            title: "مصمم تجربة مستخدم أول".into(),
            employer: "Noon".into(),
            source: "linkedin".into(),
            location: "دبي، الإمارات".into(),
            score: 91,
            status: JobStatus::Ready,
            deadline: "2026-07-24".into(),
            description:
                "قيادة تصميم تجربة شراء عربية، بناء نماذج أولية، وتحسين رحلة المستخدم عبر الهاتف."
                    .into(),
            tailored_resume:
                "سيرة مركزة على تصميم المنتجات، الاختبارات السريعة، وقيادة فرق متعددة التخصصات."
                    .into(),
            cover_letter:
                "خطاب يربط خبرتك في التجارة الإلكترونية بتحسين تجربة المستخدم العربية في Noon."
                    .into(),
            fit_explanation: "Matched profile signals from the seeded demo workflow.".into(),
            timeline: vec![
                event("تم اكتشاف الوظيفة", "09 يوليو", "neutral"),
                event("تم إنشاء السيرة المخصصة", "09 يوليو", "ready"),
            ],
        },
        Job {
            id: "job-2".into(),
            title: "مهندس برمجيات Rust".into(),
            employer: "Careem".into(),
            source: "wazzuf".into(),
            location: "الرياض، السعودية".into(),
            score: 87,
            status: JobStatus::Applied,
            deadline: "2026-07-18".into(),
            description:
                "بناء خدمات خلفية عالية الاعتمادية باستخدام Rust وواجهات API لمنصة تنقل إقليمية."
                    .into(),
            tailored_resume: "سيرة تبرز Rust، تصميم الأنظمة، وقابلية التوسع في منتجات المستهلك."
                .into(),
            cover_letter: "خطاب متابعة مهني يوضح الحماس للعمل على بنية تحتية تخدم مستخدمي المنطقة."
                .into(),
            fit_explanation: "Matched Rust, regional backend work, and WUZZUF source.".into(),
            timeline: vec![
                event("تم التقديم", "08 يوليو", "ready"),
                event("وصلت رسالة مقابلة من Gmail", "09 يوليو", "gold"),
            ],
        },
        Job {
            id: "job-3".into(),
            title: "مدير نمو المنتجات".into(),
            employer: "Halan".into(),
            source: "fiveamsat".into(),
            location: "القاهرة، مصر".into(),
            score: 79,
            status: JobStatus::Discovered,
            deadline: "2026-08-02".into(),
            fit_explanation: "Matched growth and MENA marketplace signals.".into(),
            description: "تحليل قنوات النمو، بناء تجارب اكتساب مستخدمين، وقياس التحويلات.".into(),
            tailored_resume: "مسودة أولية تحتاج إلى إبراز تجارب النمو والقياس.".into(),
            cover_letter: "لم يتم توليد الخطاب بعد.".into(),
            timeline: vec![event("تمت الإضافة من Khamsat", "09 يوليو", "neutral")],
        },
        Job {
            id: "job-4".into(),
            title: "محلل بيانات التوظيف".into(),
            employer: "Bayt".into(),
            source: "indeed".into(),
            location: "عمّان، الأردن".into(),
            score: 84,
            status: JobStatus::Ready,
            deadline: "2026-07-21".into(),
            fit_explanation: "Matched analytics and recruiting operations signals.".into(),
            description: "تحليل بيانات التوظيف، بناء لوحات قياس، وتقديم توصيات لفريق العمليات."
                .into(),
            tailored_resume: "سيرة تركز على SQL، لوحات القياس، وقراءة مؤشرات رحلة التوظيف.".into(),
            cover_letter: "خطاب عربي مختصر يوضح أثر التحليلات في تحسين قرارات التوظيف.".into(),
            timeline: vec![
                event("تمت المطابقة مع السيرة", "09 يوليو", "neutral"),
                event("جاهزة للتقديم", "09 يوليو", "ready"),
            ],
        },
        Job {
            id: "job-5".into(),
            title: "كاتب محتوى تقني".into(),
            employer: "StartupJobs MENA".into(),
            source: "startupjobs".into(),
            location: "عن بعد".into(),
            score: 66,
            status: JobStatus::Expired,
            deadline: "2026-07-01".into(),
            fit_explanation: "Lower match because the role is expired and less aligned.".into(),
            description: "كتابة محتوى تقني وتسويقي لشركة ناشئة في مجال أدوات المطورين.".into(),
            tailored_resume: "انتهت المهلة قبل توليد الحزمة.".into(),
            cover_letter: "انتهت المهلة قبل توليد الخطاب.".into(),
            timeline: vec![event("انتهت المهلة", "01 يوليو", "danger")],
        },
    ]
}

pub fn status_counts(jobs: &[Job]) -> Vec<(JobStatus, usize)> {
    let statuses = [
        JobStatus::Discovered,
        JobStatus::Processing,
        JobStatus::Ready,
        JobStatus::Applied,
        JobStatus::InProgress,
        JobStatus::Expired,
        JobStatus::Skipped,
    ];

    statuses
        .into_iter()
        .map(|status| {
            let count = jobs.iter().filter(|job| job.status == status).count();
            (status, count)
        })
        .collect()
}

pub fn filter_jobs(jobs: &[Job], query: &str, source: Option<&str>) -> Vec<Job> {
    let normalized_query = query.trim().to_lowercase();

    jobs.iter()
        .filter(|job| {
            let source_matches = source
                .filter(|value| !value.trim().is_empty() && *value != "all")
                .map_or(true, |selected| job.source == selected);
            let query_matches = normalized_query.is_empty()
                || job.title.to_lowercase().contains(&normalized_query)
                || job.employer.to_lowercase().contains(&normalized_query)
                || job.location.to_lowercase().contains(&normalized_query)
                || job.source.to_lowercase().contains(&normalized_query);

            source_matches && query_matches
        })
        .cloned()
        .collect()
}

pub fn seed_messages() -> Vec<RecruiterMessage> {
    vec![
        RecruiterMessage {
            id: "msg-1".into(),
            provider: "gmail".into(),
            subject: "دعوة لمقابلة أولية".into(),
            sender: "recruiting@careem.com".into(),
            matched_job_id: Some("job-2".into()),
            message_type: "interview".into(),
            timeline_action: "schedule_interview".into(),
        },
        RecruiterMessage {
            id: "msg-2".into(),
            provider: "gmail".into(),
            subject: "تحديث على طلب التقديم".into(),
            sender: "talent@noon.com".into(),
            matched_job_id: Some("job-1".into()),
            message_type: "update".into(),
            timeline_action: "add_note".into(),
        },
    ]
}

pub fn seed_sources() -> Vec<SourceSummary> {
    vec![
        source("linkedin", "LinkedIn", "Global", true),
        source("indeed", "Indeed", "Global", true),
        source("glassdoor", "Glassdoor", "Global", true),
        source("adzuna", "Adzuna", "Global", false),
        source("hiringcafe", "Hiring Cafe", "Global", true),
        source("startupjobs", "startup.jobs", "Remote", true),
        source("workingnomads", "Working Nomads", "Remote", true),
        source("bayt", "Bayt", "MENA", true),
        source("wazzuf", "WUZZUF", "MENA", true),
        source("fiveamsat", "Khamsat", "MENA", true),
        source("manual", "إضافة يدوية", "Manual", true),
    ]
}

pub fn seed_profile() -> UserProfile {
    UserProfile {
        id: "user-demo".into(),
        display_name: "جابر".into(),
        preferred_language: "ar".into(),
        target_roles: "Rust / Product / UX".into(),
        target_locations: "الرياض، دبي، القاهرة".into(),
        resume_filename: "resume.pdf".into(),
        resume_skills: "Rust, Product operations, UX, Arabic SaaS".into(),
        resume_languages: "Arabic, English".into(),
        resume_seniority: "Senior".into(),
        resume_regions: "MENA, Saudi Arabia, UAE, Egypt".into(),
        resume_work_examples: "Built Arabic-first product workflows, job search automation, and document generation prototypes.".into(),
    }
}

pub fn seed_packages() -> Vec<ApplicationPackage> {
    vec![
        package("job-1", "سيرة UX عربية", "خطاب Noon", "PDF جاهز"),
        package("job-2", "سيرة Rust مخصصة", "متابعة Careem", "PDF محدث"),
        package("job-4", "سيرة محلل بيانات", "خطاب Bayt", "PDF جاهز"),
    ]
}

pub fn bootstrap_data() -> Bootstrap {
    Bootstrap {
        profile: seed_profile(),
        jobs: seed_jobs(),
        messages: seed_messages(),
        packages: seed_packages(),
        package_history: Vec::new(),
        sources: seed_sources(),
        drafts: Vec::new(),
        draft_history: Vec::new(),
        activity_feed: activity_feed_from_jobs(&seed_jobs()),
        application_checklists: application_checklists_from_data(
            &seed_jobs(),
            &seed_packages(),
            &[],
            &seed_messages(),
        ),
    }
}

pub fn app() -> Router {
    let data_dir = FsPath::new("data");
    fs::create_dir_all(data_dir).expect("create prototype data directory");
    let store = PersistentStore::open_path(data_dir.join("prototype.sqlite"))
        .expect("open prototype database");
    store.seed_if_empty().expect("seed prototype database");
    if tokio::runtime::Handle::try_current().is_ok() {
        let scheduler_store = store.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                ticker.tick().await;
                let _ = scheduler_store.run_scheduled_scans().await;
            }
        });
    }
    app_with_store(store)
}

pub fn app_with_store(store: PersistentStore) -> Router {
    Router::new()
        .route("/", get(|| async { Redirect::temporary("/app") }))
        .route_service("/app", ServeFile::new("public/index.html"))
        .route("/api/bootstrap", get(get_bootstrap))
        .route("/api/sources", post(post_source))
        .route("/api/sources/:id/scan", post(post_source_scan))
        .route("/api/sources/:id/live-scan", post(post_source_live_scan))
        .route("/api/sources/:id/schedule", put(put_source_schedule))
        .route("/api/profile", put(put_profile))
        .route("/api/profile/resume/preview", post(post_resume_preview))
        .route("/api/jobs/import/preview", post(post_import_preview))
        .route("/api/jobs/import", post(post_import_job))
        .route("/api/jobs/:id", put(put_job_details).delete(delete_job))
        .route("/api/jobs/:id/status", patch(patch_job_status))
        .route("/api/jobs/bulk-status", patch(patch_jobs_status))
        .route("/api/drafts", post(post_draft))
        .route(
            "/api/drafts/:job_id/history/:version/restore",
            post(post_restore_draft_version),
        )
        .route(
            "/api/packages/:job_id/generate",
            post(post_generate_package),
        )
        .route("/api/packages/:job_id", put(put_package))
        .route(
            "/api/packages/:job_id/history/:version/restore",
            post(post_restore_package_version),
        )
        .route("/api/messages/:id/link", post(post_link_message))
        .route("/packages/:job_id/preview", get(get_package_preview))
        .route("/packages/:job_id/export.pdf", get(get_package_pdf))
        .fallback_service(
            ServeDir::new("public").not_found_service(ServeFile::new("public/index.html")),
        )
        .with_state(AppState { store })
}

async fn get_bootstrap(State(state): State<AppState>) -> Result<Json<Bootstrap>, StatusCode> {
    state
        .store
        .bootstrap()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_source(
    State(state): State<AppState>,
    Json(payload): Json<AddSourceRequest>,
) -> Result<Json<SourceSummary>, StatusCode> {
    state
        .store
        .add_custom_source(payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn post_source_scan(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<ScanSourceRequest>,
) -> Result<Json<ScanSourceResult>, StatusCode> {
    state
        .store
        .scan_source(&id, payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn post_source_live_scan(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<ScanSourceRequest>,
) -> Result<Json<ScanSourceResult>, StatusCode> {
    state
        .store
        .scan_source_live(&id, payload)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn put_source_schedule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<ScheduleSourceRequest>,
) -> Result<Json<SourceSummary>, StatusCode> {
    state
        .store
        .schedule_source(&id, payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn put_profile(
    State(state): State<AppState>,
    Json(payload): Json<SaveProfileRequest>,
) -> Result<Json<UserProfile>, StatusCode> {
    state
        .store
        .save_profile(payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn post_resume_preview(
    Json(payload): Json<ResumeTextParseRequest>,
) -> Result<Json<ResumeTextParsePreview>, StatusCode> {
    parse_resume_text(payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn patch_job_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateJobStatusRequest>,
) -> Result<Json<Job>, StatusCode> {
    state
        .store
        .update_job_status(&id, payload.status)
        .and_then(|_| {
            state
                .store
                .job(&id)?
                .ok_or_else(|| "job not found after status update".into())
        })
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn patch_jobs_status(
    State(state): State<AppState>,
    Json(payload): Json<BulkJobStatusRequest>,
) -> Result<Json<Vec<Job>>, StatusCode> {
    if payload.ids.is_empty() || payload.ids.len() > 50 {
        return Err(StatusCode::BAD_REQUEST);
    }
    state
        .store
        .update_jobs_status(&payload.ids, payload.status)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn post_import_preview(
    State(state): State<AppState>,
    Json(payload): Json<ManualJobImportInput>,
) -> Result<Json<ManualJobImportPreview>, StatusCode> {
    state
        .store
        .preview_manual_job_import(payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn post_import_job(
    State(state): State<AppState>,
    Json(payload): Json<ManualJobImportInput>,
) -> Result<Json<Job>, StatusCode> {
    state
        .store
        .import_manual_job(payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn put_job_details(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateJobDetailsRequest>,
) -> Result<Json<Job>, StatusCode> {
    state
        .store
        .update_job_details(&id, payload)
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn delete_job(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match state.store.delete_job(&id) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::NOT_FOUND,
    }
}

async fn post_draft(
    State(state): State<AppState>,
    Json(payload): Json<SaveDraftRequest>,
) -> Result<Json<AssistantDraft>, StatusCode> {
    state
        .store
        .save_assistant_draft(&payload.job_id, &payload.content)
        .and_then(|_| {
            state
                .store
                .assistant_draft_row(&payload.job_id)?
                .ok_or_else(|| "draft not found after save".into())
        })
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_restore_draft_version(
    State(state): State<AppState>,
    Path((job_id, version)): Path<(String, u32)>,
) -> Result<Json<AssistantDraft>, StatusCode> {
    state
        .store
        .restore_assistant_draft_version(&job_id, version)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn put_package(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    Json(payload): Json<SavePackageRequest>,
) -> Result<Json<ApplicationPackage>, StatusCode> {
    state
        .store
        .save_application_package(
            &job_id,
            &payload.resume_title,
            &payload.resume_body,
            &payload.cover_letter_title,
            &payload.cover_letter_body,
            &payload.pdf_status,
        )
        .and_then(|_| {
            state
                .store
                .application_package(&job_id)?
                .ok_or_else(|| "package not found after save".into())
        })
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn post_generate_package(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Json<ApplicationPackage>, StatusCode> {
    state
        .store
        .generate_application_package(&job_id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn post_restore_package_version(
    State(state): State<AppState>,
    Path((job_id, version)): Path<(String, u32)>,
) -> Result<Json<ApplicationPackage>, StatusCode> {
    state
        .store
        .restore_application_package_version(&job_id, version)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn get_package_preview(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Html<String>, StatusCode> {
    state
        .store
        .package_preview_html(&job_id)
        .map(Html)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn get_package_pdf(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Response, StatusCode> {
    let filename = format!("{}-application-package.pdf", safe_filename(&job_id));
    state
        .store
        .package_pdf_bytes(&job_id)
        .map(|bytes| {
            Response::builder()
                .header(header::CONTENT_TYPE, "application/pdf")
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{filename}\""),
                )
                .body(Body::from(bytes))
                .expect("build pdf response")
        })
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn post_link_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Job>, StatusCode> {
    state
        .store
        .link_recruiter_message(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

fn event(label: &str, timestamp: &str, tone: &str) -> TimelineEvent {
    TimelineEvent {
        label: label.into(),
        timestamp: timeline_timestamp(timestamp).into(),
        tone: tone.into(),
        category: default_timeline_category(),
    }
}

fn event_with_category(label: &str, timestamp: &str, tone: &str, category: &str) -> TimelineEvent {
    TimelineEvent {
        label: label.into(),
        timestamp: timeline_timestamp(timestamp).into(),
        tone: tone.into(),
        category: category.into(),
    }
}

fn default_timeline_category() -> String {
    "نشاط".into()
}

fn timeline_timestamp(timestamp: &str) -> &str {
    if timestamp == "now" {
        "الآن"
    } else {
        timestamp
    }
}

fn activity_feed_from_jobs(jobs: &[Job]) -> Vec<ActivityFeedItem> {
    let mut items: Vec<ActivityFeedItem> = jobs
        .iter()
        .flat_map(|job| {
            job.timeline.iter().map(|event| ActivityFeedItem {
                job_id: job.id.clone(),
                job_title: job.title.clone(),
                employer: job.employer.clone(),
                label: event.label.clone(),
                timestamp: event.timestamp.clone(),
                tone: event.tone.clone(),
                category: event.category.clone(),
            })
        })
        .collect();
    items.sort_by(|left, right| {
        activity_timestamp_rank(&right.timestamp)
            .cmp(&activity_timestamp_rank(&left.timestamp))
            .then_with(|| right.job_id.cmp(&left.job_id))
    });
    items
}

fn application_checklists_from_data(
    jobs: &[Job],
    packages: &[ApplicationPackage],
    drafts: &[AssistantDraft],
    messages: &[RecruiterMessage],
) -> Vec<JobApplicationChecklist> {
    jobs.iter()
        .map(|job| {
            let package = packages.iter().find(|package| package.job_id == job.id);
            let draft = drafts.iter().find(|draft| draft.job_id == job.id);
            application_checklist_for_job(job, package, draft, messages)
        })
        .collect()
}

fn application_checklist_for_job(
    job: &Job,
    package: Option<&ApplicationPackage>,
    draft: Option<&AssistantDraft>,
    messages: &[RecruiterMessage],
) -> JobApplicationChecklist {
    let fit_reviewed = job.score > 0 || !job.fit_explanation.trim().is_empty();
    let draft_saved = draft
        .map(|draft| !draft.content.trim().is_empty())
        .unwrap_or(false);
    let package_ready = package
        .map(|package| {
            !package.resume_body.trim().is_empty() && !package.cover_letter_body.trim().is_empty()
        })
        .unwrap_or(false);
    let gmail_linked = messages
        .iter()
        .any(|message| message.matched_job_id.as_deref() == Some(job.id.as_str()))
        || job.timeline.iter().any(|event| event.category == "Gmail");
    let status_ready = matches!(
        job.status,
        JobStatus::Ready | JobStatus::Applied | JobStatus::InProgress
    );

    let items = vec![
        checklist_item(
            "fit_review",
            "مراجعة المطابقة",
            fit_reviewed,
            if fit_reviewed {
                "تمت قراءة الملاءمة والكلمات المفتاحية"
            } else {
                "راجع درجة الملاءمة قبل التقديم"
            },
        ),
        checklist_item(
            "assistant_draft",
            "مسودة المساعد",
            draft_saved,
            if draft_saved {
                "مسودة محفوظة"
            } else {
                "احفظ مسودة خطاب أو متابعة"
            },
        ),
        checklist_item(
            "application_package",
            "حزمة التقديم",
            package_ready,
            if package_ready {
                "السيرة والخطاب جاهزان"
            } else {
                "ولّد أو احفظ السيرة والخطاب"
            },
        ),
        checklist_item(
            "gmail_followup",
            "متابعة Gmail",
            gmail_linked,
            if gmail_linked {
                "رسالة مرتبطة بالخط الزمني"
            } else {
                "اربط رسالة عند وصول رد من الموظف"
            },
        ),
        checklist_item(
            "application_status",
            "حالة الطلب",
            status_ready,
            if status_ready {
                "الوظيفة انتقلت لمرحلة تنفيذية"
            } else {
                "انقل الوظيفة إلى جاهزة أو تم التقديم"
            },
        ),
    ];
    let completed_count = items.iter().filter(|item| item.completed).count();
    JobApplicationChecklist {
        job_id: job.id.clone(),
        completed_count,
        total_count: items.len(),
        items,
    }
}

fn checklist_item(
    key: &str,
    label: &str,
    completed: bool,
    detail: &str,
) -> ApplicationChecklistItem {
    ApplicationChecklistItem {
        key: key.into(),
        label: label.into(),
        completed,
        detail: detail.into(),
    }
}

fn activity_timestamp_rank(timestamp: &str) -> u8 {
    if timestamp == "الآن" {
        2
    } else if timestamp.contains("09") {
        1
    } else {
        0
    }
}

fn append_job_timeline_event(
    conn: &Connection,
    job_id: &str,
    timeline_event: TimelineEvent,
) -> StoreResult<()> {
    let timeline_json = conn
        .query_row(
            "SELECT timeline_json FROM jobs WHERE id = ?1",
            params![job_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or("job not found for timeline event")?;
    let mut timeline: Vec<TimelineEvent> = serde_json::from_str(&timeline_json).unwrap_or_default();
    timeline.insert(0, timeline_event);
    conn.execute(
        "UPDATE jobs SET timeline_json = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![serde_json::to_string(&timeline)?, job_id],
    )?;
    Ok(())
}

fn source(id: &str, label: &str, region: &str, enabled: bool) -> SourceSummary {
    let (import_url_template, import_hint) = source_import_preset(id);
    let connector = connector_profile(id);
    SourceSummary {
        id: id.into(),
        label: label.into(),
        region: region.into(),
        enabled,
        import_url_template: import_url_template.into(),
        import_hint: import_hint.into(),
        url: import_url_template.into(),
        custom: false,
        last_scanned_at: String::new(),
        job_count: 0,
        connector: connector.label.into(),
        connector_mode: connector_mode_key(connector.mode).into(),
        connector_note: connector_note(id).into(),
        last_error: String::new(),
        scheduled: false,
        interval_minutes: 360,
        next_scan_at: String::new(),
    }
}

fn connector_mode_key(mode: ConnectorMode) -> &'static str {
    match mode {
        ConnectorMode::PublicHtml => "public_html",
        ConnectorMode::ApprovedApi => "approved_api",
        ConnectorMode::Unsupported => "unsupported",
    }
}

fn connector_note(source_id: &str) -> &'static str {
    match connector_profile(source_id).mode {
        ConnectorMode::ApprovedApi => "يتطلب مفتاح API معتمد من المزود.",
        ConnectorMode::PublicHtml => "يستخدم صفحات عامة مع احترام حدود الموقع.",
        ConnectorMode::Unsupported => "يحتاج موصل مخصص.",
    }
}

fn source_import_preset(source_id: &str) -> (&'static str, &'static str) {
    match source_id {
        "linkedin" => (
            "https://www.linkedin.com/jobs/",
            "Paste a LinkedIn job URL or full job text.",
        ),
        "indeed" => (
            "https://www.indeed.com/jobs",
            "Paste an Indeed job URL or copied listing text.",
        ),
        "glassdoor" => (
            "https://www.glassdoor.com/Job/",
            "Paste a Glassdoor job URL or copied listing text.",
        ),
        "adzuna" => (
            "https://www.adzuna.com/jobs/",
            "Adzuna preset is ready for later connector setup.",
        ),
        "hiringcafe" => (
            "https://hiring.cafe/",
            "Paste a Hiring Cafe URL or listing body.",
        ),
        "startupjobs" => (
            "https://startup.jobs/",
            "Paste a startup.jobs URL or remote role text.",
        ),
        "workingnomads" => (
            "https://www.workingnomads.com/jobs",
            "Paste a Working Nomads URL or remote job text.",
        ),
        "bayt" => (
            "https://www.bayt.com/en/jobs/",
            "Bayt preset for MENA job links and copied descriptions.",
        ),
        "wazzuf" => (
            "https://wuzzuf.net/jobs/",
            "WUZZUF preset for Egypt and regional role imports.",
        ),
        "fiveamsat" => (
            "https://khamsat.com/",
            "Khamsat preset for freelance service and project listings.",
        ),
        _ => ("", "Paste any job URL or complete job post text."),
    }
}

fn package(
    job_id: &str,
    resume_title: &str,
    cover_letter_title: &str,
    pdf_status: &str,
) -> ApplicationPackage {
    ApplicationPackage {
        job_id: job_id.into(),
        resume_title: resume_title.into(),
        resume_body: "ملخص سيرة مخصص يبرز الخبرات الأكثر صلة بالوظيفة، مع إنجازات قابلة للقياس وكلمات مفتاحية من الإعلان.".into(),
        cover_letter_title: cover_letter_title.into(),
        cover_letter_body: "خطاب تقديم عربي مختصر يربط خبرة المرشح باحتياج الشركة، ويقترح سبب الاهتمام وخطوة متابعة واضحة.".into(),
        pdf_status: pdf_status.into(),
        generated_at: "2026-07-09 04:56".into(),
    }
}

impl PersistentStore {
    pub fn open_in_memory() -> StoreResult<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    pub fn open_path(path: impl AsRef<FsPath>) -> StoreResult<Self> {
        Self::from_connection(Connection::open(path)?)
    }

    fn from_connection(conn: Connection) -> StoreResult<Self> {
        let store = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> StoreResult<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                preferred_language TEXT NOT NULL DEFAULT 'ar',
                target_roles TEXT NOT NULL DEFAULT '',
                target_locations TEXT NOT NULL DEFAULT '',
                resume_filename TEXT NOT NULL DEFAULT '',
                resume_skills TEXT NOT NULL DEFAULT '',
                resume_languages TEXT NOT NULL DEFAULT '',
                resume_seniority TEXT NOT NULL DEFAULT '',
                resume_regions TEXT NOT NULL DEFAULT '',
                resume_work_examples TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                employer TEXT NOT NULL,
                source TEXT NOT NULL,
                location TEXT NOT NULL,
                score INTEGER NOT NULL,
                status TEXT NOT NULL,
                deadline TEXT NOT NULL,
                description TEXT NOT NULL,
                tailored_resume TEXT NOT NULL,
                cover_letter TEXT NOT NULL,
                fit_explanation TEXT NOT NULL DEFAULT '',
                timeline_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS application_packages (
                job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
                resume_title TEXT NOT NULL,
                resume_body TEXT NOT NULL DEFAULT '',
                cover_letter_title TEXT NOT NULL,
                cover_letter_body TEXT NOT NULL DEFAULT '',
                pdf_status TEXT NOT NULL,
                generated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS application_package_history (
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                resume_title TEXT NOT NULL,
                resume_body TEXT NOT NULL DEFAULT '',
                cover_letter_title TEXT NOT NULL,
                cover_letter_body TEXT NOT NULL DEFAULT '',
                pdf_status TEXT NOT NULL,
                generated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (job_id, version)
            );

            CREATE TABLE IF NOT EXISTS recruiter_messages (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                subject TEXT NOT NULL,
                sender TEXT NOT NULL,
                matched_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
                message_type TEXT NOT NULL,
                timeline_action TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assistant_drafts (
                job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS assistant_draft_history (
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                content TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (job_id, version)
            );

            CREATE TABLE IF NOT EXISTS job_sources (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                url TEXT NOT NULL,
                region TEXT NOT NULL DEFAULT 'Custom',
                enabled INTEGER NOT NULL DEFAULT 1,
                last_scanned_at TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS source_syncs (
                source_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0,
                interval_minutes INTEGER NOT NULL DEFAULT 360,
                last_run_at TEXT NOT NULL DEFAULT '',
                next_run_at TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT ''
            );
            ",
        )?;
        add_column_if_missing(&conn, "users", "target_roles", "TEXT NOT NULL DEFAULT ''")?;
        add_column_if_missing(
            &conn,
            "users",
            "target_locations",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            &conn,
            "users",
            "resume_filename",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(&conn, "users", "resume_skills", "TEXT NOT NULL DEFAULT ''")?;
        add_column_if_missing(
            &conn,
            "users",
            "resume_languages",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            &conn,
            "users",
            "resume_seniority",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(&conn, "users", "resume_regions", "TEXT NOT NULL DEFAULT ''")?;
        add_column_if_missing(
            &conn,
            "users",
            "resume_work_examples",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            &conn,
            "application_packages",
            "resume_body",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(
            &conn,
            "application_packages",
            "cover_letter_body",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        add_column_if_missing(&conn, "jobs", "fit_explanation", "TEXT NOT NULL DEFAULT ''")?;
        Ok(())
    }

    pub fn seed_if_empty(&self) -> StoreResult<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM jobs", [], |row| row.get(0))?;
        if count > 0 {
            return Ok(());
        }

        let profile = seed_profile();
        conn.execute(
            "INSERT OR IGNORE INTO users
                (id, display_name, preferred_language, target_roles, target_locations, resume_filename,
                 resume_skills, resume_languages, resume_seniority, resume_regions, resume_work_examples)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                profile.id,
                profile.display_name,
                profile.preferred_language,
                profile.target_roles,
                profile.target_locations,
                profile.resume_filename,
                profile.resume_skills,
                profile.resume_languages,
                profile.resume_seniority,
                profile.resume_regions,
                profile.resume_work_examples,
            ],
        )?;

        for job in seed_jobs() {
            conn.execute(
                "INSERT INTO jobs
                    (id, title, employer, source, location, score, status, deadline, description, tailored_resume, cover_letter, fit_explanation, timeline_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    job.id,
                    job.title,
                    job.employer,
                    job.source,
                    job.location,
                    job.score,
                    job_status_to_str(&job.status),
                    job.deadline,
                    job.description,
                    job.tailored_resume,
                    job.cover_letter,
                    job.fit_explanation,
                    serde_json::to_string(&job.timeline)?,
                ],
            )?;
        }

        for package in seed_packages() {
            conn.execute(
                "INSERT INTO application_packages
                    (job_id, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    package.job_id,
                    package.resume_title,
                    package.resume_body,
                    package.cover_letter_title,
                    package.cover_letter_body,
                    package.pdf_status,
                    package.generated_at,
                ],
            )?;
        }

        for message in seed_messages() {
            conn.execute(
                "INSERT INTO recruiter_messages
                    (id, provider, subject, sender, matched_job_id, message_type, timeline_action)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    message.id,
                    message.provider,
                    message.subject,
                    message.sender,
                    message.matched_job_id,
                    message.message_type,
                    message.timeline_action,
                ],
            )?;
        }

        Ok(())
    }

    pub fn bootstrap(&self) -> StoreResult<Bootstrap> {
        Ok(Bootstrap {
            profile: self.profile()?,
            jobs: self.jobs()?,
            messages: self.messages()?,
            packages: self.packages()?,
            package_history: self.package_history()?,
            sources: self.sources()?,
            drafts: self.drafts()?,
            draft_history: self.draft_history()?,
            activity_feed: self.activity_feed()?,
            application_checklists: self.application_checklists()?,
        })
    }

    pub fn sources(&self) -> StoreResult<Vec<SourceSummary>> {
        let mut sources = seed_sources();
        let conn = self.conn.lock().expect("database mutex poisoned");
        for source in &mut sources {
            source.job_count = conn.query_row(
                "SELECT COUNT(*) FROM jobs WHERE source = ?1",
                params![source.id],
                |count| count.get::<_, i64>(0),
            )? as usize;
            if let Some((enabled, interval_minutes, next_run_at, last_error)) = conn
                .query_row(
                    "SELECT enabled, interval_minutes, next_run_at, last_error FROM source_syncs WHERE source_id = ?1",
                    params![source.id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)? != 0,
                            row.get::<_, u32>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()?
            {
                source.scheduled = enabled;
                source.interval_minutes = interval_minutes;
                source.next_scan_at = next_run_at;
                source.last_error = last_error;
            }
        }
        let mut stmt = conn.prepare(
            "SELECT id, label, url, region, enabled, last_scanned_at FROM job_sources ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)? != 0,
                row.get::<_, String>(5)?,
            ))
        })?;
        for row in rows {
            let (id, label, url, region, enabled, last_scanned_at) = row?;
            let connector = connector_profile(&id);
            let connector_note = connector_note(&id).to_string();
            let sync_meta = conn
                .query_row(
                    "SELECT enabled, interval_minutes, next_run_at, last_error FROM source_syncs WHERE source_id = ?1",
                    params![id],
                    |sync| {
                        Ok((
                            sync.get::<_, i64>(0)? != 0,
                            sync.get::<_, u32>(1)?,
                            sync.get::<_, String>(2)?,
                            sync.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()?;
            let job_count = conn.query_row(
                "SELECT COUNT(*) FROM jobs WHERE source = ?1",
                params![id],
                |count| count.get::<_, i64>(0),
            )? as usize;
            sources.push(SourceSummary {
                id,
                label,
                region,
                enabled,
                import_url_template: url.clone(),
                import_hint: "أضف المصدر ثم شغّل الفحص لاكتشاف وظائف مناسبة لملفك.".into(),
                url,
                custom: true,
                last_scanned_at,
                job_count,
                connector: connector.label.into(),
                connector_mode: connector_mode_key(connector.mode).into(),
                connector_note,
                scheduled: sync_meta.as_ref().map(|meta| meta.0).unwrap_or(false),
                interval_minutes: sync_meta.as_ref().map(|meta| meta.1).unwrap_or(360),
                next_scan_at: sync_meta
                    .as_ref()
                    .map(|meta| meta.2.clone())
                    .unwrap_or_default(),
                last_error: sync_meta.map(|meta| meta.3).unwrap_or_default(),
            });
        }
        Ok(sources)
    }

    pub fn add_custom_source(&self, input: AddSourceRequest) -> StoreResult<SourceSummary> {
        let label = required_field(input.label, "source label")?;
        let url = required_field(input.url, "source URL")?;
        let region = optional_field(input.region);
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err("source URL must start with http:// or https://".into());
        }
        let id = format!("custom-{}", current_millis());
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO job_sources (id, label, url, region) VALUES (?1, ?2, ?3, ?4)",
            params![
                id,
                label,
                url,
                if region.is_empty() { "Custom" } else { &region }
            ],
        )?;
        drop(conn);
        self.sources()?
            .into_iter()
            .find(|source| source.id == id)
            .ok_or_else(|| "custom source was not saved".into())
    }

    pub fn schedule_source(
        &self,
        source_id: &str,
        input: ScheduleSourceRequest,
    ) -> StoreResult<SourceSummary> {
        if !self.sources()?.iter().any(|source| source.id == source_id) {
            return Err("source not found".into());
        }
        let interval_minutes = input.interval_minutes.clamp(15, 7 * 24 * 60);
        let conn = self.conn.lock().expect("database mutex poisoned");
        if input.enabled {
            conn.execute(
                "INSERT INTO source_syncs (source_id, enabled, interval_minutes, next_run_at, last_error) VALUES (?1, 1, ?2, datetime('now', '+' || ?2 || ' minutes'), '') ON CONFLICT(source_id) DO UPDATE SET enabled = 1, interval_minutes = excluded.interval_minutes, next_run_at = excluded.next_run_at, last_error = ''",
                params![source_id, interval_minutes],
            )?;
        } else {
            conn.execute(
                "INSERT INTO source_syncs (source_id, enabled, interval_minutes, next_run_at, last_error) VALUES (?1, 0, ?2, '', '') ON CONFLICT(source_id) DO UPDATE SET enabled = 0, interval_minutes = excluded.interval_minutes, next_run_at = '', last_error = ''",
                params![source_id, interval_minutes],
            )?;
        }
        drop(conn);
        self.sources()?
            .into_iter()
            .find(|source| source.id == source_id)
            .ok_or_else(|| "source disappeared after schedule update".into())
    }

    pub async fn run_scheduled_scans(&self) -> StoreResult<usize> {
        let due_sources = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let mut stmt = conn.prepare(
                "SELECT source_id, interval_minutes FROM source_syncs WHERE enabled = 1 AND (next_run_at = '' OR next_run_at <= datetime('now'))",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
            })?;
            collect_rows(rows)?
        };
        let profile = self.profile()?;
        let mut completed = 0;
        for (source_id, interval_minutes) in due_sources {
            let result = self
                .scan_source_live(
                    &source_id,
                    ScanSourceRequest {
                        query: profile.target_roles.clone(),
                        location: profile.target_locations.clone(),
                        max_results: 10,
                    },
                )
                .await;
            let conn = self.conn.lock().expect("database mutex poisoned");
            match result {
                Ok(_) => {
                    conn.execute(
                        "UPDATE source_syncs SET last_run_at = datetime('now'), next_run_at = datetime('now', '+' || ?1 || ' minutes'), last_error = '' WHERE source_id = ?2",
                        params![interval_minutes, source_id],
                    )?;
                    completed += 1;
                }
                Err(error) => {
                    conn.execute(
                        "UPDATE source_syncs SET last_run_at = datetime('now'), next_run_at = datetime('now', '+' || ?1 || ' minutes'), last_error = ?2 WHERE source_id = ?3",
                        params![interval_minutes, error.to_string(), source_id],
                    )?;
                }
            }
        }
        Ok(completed)
    }

    pub fn scan_source(
        &self,
        source_id: &str,
        input: ScanSourceRequest,
    ) -> StoreResult<ScanSourceResult> {
        let source = self
            .sources()?
            .into_iter()
            .find(|candidate| candidate.id == source_id)
            .ok_or_else(|| "source not found".to_string())?;
        let profile = self.profile()?;
        let query = if input.query.trim().is_empty() {
            profile
                .target_roles
                .split(',')
                .next()
                .unwrap_or("مناسب لملفك")
                .trim()
                .to_string()
        } else {
            input.query.trim().to_string()
        };
        let location = if input.location.trim().is_empty() {
            profile
                .target_locations
                .split(',')
                .next()
                .unwrap_or("عن بعد")
                .trim()
                .to_string()
        } else {
            input.location.trim().to_string()
        };
        let max_results = input.max_results.clamp(1, 10);
        let role_variants = [
            format!("{} Engineer", query),
            format!("{} Specialist", query),
            format!("{} Lead", query),
            format!("{} Manager", query),
            format!("{} Consultant", query),
            format!("{} Developer", query),
            format!("{} Analyst", query),
            format!("{} Coordinator", query),
            format!("{} Designer", query),
            format!("{} Associate", query),
        ];
        let scanned_at = "الآن".to_string();
        let mut jobs = Vec::with_capacity(max_results);
        let conn = self.conn.lock().expect("database mutex poisoned");
        for (index, title) in role_variants.iter().take(max_results).enumerate() {
            let description = format!(
                "فرصة مستخرجة من {} عبر فحص المصدر. ابحث عن خبرة {} والعمل في {}.",
                source.label, query, location
            );
            let preview = ManualJobImportPreview {
                url: source.url.clone(),
                title: title.clone(),
                employer: format!("{} Partner {}", source.label, index + 1),
                source: source.id.clone(),
                location: location.clone(),
                description: description.clone(),
                fit_explanation: String::new(),
                extraction_quality: "source_scan".into(),
                extraction_summary: "تم استخراج الوظيفة من فحص المصدر وربطها بملفك المهني.".into(),
                field_sources: ImportFieldSources {
                    title: "source_scan".into(),
                    employer: "source_scan".into(),
                    location: "source_scan".into(),
                    description: "source_scan".into(),
                },
            };
            let fit = summarize_job_fit(&preview, &profile);
            let id = format!("scan-{}-{}", current_millis(), index);
            let job = Job {
                id: id.clone(),
                title: title.clone(),
                employer: preview.employer.clone(),
                source: source.id.clone(),
                location: location.clone(),
                score: fit.score,
                status: JobStatus::Discovered,
                deadline: "TBD".into(),
                description,
                tailored_resume: "سيتم تجهيز السيرة بعد مراجعة الوظيفة.".into(),
                cover_letter: "سيتم تجهيز الخطاب بعد مراجعة الوظيفة.".into(),
                fit_explanation: fit.explanation,
                timeline: vec![event_with_category(
                    "تم اكتشاف الوظيفة عبر فحص المصدر",
                    "الآن",
                    "neutral",
                    "استخراج",
                )],
            };
            conn.execute(
                "INSERT INTO jobs
                    (id, title, employer, source, location, score, status, deadline, description, tailored_resume, cover_letter, fit_explanation, timeline_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    job.id,
                    job.title,
                    job.employer,
                    job.source,
                    job.location,
                    job.score,
                    job_status_to_str(&job.status),
                    job.deadline,
                    job.description,
                    job.tailored_resume,
                    job.cover_letter,
                    job.fit_explanation,
                    serde_json::to_string(&job.timeline)?,
                ],
            )?;
            jobs.push(job);
        }
        conn.execute(
            "UPDATE job_sources SET last_scanned_at = ?1 WHERE id = ?2",
            params![scanned_at, source_id],
        )?;
        drop(conn);
        let updated_source = self
            .sources()?
            .into_iter()
            .find(|candidate| candidate.id == source_id)
            .ok_or_else(|| "source disappeared after scan".to_string())?;
        Ok(ScanSourceResult {
            source: updated_source,
            jobs,
            scanned_at,
            mode: "prototype_source_extractor".into(),
        })
    }

    pub fn update_jobs_status(&self, ids: &[String], status: JobStatus) -> StoreResult<Vec<Job>> {
        for id in ids {
            self.update_job_status(id, status.clone())?;
        }
        ids.iter()
            .map(|id| {
                self.job(id)?
                    .ok_or_else(|| "job disappeared after bulk update".into())
            })
            .collect()
    }

    pub async fn scan_source_live(
        &self,
        source_id: &str,
        input: ScanSourceRequest,
    ) -> StoreResult<ScanSourceResult> {
        let source = self
            .sources()?
            .into_iter()
            .find(|candidate| candidate.id == source_id)
            .ok_or_else(|| "source not found".to_string())?;
        let query = input.query.trim().to_string();
        let location = input.location.trim().to_string();
        let listings = fetch_and_parse(&source.url, source_id, &query, &location)
            .await
            .map_err(std::io::Error::other)?;
        if listings.is_empty() {
            return Err("live connector returned no matching listings".into());
        }

        let existing = self.jobs()?;
        let mut jobs = Vec::new();
        for listing in listings.into_iter().take(input.max_results.clamp(1, 10)) {
            if existing.iter().any(|job| {
                job.source == source_id
                    && job.title.eq_ignore_ascii_case(&listing.title)
                    && job.employer.eq_ignore_ascii_case(&listing.employer)
            }) {
                continue;
            }
            let imported = self.import_manual_job(ManualJobImportInput {
                url: listing.source_url,
                title: listing.title,
                employer: listing.employer,
                location: listing.location,
                description: listing.description,
            })?;
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "UPDATE jobs SET source = ?1 WHERE id = ?2",
                params![source_id, imported.id],
            )?;
            drop(conn);
            if let Some(job) = self.job(&imported.id)? {
                jobs.push(job);
            }
        }
        if jobs.is_empty() {
            return Err("live connector found no new matching listings".into());
        }
        let updated_source = self
            .sources()?
            .into_iter()
            .find(|candidate| candidate.id == source_id)
            .ok_or_else(|| "source disappeared after live scan".to_string())?;
        Ok(ScanSourceResult {
            source: updated_source,
            jobs,
            scanned_at: "الآن".into(),
            mode: "live_html_connector".into(),
        })
    }

    pub fn profile(&self) -> StoreResult<UserProfile> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT id, display_name, preferred_language, target_roles, target_locations, resume_filename,
                    resume_skills, resume_languages, resume_seniority, resume_regions, resume_work_examples
             FROM users
             WHERE id = 'user-demo'",
            [],
            profile_from_row,
        )
        .optional()?
        .ok_or_else(|| "profile not found".into())
    }

    pub fn save_profile(&self, input: SaveProfileRequest) -> StoreResult<UserProfile> {
        let display_name = required_field(input.display_name, "display name")?;
        let preferred_language = required_field(input.preferred_language, "preferred language")?;
        let target_roles = required_field(input.target_roles, "target roles")?;
        let target_locations = required_field(input.target_locations, "target locations")?;
        let resume_filename = required_field(input.resume_filename, "resume filename")?;
        let resume_skills = optional_field(input.resume_skills);
        let resume_languages = optional_field(input.resume_languages);
        let resume_seniority = optional_field(input.resume_seniority);
        let resume_regions = optional_field(input.resume_regions);
        let resume_work_examples = optional_field(input.resume_work_examples);

        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "INSERT INTO users
                    (id, display_name, preferred_language, target_roles, target_locations, resume_filename,
                     resume_skills, resume_languages, resume_seniority, resume_regions, resume_work_examples)
                 VALUES ('user-demo', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                    display_name = excluded.display_name,
                    preferred_language = excluded.preferred_language,
                    target_roles = excluded.target_roles,
                    target_locations = excluded.target_locations,
                    resume_filename = excluded.resume_filename,
                    resume_skills = excluded.resume_skills,
                    resume_languages = excluded.resume_languages,
                    resume_seniority = excluded.resume_seniority,
                    resume_regions = excluded.resume_regions,
                    resume_work_examples = excluded.resume_work_examples",
                params![
                    display_name,
                    preferred_language,
                    target_roles,
                    target_locations,
                    resume_filename,
                    resume_skills,
                    resume_languages,
                    resume_seniority,
                    resume_regions,
                    resume_work_examples,
                ],
            )?;
        }

        self.profile()
    }

    pub fn jobs(&self) -> StoreResult<Vec<Job>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, title, employer, source, location, score, status, deadline, description,
                    tailored_resume, cover_letter, fit_explanation, timeline_json
             FROM jobs
             ORDER BY score DESC, id ASC",
        )?;
        let rows = stmt.query_map([], job_from_row)?;
        collect_rows(rows)
    }

    pub fn activity_feed(&self) -> StoreResult<Vec<ActivityFeedItem>> {
        self.jobs().map(|jobs| activity_feed_from_jobs(&jobs))
    }

    pub fn application_checklists(&self) -> StoreResult<Vec<JobApplicationChecklist>> {
        let jobs = self.jobs()?;
        let packages = self.packages()?;
        let drafts = self.drafts()?;
        let messages = self.messages()?;
        Ok(application_checklists_from_data(
            &jobs, &packages, &drafts, &messages,
        ))
    }

    pub fn application_checklist(
        &self,
        job_id: &str,
    ) -> StoreResult<Option<JobApplicationChecklist>> {
        Ok(self
            .application_checklists()?
            .into_iter()
            .find(|checklist| checklist.job_id == job_id))
    }

    pub fn job(&self, id: &str) -> StoreResult<Option<Job>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT id, title, employer, source, location, score, status, deadline, description,
                    tailored_resume, cover_letter, fit_explanation, timeline_json
             FROM jobs
             WHERE id = ?1",
            params![id],
            job_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn update_job_status(&self, id: &str, status: JobStatus) -> StoreResult<()> {
        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let changed = conn.execute(
                "UPDATE jobs SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![job_status_to_str(&status), id],
            )?;
            if changed == 0 {
                return Err("job not found".into());
            }
        }
        self.append_job_timeline_event(
            id,
            &format!("تم نقل الوظيفة إلى {}", job_status_label_ar(&status)),
            "ready",
            "حالة",
        )?;
        Ok(())
    }

    pub fn preview_manual_job_import(
        &self,
        input: ManualJobImportInput,
    ) -> StoreResult<ManualJobImportPreview> {
        let mut preview = normalize_manual_job_import(input)?;
        let profile = self.profile()?;
        preview.fit_explanation = summarize_job_fit(&preview, &profile).explanation;
        Ok(preview)
    }

    pub fn import_manual_job(&self, input: ManualJobImportInput) -> StoreResult<Job> {
        let mut preview = normalize_manual_job_import(input)?;
        let profile = self.profile()?;
        let fit = summarize_job_fit(&preview, &profile);
        preview.fit_explanation = fit.explanation.clone();
        let extraction_summary = preview.extraction_summary.clone();
        let id = format!("manual-{}", current_millis());
        let job = Job {
            id,
            title: preview.title,
            employer: preview.employer,
            source: preview.source,
            location: preview.location,
            score: fit.score,
            status: JobStatus::Discovered,
            deadline: "TBD".into(),
            tailored_resume:
                "لم يتم توليد السيرة بعد. سيحوّل المساعد هذا الاستيراد إلى حزمة تقديم مخصصة.".into(),
            cover_letter: "لم يتم توليد الخطاب بعد. افتح مساحة الوظيفة لاستخدام الكاتب الذكي."
                .into(),
            description: preview.description,
            fit_explanation: preview.fit_explanation,
            timeline: vec![
                event_with_category(
                    "manual import from pasted job link",
                    "now",
                    "neutral",
                    "استيراد",
                ),
                event_with_category(
                    &format!("import audit: {extraction_summary}"),
                    "now",
                    "gold",
                    "تدقيق",
                ),
            ],
        };

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO jobs
                (id, title, employer, source, location, score, status, deadline, description, tailored_resume, cover_letter, fit_explanation, timeline_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                job.id,
                job.title,
                job.employer,
                job.source,
                job.location,
                job.score,
                job_status_to_str(&job.status),
                job.deadline,
                job.description,
                job.tailored_resume,
                job.cover_letter,
                job.fit_explanation,
                serde_json::to_string(&job.timeline)?,
            ],
        )?;

        Ok(job)
    }

    pub fn update_job_details(&self, id: &str, input: UpdateJobDetailsRequest) -> StoreResult<Job> {
        let title = required_field(input.title, "job title")?;
        let employer = required_field(input.employer, "employer")?;
        let location = required_field(input.location, "location")?;
        let description = required_field(input.description, "description")?;

        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let changed = conn.execute(
                "UPDATE jobs
                 SET title = ?1,
                     employer = ?2,
                     location = ?3,
                     description = ?4,
                     updated_at = datetime('now')
                 WHERE id = ?5",
                params![title, employer, location, description, id],
            )?;
            if changed == 0 {
                return Err("job not found".into());
            }
        }

        self.job(id)?
            .ok_or_else(|| "job not found after details update".into())
    }

    pub fn delete_job(&self, id: &str) -> StoreResult<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let changed = conn.execute("DELETE FROM jobs WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err("job not found".into());
        }
        Ok(())
    }

    pub fn save_assistant_draft(&self, job_id: &str, content: &str) -> StoreResult<()> {
        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let version: i64 = conn.query_row(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM assistant_draft_history WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )?;
            conn.execute(
                "INSERT INTO assistant_drafts (job_id, content, updated_at)
                 VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(job_id) DO UPDATE SET
                    content = excluded.content,
                    updated_at = datetime('now')",
                params![job_id, content],
            )?;
            conn.execute(
                "INSERT INTO assistant_draft_history (job_id, version, content, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'))",
                params![job_id, version, content],
            )?;
        }
        self.append_job_timeline_event(job_id, "تم حفظ مسودة المساعد", "gold", "مساعد")?;
        Ok(())
    }

    pub fn assistant_draft(&self, job_id: &str) -> StoreResult<Option<String>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT content FROM assistant_drafts WHERE job_id = ?1",
            params![job_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn assistant_draft_row(&self, job_id: &str) -> StoreResult<Option<AssistantDraft>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT job_id, content, updated_at FROM assistant_drafts WHERE job_id = ?1",
            params![job_id],
            |row| {
                Ok(AssistantDraft {
                    job_id: row.get(0)?,
                    content: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn drafts(&self) -> StoreResult<Vec<AssistantDraft>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, content, updated_at FROM assistant_drafts ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AssistantDraft {
                job_id: row.get(0)?,
                content: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        collect_rows(rows)
    }

    pub fn assistant_draft_history(&self, job_id: &str) -> StoreResult<Vec<AssistantDraftVersion>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, version, content, updated_at
             FROM assistant_draft_history
             WHERE job_id = ?1
             ORDER BY version DESC",
        )?;
        let rows = stmt.query_map(params![job_id], draft_version_from_row)?;
        collect_rows(rows)
    }

    pub fn restore_assistant_draft_version(
        &self,
        job_id: &str,
        version: u32,
    ) -> StoreResult<AssistantDraft> {
        let content: String = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.query_row(
                "SELECT content FROM assistant_draft_history WHERE job_id = ?1 AND version = ?2",
                params![job_id, version],
                |row| row.get(0),
            )?
        };
        self.save_assistant_draft(job_id, &content)?;
        self.assistant_draft_row(job_id)?
            .ok_or_else(|| "draft not found after restore".into())
    }

    pub fn draft_history(&self) -> StoreResult<Vec<AssistantDraftVersion>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, version, content, updated_at
             FROM assistant_draft_history
             ORDER BY updated_at DESC, job_id ASC, version DESC",
        )?;
        let rows = stmt.query_map([], draft_version_from_row)?;
        collect_rows(rows)
    }

    pub fn save_application_package(
        &self,
        job_id: &str,
        resume_title: &str,
        resume_body: &str,
        cover_letter_title: &str,
        cover_letter_body: &str,
        pdf_status: &str,
    ) -> StoreResult<()> {
        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let version: i64 = conn.query_row(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM application_package_history WHERE job_id = ?1",
                params![job_id],
                |row| row.get(0),
            )?;
            conn.execute(
                "INSERT INTO application_packages
                    (job_id, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
                 ON CONFLICT(job_id) DO UPDATE SET
                    resume_title = excluded.resume_title,
                    resume_body = excluded.resume_body,
                    cover_letter_title = excluded.cover_letter_title,
                    cover_letter_body = excluded.cover_letter_body,
                    pdf_status = excluded.pdf_status,
                    generated_at = datetime('now')",
                params![
                    job_id,
                    resume_title,
                    resume_body,
                    cover_letter_title,
                    cover_letter_body,
                    pdf_status
                ],
            )?;
            conn.execute(
                "INSERT INTO application_package_history
                    (job_id, version, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
                params![
                    job_id,
                    version,
                    resume_title,
                    resume_body,
                    cover_letter_title,
                    cover_letter_body,
                    pdf_status
                ],
            )?;
        }
        self.append_job_timeline_event(job_id, "تم حفظ حزمة التقديم", "ready", "مستندات")?;
        Ok(())
    }

    pub fn generate_application_package(&self, job_id: &str) -> StoreResult<ApplicationPackage> {
        let profile = self.profile()?;
        let job = self
            .job(job_id)?
            .ok_or_else(|| "job not found for package generation".to_string())?;
        let resume_title = format!("سيرة مخصصة - {}", job.title);
        let cover_letter_title = format!("خطاب مخصص - {}", job.employer);
        let structured_profile = format!(
            "Structured profile: skills [{}]; languages [{}]; seniority [{}]; regions [{}]; examples [{}]",
            profile.resume_skills,
            profile.resume_languages,
            profile.resume_seniority,
            profile.resume_regions,
            profile.resume_work_examples
        );
        let cv_summary = bilingual_cv_summary(&profile, &job);
        let resume_body =
            export_ready_resume_body(&profile, &job, &cv_summary, &structured_profile);
        let cover_letter_body = export_ready_cover_letter_body(&profile, &job, &cv_summary);

        self.save_application_package(
            job_id,
            &resume_title,
            &resume_body,
            &cover_letter_title,
            &cover_letter_body,
            "PDF يحتاج مراجعة",
        )?;
        self.append_job_timeline_event(job_id, "تم توليد حزمة التقديم", "gold", "مستندات")?;
        self.application_package(job_id)?
            .ok_or_else(|| "package not found after generation".into())
    }

    pub fn package_preview_html(&self, job_id: &str) -> StoreResult<String> {
        let job = self
            .job(job_id)?
            .ok_or_else(|| "job not found for package preview".to_string())?;
        let package = self
            .application_package(job_id)?
            .ok_or_else(|| "package not found for preview".to_string())?;
        Ok(render_package_preview_html(&job, &package))
    }

    pub fn package_pdf_bytes(&self, job_id: &str) -> StoreResult<Vec<u8>> {
        let job = self
            .job(job_id)?
            .ok_or_else(|| "job not found for package pdf".to_string())?;
        let package = self
            .application_package(job_id)?
            .ok_or_else(|| "package not found for pdf".to_string())?;
        Ok(render_package_pdf_bytes(&job, &package))
    }

    pub fn application_package(&self, job_id: &str) -> StoreResult<Option<ApplicationPackage>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT job_id, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at
             FROM application_packages
             WHERE job_id = ?1",
            params![job_id],
            package_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn packages(&self) -> StoreResult<Vec<ApplicationPackage>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at
             FROM application_packages
             ORDER BY generated_at DESC, job_id ASC",
        )?;
        let rows = stmt.query_map([], package_from_row)?;
        collect_rows(rows)
    }

    pub fn application_package_history(
        &self,
        job_id: &str,
    ) -> StoreResult<Vec<ApplicationPackageVersion>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, version, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at
             FROM application_package_history
             WHERE job_id = ?1
             ORDER BY version DESC",
        )?;
        let rows = stmt.query_map(params![job_id], package_version_from_row)?;
        collect_rows(rows)
    }

    pub fn restore_application_package_version(
        &self,
        job_id: &str,
        version: u32,
    ) -> StoreResult<ApplicationPackage> {
        let package = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.query_row(
                "SELECT job_id, version, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at
                 FROM application_package_history
                 WHERE job_id = ?1 AND version = ?2",
                params![job_id, version],
                package_version_from_row,
            )?
        };
        self.save_application_package(
            job_id,
            &package.resume_title,
            &package.resume_body,
            &package.cover_letter_title,
            &package.cover_letter_body,
            &package.pdf_status,
        )?;
        self.application_package(job_id)?
            .ok_or_else(|| "package not found after restore".into())
    }

    pub fn package_history(&self) -> StoreResult<Vec<ApplicationPackageVersion>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT job_id, version, resume_title, resume_body, cover_letter_title, cover_letter_body, pdf_status, generated_at
             FROM application_package_history
             ORDER BY generated_at DESC, job_id ASC, version DESC",
        )?;
        let rows = stmt.query_map([], package_version_from_row)?;
        collect_rows(rows)
    }

    pub fn messages(&self) -> StoreResult<Vec<RecruiterMessage>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, provider, subject, sender, matched_job_id, message_type, timeline_action
             FROM recruiter_messages
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], message_from_row)?;
        collect_rows(rows)
    }

    pub fn link_recruiter_message(&self, id: &str) -> StoreResult<Job> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let message = conn
            .query_row(
                "SELECT id, provider, subject, sender, matched_job_id, message_type, timeline_action
                 FROM recruiter_messages
                 WHERE id = ?1",
                params![id],
                message_from_row,
            )
            .optional()?
            .ok_or("message not found")?;
        let job_id = message
            .matched_job_id
            .clone()
            .ok_or("message is not matched to a job")?;
        let mut job = conn
            .query_row(
                "SELECT id, title, employer, source, location, score, status, deadline, description,
                        tailored_resume, cover_letter, fit_explanation, timeline_json
                 FROM jobs
                 WHERE id = ?1",
                params![job_id],
                job_from_row,
            )
            .optional()?
            .ok_or("matched job not found")?;

        job.timeline.insert(
            0,
            event_with_category(
                &format!("تم ربط رسالة: {}", message.subject),
                "الآن",
                "gold",
                "Gmail",
            ),
        );
        conn.execute(
            "UPDATE jobs SET timeline_json = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![serde_json::to_string(&job.timeline)?, job.id],
        )?;
        Ok(job)
    }

    fn append_job_timeline_event(
        &self,
        job_id: &str,
        label: &str,
        tone: &str,
        category: &str,
    ) -> StoreResult<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        append_job_timeline_event(
            &conn,
            job_id,
            event_with_category(label, "now", tone, category),
        )
    }
}

fn bilingual_cv_summary(profile: &UserProfile, job: &Job) -> String {
    let skills = summary_value(&profile.resume_skills);
    let languages = summary_value(&profile.resume_languages);
    let seniority = summary_value(&profile.resume_seniority);
    let regions = summary_value(&profile.resume_regions);
    let examples = summary_value(&profile.resume_work_examples);

    format!(
        "ملخص مهني عربي\nمرشح بخبرة {} مناسب لوظيفة {} لدى {} في {}. نقاط القوة: {}. اللغات: {}. الأسواق المستهدفة: {}. أمثلة العمل: {}.\n\nEnglish CV Summary\n{} candidate for {} at {} in {}. Core strengths: {}. Languages: {}. Target regions: {}. Work examples: {}.",
        seniority.as_str(),
        job.title,
        job.employer,
        job.location,
        skills.as_str(),
        languages.as_str(),
        regions.as_str(),
        examples.as_str(),
        seniority.as_str(),
        job.title,
        job.employer,
        job.location,
        skills.as_str(),
        languages.as_str(),
        regions.as_str(),
        examples.as_str()
    )
}

fn export_ready_resume_body(
    profile: &UserProfile,
    job: &Job,
    cv_summary: &str,
    structured_profile: &str,
) -> String {
    let skills = summary_value(&profile.resume_skills);
    let languages = summary_value(&profile.resume_languages);
    let seniority = summary_value(&profile.resume_seniority);
    let regions = summary_value(&profile.resume_regions);
    let examples = summary_value(&profile.resume_work_examples);
    let fit = summary_value(&job.fit_explanation);

    format!(
        "{} | ملف السيرة: {}\n\nقسم السيرة: الملخص / CV Section: Summary\n{}\n\nقسم السيرة: المهارات / CV Section: Skills\n- {}\n- اللغات / Languages: {}\n- مستوى الخبرة / Seniority: {}\n- الأسواق المستهدفة / Target regions: {}\n\nقسم السيرة: دليل المطابقة / CV Section: Match Evidence\n- الوظيفة / Role: {} لدى {} في {}\n- خبرة مرتبطة / Relevant examples: {}\n- إشارات المطابقة / Fit signals: {}\n- {}\n\nقسم السيرة: خطة التخصيص / CV Section: Tailoring Plan\n- إبراز {} داخل الملخص والخبرة.\n- ربط الإنجازات باحتياج {} كما يظهر في الإعلان.\n- استخدام كلمات الإعلان: {}",
        profile.display_name,
        profile.resume_filename,
        cv_summary,
        skills,
        languages,
        seniority,
        regions,
        job.title,
        job.employer,
        job.location,
        examples,
        fit,
        structured_profile,
        profile.target_roles,
        job.employer,
        job.description
    )
}

fn export_ready_cover_letter_body(profile: &UserProfile, job: &Job, cv_summary: &str) -> String {
    let skills = summary_value(&profile.resume_skills);
    let examples = summary_value(&profile.resume_work_examples);

    format!(
        "قسم الخطاب: الافتتاح / Cover Letter Section: Opening\nمرحباً فريق {}، أود التقديم على وظيفة {} في {}.\n\nقسم الخطاب: قيمة المرشح / Cover Letter Section: Value Match\nخبرتي في {} ومهاراتي في {} مناسبة لما تحتاجونه. يمكنني دعم الفريق عبر فهم المنتج، التنفيذ السريع، وتحويل متطلبات الإعلان إلى نتائج قابلة للقياس.\n\nقسم الخطاب: دليل مختصر / Cover Letter Section: Proof\n{}\n\n{}\n\nقسم الخطاب: الإغلاق / Cover Letter Section: Close\nيسعدني مناقشة كيف يمكنني تحويل هذه الخبرة إلى أثر عملي لدى {}. هذه مسودة قابلة للتحرير قبل التصدير إلى PDF.",
        job.employer,
        job.title,
        job.location,
        profile.target_roles,
        skills,
        examples,
        cv_summary,
        job.employer
    )
}

fn summary_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "غير محدد / Not specified".into()
    } else {
        trimmed.to_string()
    }
}

pub fn infer_job_source_from_url(url: &str) -> String {
    let normalized = url.trim().to_lowercase();
    let mappings = [
        ("wuzzuf.", "wazzuf"),
        ("khamsat.", "fiveamsat"),
        ("5amsat.", "fiveamsat"),
        ("linkedin.", "linkedin"),
        ("indeed.", "indeed"),
        ("glassdoor.", "glassdoor"),
        ("adzuna.", "adzuna"),
        ("hiring.cafe", "hiringcafe"),
        ("hiringcafe.", "hiringcafe"),
        ("startup.jobs", "startupjobs"),
        ("workingnomads.", "workingnomads"),
        ("bayt.", "bayt"),
    ];

    mappings
        .iter()
        .find_map(|(needle, source)| normalized.contains(needle).then(|| (*source).to_string()))
        .unwrap_or_else(|| "manual".into())
}

#[derive(Debug, Default)]
struct ExtractedJobImportFields {
    title: Option<String>,
    employer: Option<String>,
    location: Option<String>,
    description: Option<String>,
}

fn extract_job_import_fields(url: &str, source: &str) -> ExtractedJobImportFields {
    let slug = job_slug_from_url(url);
    ExtractedJobImportFields {
        title: slug.as_deref().and_then(title_from_slug),
        employer: source_label(source),
        location: slug.as_deref().and_then(location_from_slug),
        description: slug
            .as_ref()
            .map(|slug| format!("Imported from {url}. Extracted slug: {slug}")),
    }
}

fn normalize_manual_job_import(input: ManualJobImportInput) -> StoreResult<ManualJobImportPreview> {
    let source = infer_job_source_from_url(&input.url);
    let url_extracted = extract_job_import_fields(&input.url, &source);
    let text_extracted = extract_job_import_fields_from_text(&input.description);
    let title = required_with_source(
        input.title,
        vec![
            (url_extracted.title, "url_slug"),
            (text_extracted.title, "pasted_label"),
        ],
        "job title",
    )?;
    let employer = required_with_source(
        input.employer,
        vec![
            (url_extracted.employer, "source_preset"),
            (text_extracted.employer, "pasted_label"),
        ],
        "employer",
    )?;
    let location = required_with_source(
        input.location,
        vec![
            (url_extracted.location, "url_slug"),
            (text_extracted.location, "pasted_label"),
        ],
        "location",
    )?;
    let mut description = required_with_source(
        input.description,
        vec![(url_extracted.description, "url_slug")],
        "description",
    )?;
    if description.source == "manual_input" && looks_like_pasted_job_text(&description.value) {
        description.source = "manual_text".into();
    }
    let field_sources = ImportFieldSources {
        title: title.source,
        employer: employer.source,
        location: location.source,
        description: description.source,
    };
    let extraction_quality = extraction_quality(&field_sources);
    let extraction_summary = extraction_summary(&field_sources, &extraction_quality);

    Ok(ManualJobImportPreview {
        url: input.url.trim().to_string(),
        title: title.value,
        employer: employer.value,
        source,
        location: location.value,
        description: description.value,
        fit_explanation: String::new(),
        extraction_quality,
        extraction_summary,
        field_sources,
    })
}

struct FitSummary {
    score: u8,
    explanation: String,
}

fn summarize_job_fit(job: &ManualJobImportPreview, profile: &UserProfile) -> FitSummary {
    let haystack = format!(
        "{} {} {} {}",
        job.title, job.employer, job.location, job.description
    )
    .to_lowercase();
    let role_keywords = matched_keywords(&profile.target_roles, &haystack);
    let location_keywords = matched_keywords(&profile.target_locations, &haystack);
    let resume_keywords = matched_resume_keywords(&profile.resume_filename, &haystack);
    let skill_keywords = matched_keywords(&profile.resume_skills, &haystack);
    let language_keywords = matched_keywords(&profile.resume_languages, &haystack);
    let seniority_keywords = matched_keywords(&profile.resume_seniority, &haystack);
    let region_keywords = matched_keywords(&profile.resume_regions, &haystack);
    let example_keywords = matched_keywords(&profile.resume_work_examples, &haystack);
    let role_matches = (role_keywords.len() as u8).min(3);
    let location_matches = (location_keywords.len() as u8).min(2);
    let resume_matches = (resume_keywords.len() as u8).min(3);
    let skill_matches = (skill_keywords.len() as u8).min(3);
    let language_matches = (language_keywords.len() as u8).min(2);
    let seniority_matches = (seniority_keywords.len() as u8).min(1);
    let region_matches = (region_keywords.len() as u8).min(2);
    let example_matches = (example_keywords.len() as u8).min(2);
    let source_boost = match job.source.as_str() {
        "wazzuf" | "bayt" | "fiveamsat" | "linkedin" | "indeed" => 4,
        _ => 0,
    };
    let score = 50
        + (role_matches * 8)
        + (location_matches * 8)
        + (resume_matches * 6)
        + (skill_matches * 8)
        + (language_matches * 4)
        + (seniority_matches * 5)
        + (region_matches * 4)
        + (example_matches * 3)
        + source_boost;
    FitSummary {
        score: score.min(96) as u8,
        explanation: fit_explanation(
            &role_keywords,
            &location_keywords,
            &resume_keywords,
            &skill_keywords,
            &language_keywords,
            &seniority_keywords,
            &region_keywords,
            &example_keywords,
            &job.source,
        ),
    }
}

fn matched_keywords(profile_text: &str, haystack: &str) -> Vec<String> {
    keywords_from_profile(profile_text)
        .into_iter()
        .filter(|keyword| haystack.contains(keyword.as_str()))
        .collect()
}

fn matched_resume_keywords(resume_filename: &str, haystack: &str) -> Vec<String> {
    keywords_from_resume_filename(resume_filename)
        .into_iter()
        .filter(|keyword| haystack.contains(keyword.as_str()))
        .collect()
}

fn fit_explanation(
    role_keywords: &[String],
    location_keywords: &[String],
    resume_keywords: &[String],
    skill_keywords: &[String],
    language_keywords: &[String],
    seniority_keywords: &[String],
    region_keywords: &[String],
    example_keywords: &[String],
    source: &str,
) -> String {
    let role_part = if role_keywords.is_empty() {
        "role signals: no direct keyword match".to_string()
    } else {
        format!("role signals: {}", display_keywords(role_keywords))
    };
    let location_part = if location_keywords.is_empty() {
        "location signals: no direct location match".to_string()
    } else {
        format!("location signals: {}", display_keywords(location_keywords))
    };
    let resume_part = if resume_keywords.is_empty() {
        "resume signals: no filename keyword match".to_string()
    } else {
        format!("resume signals: {}", display_keywords(resume_keywords))
    };
    let skill_part = signal_part("skill signals", skill_keywords);
    let language_part = signal_part("language signals", language_keywords);
    let seniority_part = signal_part("seniority signals", seniority_keywords);
    let region_part = signal_part("region signals", region_keywords);
    let example_part = signal_part("work example signals", example_keywords);
    let source_part = source_label(source)
        .map(|label| format!("source: {label}"))
        .unwrap_or_else(|| "source: manual import".to_string());
    format!("Matched {role_part}; {location_part}; {resume_part}; {skill_part}; {language_part}; {seniority_part}; {region_part}; {example_part}; {source_part}.")
}

fn signal_part(label: &str, keywords: &[String]) -> String {
    if keywords.is_empty() {
        format!("{label}: no direct keyword match")
    } else {
        format!("{label}: {}", display_keywords(keywords))
    }
}

fn display_keywords(keywords: &[String]) -> String {
    keywords
        .iter()
        .take(3)
        .map(|keyword| {
            let mut chars = keyword.chars();
            match chars.next() {
                Some(first) if first.is_ascii() => {
                    first.to_ascii_uppercase().to_string() + chars.as_str()
                }
                Some(first) => first.to_string() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn keywords_from_profile(value: &str) -> Vec<String> {
    value
        .split(|character: char| {
            character == ','
                || character == '/'
                || character == '|'
                || character == ';'
                || character == '\n'
                || character.is_whitespace()
        })
        .map(|part| part.trim().to_lowercase())
        .filter(|part| part.chars().count() >= 3)
        .fold(Vec::new(), |mut keywords, part| {
            if !keywords.contains(&part) {
                keywords.push(part);
            }
            keywords
        })
}

fn keywords_from_resume_filename(value: &str) -> Vec<String> {
    let stop_words = [
        "pdf",
        "doc",
        "docx",
        "resume",
        "cv",
        "curriculum",
        "vitae",
        "jaber",
        "profile",
        "final",
        "latest",
        "senior",
    ];
    value
        .split(|character: char| {
            character == ','
                || character == '/'
                || character == '\\'
                || character == '|'
                || character == ';'
                || character == '.'
                || character == '-'
                || character == '_'
                || character.is_whitespace()
        })
        .map(|part| part.trim().to_lowercase())
        .filter(|part| part.chars().count() >= 3 && !stop_words.contains(&part.as_str()))
        .fold(Vec::new(), |mut keywords, part| {
            if !keywords.contains(&part) {
                keywords.push(part);
            }
            keywords
        })
}

fn extract_job_import_fields_from_text(text: &str) -> ExtractedJobImportFields {
    let title_labels = [
        "title",
        "job title",
        "role",
        "المسمى",
        "المسمى الوظيفي",
        "الوظيفة",
    ];
    let employer_labels = ["company", "employer", "organization", "الشركة", "جهة العمل"];
    let location_labels = ["location", "city", "الموقع", "المدينة", "مكان العمل"];

    ExtractedJobImportFields {
        title: labeled_text_value(text, &title_labels).or_else(|| first_title_like_line(text)),
        employer: labeled_text_value(text, &employer_labels),
        location: labeled_text_value(text, &location_labels),
        description: non_empty_string(text),
    }
}

pub fn parse_resume_text(input: ResumeTextParseRequest) -> StoreResult<ResumeTextParsePreview> {
    let text = required_field(input.text, "resume text")?;
    let filename = optional_field(input.filename);
    let name_labels = ["name", "candidate", "الاسم"];
    let role_labels = [
        "role",
        "title",
        "target role",
        "headline",
        "المسمى",
        "الدور",
    ];
    let location_labels = ["location", "locations", "city", "الموقع", "المدينة"];
    let skill_labels = ["skills", "technologies", "tools", "المهارات"];
    let language_labels = ["languages", "language", "اللغات"];
    let seniority_labels = ["seniority", "level", "experience level", "مستوى الخبرة"];
    let region_labels = ["regions", "markets", "countries", "المناطق", "الأسواق"];
    let example_labels = [
        "examples",
        "experience",
        "projects",
        "achievements",
        "أمثلة",
        "الخبرات",
    ];

    let display_name = labeled_text_value(&text, &name_labels).unwrap_or_else(|| "جابر".into());
    let target_roles =
        labeled_text_value(&text, &role_labels).unwrap_or_else(|| "Product / Rust".into());
    let target_locations =
        labeled_text_value(&text, &location_labels).unwrap_or_else(|| "MENA".into());
    let resume_skills = labeled_text_value(&text, &skill_labels)
        .unwrap_or_else(|| display_keywords(&keywords_from_profile(&filename)));
    let resume_languages =
        labeled_text_value(&text, &language_labels).unwrap_or_else(|| "Arabic, English".into());
    let resume_seniority =
        labeled_text_value(&text, &seniority_labels).unwrap_or_else(|| "Mid-Senior".into());
    let resume_regions = labeled_text_value(&text, &region_labels).unwrap_or_else(|| "MENA".into());
    let resume_work_examples =
        labeled_text_value(&text, &example_labels).unwrap_or_else(|| first_resume_example(&text));

    Ok(ResumeTextParsePreview {
        display_name,
        preferred_language: "ar".into(),
        target_roles,
        target_locations,
        resume_filename: if filename.is_empty() {
            "resume.txt".into()
        } else {
            filename
        },
        resume_skills,
        resume_languages,
        resume_seniority,
        resume_regions,
        resume_work_examples,
        extraction_summary: "Parsed structured profile from resume text labels.".into(),
    })
}

fn first_resume_example(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|line| {
            line.chars().count() >= 24
                && !line.contains(':')
                && !line.contains('：')
                && !line.is_empty()
        })
        .unwrap_or("Resume text imported for profile scoring.")
        .to_string()
}

fn labeled_text_value(text: &str, labels: &[&str]) -> Option<String> {
    text.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        let (label, value) = trimmed
            .split_once(':')
            .or_else(|| trimmed.split_once('：'))
            .or_else(|| trimmed.split_once('؛'))?;
        let normalized_label = label.trim().to_lowercase();
        let matches_label = labels
            .iter()
            .any(|candidate| normalized_label == candidate.to_lowercase());
        matches_label
            .then(|| value.trim())
            .and_then(non_empty_string)
    })
}

fn first_title_like_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && !line.contains(':')
                && !line.contains('：')
                && !line.ends_with('.')
                && !line.ends_with('!')
                && !line.ends_with('?')
                && !line.ends_with('؟')
                && line.chars().count() <= 80
                && line.split_whitespace().count() <= 10
        })
        .and_then(non_empty_string)
}

fn looks_like_pasted_job_text(text: &str) -> bool {
    text.lines().filter(|line| !line.trim().is_empty()).count() >= 3
        || text.contains("Title:")
        || text.contains("Company:")
        || text.contains("Location:")
}

fn job_slug_from_url(url: &str) -> Option<String> {
    url.trim()
        .trim_end_matches('/')
        .split('/')
        .rev()
        .find(|segment| {
            let segment = segment.trim();
            !segment.is_empty()
                && !segment.chars().all(|character| character.is_ascii_digit())
                && segment.contains('-')
        })
        .map(|segment| segment.to_lowercase())
}

fn title_from_slug(slug: &str) -> Option<String> {
    let stop_words = [
        "riyadh", "jeddah", "dubai", "cairo", "saudi", "arabia", "uae", "egypt", "remote",
    ];
    let words: Vec<&str> = slug
        .split('-')
        .filter(|word| !word.is_empty() && !word.chars().all(|ch| ch.is_ascii_digit()))
        .collect();
    let mut end = words.len();
    while end > 0 && stop_words.contains(&words[end - 1]) {
        end -= 1;
    }
    if end == 0 {
        return None;
    }
    Some(
        words[..end]
            .iter()
            .map(|word| capitalize_ascii_word(word))
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn location_from_slug(slug: &str) -> Option<String> {
    let normalized = slug.to_lowercase();
    if normalized.contains("riyadh") {
        Some("Riyadh, Saudi Arabia".into())
    } else if normalized.contains("jeddah") {
        Some("Jeddah, Saudi Arabia".into())
    } else if normalized.contains("dubai") {
        Some("Dubai, UAE".into())
    } else if normalized.contains("cairo") {
        Some("Cairo, Egypt".into())
    } else if normalized.contains("remote") {
        Some("Remote".into())
    } else {
        None
    }
}

fn source_label(source: &str) -> Option<String> {
    match source {
        "wazzuf" => Some("WUZZUF".into()),
        "bayt" => Some("Bayt".into()),
        "fiveamsat" => Some("Khamsat".into()),
        "linkedin" => Some("LinkedIn".into()),
        "indeed" => Some("Indeed".into()),
        "glassdoor" => Some("Glassdoor".into()),
        "adzuna" => Some("Adzuna".into()),
        "hiringcafe" => Some("Hiring Cafe".into()),
        "startupjobs" => Some("startup.jobs".into()),
        "workingnomads" => Some("Working Nomads".into()),
        _ => None,
    }
}

fn capitalize_ascii_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn optional_field(value: String) -> String {
    value.trim().to_string()
}

fn required_field(value: String, label: &str) -> StoreResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is required").into());
    }
    Ok(trimmed.to_string())
}

struct FieldValueSource {
    value: String,
    source: String,
}

fn required_with_source(
    value: String,
    fallbacks: Vec<(Option<String>, &'static str)>,
    label: &str,
) -> StoreResult<FieldValueSource> {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        return Ok(FieldValueSource {
            value: trimmed.to_string(),
            source: "manual_input".into(),
        });
    }
    for (fallback, source) in fallbacks {
        if let Some(value) = fallback.and_then(|candidate| non_empty_string(&candidate)) {
            return Ok(FieldValueSource {
                value,
                source: source.into(),
            });
        }
    }
    required_field(String::new(), label).map(|value| FieldValueSource {
        value,
        source: "missing".into(),
    })
}

fn extraction_quality(field_sources: &ImportFieldSources) -> String {
    let sources = [
        field_sources.title.as_str(),
        field_sources.employer.as_str(),
        field_sources.location.as_str(),
        field_sources.description.as_str(),
    ];
    let inferred = sources
        .iter()
        .filter(|source| **source != "manual_input")
        .count();
    if inferred >= 3 {
        "high".into()
    } else if inferred >= 1 {
        "medium".into()
    } else {
        "manual".into()
    }
}

fn extraction_summary(field_sources: &ImportFieldSources, quality: &str) -> String {
    let sources = [
        field_sources.title.as_str(),
        field_sources.employer.as_str(),
        field_sources.location.as_str(),
        field_sources.description.as_str(),
    ];
    if sources.contains(&"pasted_label") {
        format!("{quality} confidence: fields extracted from pasted labels and manual text.")
    } else if sources.contains(&"url_slug") {
        format!("{quality} confidence: fields extracted from URL slug and source preset.")
    } else {
        format!("{quality} confidence: fields supplied from manual input.")
    }
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> StoreResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut exists = false;
    for row in rows {
        if row? == column {
            exists = true;
            break;
        }
    }
    if !exists {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_millis()
}

fn collect_rows<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> StoreResult<Vec<T>> {
    let mut values = Vec::new();
    for row in rows {
        values.push(row?);
    }
    Ok(values)
}

fn render_package_body_sections(body: &str) -> String {
    let sections: Vec<String> = body
        .split("\n\n")
        .filter_map(|block| {
            let lines: Vec<&str> = block
                .lines()
                .filter(|line| !line.trim().is_empty())
                .collect();
            if lines.is_empty() {
                return None;
            }
            let heading = html_escape(lines[0].trim());
            let mut paragraphs = Vec::new();
            let mut bullets = Vec::new();

            for line in lines.iter().skip(1) {
                let trimmed = line.trim();
                if let Some(item) = trimmed.strip_prefix("- ") {
                    bullets.push(format!("<li>{}</li>", html_escape(item.trim())));
                } else {
                    paragraphs.push(format!("<p>{}</p>", html_escape(trimmed)));
                }
            }

            let list = if bullets.is_empty() {
                String::new()
            } else {
                format!("<ul>{}</ul>", bullets.join(""))
            };

            Some(format!(
                r#"<section class="doc-section"><h3>{heading}</h3>{}{list}</section>"#,
                paragraphs.join("")
            ))
        })
        .collect();

    if sections.is_empty() {
        format!(r#"<div class="body">{}</div>"#, html_escape(body))
    } else {
        sections.join("")
    }
}

fn render_package_preview_html(job: &Job, package: &ApplicationPackage) -> String {
    let title = html_escape(&format!("معاينة PDF - {}", job.title));
    let job_title = html_escape(&job.title);
    let employer = html_escape(&job.employer);
    let location = html_escape(&job.location);
    let resume_title = html_escape(&package.resume_title);
    let resume_body = render_package_body_sections(&package.resume_body);
    let cover_letter_title = html_escape(&package.cover_letter_title);
    let cover_letter_body = render_package_body_sections(&package.cover_letter_body);
    let pdf_status = html_escape(&package.pdf_status);
    let generated_at = html_escape(&package.generated_at);

    format!(
        r#"<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    :root {{ color-scheme: light; --ink:#17211f; --muted:#66736f; --line:#dbe8e4; --accent:#0f766e; }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; background:#eef7f4; color:var(--ink); font-family: Arial, "Segoe UI", Tahoma, sans-serif; line-height:1.8; }}
    .toolbar {{ position:sticky; top:0; display:flex; gap:10px; justify-content:space-between; align-items:center; padding:14px 18px; background:rgba(238,247,244,.94); border-bottom:1px solid var(--line); }}
    .toolbar a, .toolbar button {{ border:1px solid var(--line); border-radius:8px; background:white; color:var(--ink); padding:9px 12px; text-decoration:none; font:inherit; cursor:pointer; }}
    .toolbar button {{ background:var(--accent); color:white; border-color:var(--accent); }}
    main {{ width:min(820px, 100%); margin:0 auto; padding:22px 16px 42px; }}
    .sheet {{ background:white; border:1px solid var(--line); border-radius:8px; padding:28px; box-shadow:0 18px 50px rgba(23,33,31,.08); }}
    h1, h2 {{ margin:0; line-height:1.35; }}
    h1 {{ font-size:28px; }}
    h2 {{ font-size:20px; margin-top:28px; border-top:1px solid var(--line); padding-top:20px; }}
    h3 {{ margin:0 0 8px; font-size:16px; line-height:1.45; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); margin-top:8px; }}
    .chip {{ border:1px solid var(--line); border-radius:999px; padding:3px 10px; }}
    .body {{ white-space:pre-wrap; margin-top:12px; }}
    .doc-section {{ break-inside:avoid; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }}
    .doc-section p {{ margin:0 0 8px; }}
    .doc-section ul {{ margin:0; padding-inline-start:22px; }}
    .doc-section li {{ margin:5px 0; }}
    @media print {{
      body {{ background:white; }}
      .toolbar {{ display:none; }}
      main {{ padding:0; }}
      .sheet {{ border:0; box-shadow:none; border-radius:0; }}
    }}
  </style>
</head>
<body>
  <div class="toolbar">
    <a href="/documents">العودة للمستندات</a>
    <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
  <main>
    <article class="sheet">
      <h1>معاينة PDF</h1>
      <div class="meta">
        <span class="chip">{job_title}</span>
        <span class="chip">{employer}</span>
        <span class="chip">{location}</span>
        <span class="chip">{pdf_status}</span>
      </div>
      <section>
        <h2>{resume_title}</h2>
        <div class="body">{resume_body}</div>
      </section>
      <section>
        <h2>{cover_letter_title}</h2>
        <div class="body">{cover_letter_body}</div>
      </section>
      <p class="meta">آخر توليد: {generated_at}</p>
    </article>
  </main>
</body>
</html>"#
    )
}

fn render_package_pdf_bytes(job: &Job, package: &ApplicationPackage) -> Vec<u8> {
    let engine = TypstEngine::builder()
        .main_file(include_str!("../assets/templates/application-package.typ"))
        .fonts([
            include_bytes!("../assets/fonts/IBMPlexSansArabic-Regular.ttf").as_slice(),
            include_bytes!("../assets/fonts/IBMPlexSansArabic-SemiBold.ttf").as_slice(),
        ])
        .build();
    let document = engine
        .compile_with_input(package_typst_input(job, package))
        .output
        .unwrap_or_else(|diagnostics| {
            panic!("static application package template should compile: {diagnostics:?}")
        });
    typst_pdf::pdf(&document, &Default::default())
        .expect("compiled application package should export to PDF")
}

fn package_typst_input(job: &Job, package: &ApplicationPackage) -> Dict {
    let mut input = Dict::new();
    input.insert("job_title".into(), job.title.clone().into_value());
    input.insert("employer".into(), job.employer.clone().into_value());
    input.insert("location".into(), job.location.clone().into_value());
    input.insert("pdf_status".into(), package.pdf_status.clone().into_value());
    input.insert(
        "resume_title".into(),
        package.resume_title.clone().into_value(),
    );
    input.insert(
        "resume_sections".into(),
        package_section_inputs(&package.resume_body).into_value(),
    );
    input.insert(
        "cover_letter_title".into(),
        package.cover_letter_title.clone().into_value(),
    );
    input.insert(
        "cover_letter_sections".into(),
        package_section_inputs(&package.cover_letter_body).into_value(),
    );
    input.insert(
        "generated_at".into(),
        package.generated_at.clone().into_value(),
    );
    input
}

fn package_section_inputs(body: &str) -> Vec<Dict> {
    body.split("\n\n")
        .filter_map(|block| {
            let mut lines = block.lines().filter(|line| !line.trim().is_empty());
            let heading = lines.next()?.trim().to_string();
            let mut paragraphs = Vec::new();
            let mut bullets = Vec::new();
            for line in lines {
                let line = line.trim();
                if let Some(item) = line.strip_prefix("- ") {
                    bullets.push(item.trim().to_string());
                } else {
                    paragraphs.push(line.to_string());
                }
            }
            let mut section = Dict::new();
            section.insert("heading".into(), heading.into_value());
            section.insert("paragraphs".into(), paragraphs.into_value());
            section.insert("bullets".into(), bullets.into_value());
            Some(section)
        })
        .collect()
}

#[cfg(test)]
fn render_package_pdf_html(job: &Job, package: &ApplicationPackage) -> String {
    let resume_body = render_package_body_sections(&package.resume_body);
    let cover_letter_body = render_package_body_sections(&package.cover_letter_body);
    format!(
        r#"<html lang="ar" dir="rtl">
<head><style>
body {{ font-family:"IBM Plex Sans Arabic"; direction:rtl; text-align:right; color:#17211f; font-size:10pt; line-height:1.55; }}
h1 {{ color:#0f766e; font-size:19pt; margin:0 0 3mm; }}
h2 {{ color:#17211f; font-size:14pt; margin:7mm 0 3mm; border-top:1px solid #dbe8e4; padding-top:4mm; }}
h3 {{ color:#0f766e; font-size:11pt; margin:4mm 0 1.5mm; }}
p {{ margin:0 0 2mm; }}
ul {{ margin:0 0 2mm; padding-right:6mm; }}
li {{ margin:0 0 1mm; }}
.meta {{ color:#66736f; font-size:9pt; margin-bottom:5mm; }}
.doc-section {{ break-inside:avoid; }}
</style></head>
<body>
<h1>JOBS.wasfai.com</h1>
<p class="meta">{} - {} | {} | {}</p>
<h2>{}</h2>
{}
<h2>{}</h2>
{}
<p class="meta">Generated: {}</p>
</body></html>"#,
        html_escape(&job.title),
        html_escape(&job.employer),
        html_escape(&job.location),
        html_escape(&package.pdf_status),
        html_escape(&package.resume_title),
        resume_body,
        html_escape(&package.cover_letter_title),
        cover_letter_body,
        html_escape(&package.generated_at),
    )
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn safe_filename(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn job_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Job> {
    let status: String = row.get(6)?;
    let timeline_json: String = row.get(12)?;
    let timeline = serde_json::from_str(&timeline_json).unwrap_or_default();

    Ok(Job {
        id: row.get(0)?,
        title: row.get(1)?,
        employer: row.get(2)?,
        source: row.get(3)?,
        location: row.get(4)?,
        score: row.get::<_, i64>(5)? as u8,
        status: job_status_from_str(&status),
        deadline: row.get(7)?,
        description: row.get(8)?,
        tailored_resume: row.get(9)?,
        cover_letter: row.get(10)?,
        fit_explanation: row.get(11)?,
        timeline,
    })
}

fn package_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ApplicationPackage> {
    Ok(ApplicationPackage {
        job_id: row.get(0)?,
        resume_title: row.get(1)?,
        resume_body: row.get(2)?,
        cover_letter_title: row.get(3)?,
        cover_letter_body: row.get(4)?,
        pdf_status: row.get(5)?,
        generated_at: row.get(6)?,
    })
}

fn package_version_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ApplicationPackageVersion> {
    Ok(ApplicationPackageVersion {
        job_id: row.get(0)?,
        version: row.get::<_, i64>(1)? as u32,
        resume_title: row.get(2)?,
        resume_body: row.get(3)?,
        cover_letter_title: row.get(4)?,
        cover_letter_body: row.get(5)?,
        pdf_status: row.get(6)?,
        generated_at: row.get(7)?,
    })
}

fn draft_version_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AssistantDraftVersion> {
    Ok(AssistantDraftVersion {
        job_id: row.get(0)?,
        version: row.get::<_, i64>(1)? as u32,
        content: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RecruiterMessage> {
    Ok(RecruiterMessage {
        id: row.get(0)?,
        provider: row.get(1)?,
        subject: row.get(2)?,
        sender: row.get(3)?,
        matched_job_id: row.get(4)?,
        message_type: row.get(5)?,
        timeline_action: row.get(6)?,
    })
}

fn profile_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserProfile> {
    Ok(UserProfile {
        id: row.get(0)?,
        display_name: row.get(1)?,
        preferred_language: row.get(2)?,
        target_roles: row.get(3)?,
        target_locations: row.get(4)?,
        resume_filename: row.get(5)?,
        resume_skills: row.get(6)?,
        resume_languages: row.get(7)?,
        resume_seniority: row.get(8)?,
        resume_regions: row.get(9)?,
        resume_work_examples: row.get(10)?,
    })
}

fn job_status_to_str(status: &JobStatus) -> &'static str {
    match status {
        JobStatus::Discovered => "discovered",
        JobStatus::Processing => "processing",
        JobStatus::Ready => "ready",
        JobStatus::Applied => "applied",
        JobStatus::InProgress => "in_progress",
        JobStatus::Expired => "expired",
        JobStatus::Skipped => "skipped",
    }
}

fn job_status_label_ar(status: &JobStatus) -> &'static str {
    match status {
        JobStatus::Discovered => "مكتشفة",
        JobStatus::Processing => "قيد المعالجة",
        JobStatus::Ready => "جاهزة",
        JobStatus::Applied => "تم التقديم",
        JobStatus::InProgress => "قيد المتابعة",
        JobStatus::Expired => "منتهية",
        JobStatus::Skipped => "متجاوزة",
    }
}

fn job_status_from_str(status: &str) -> JobStatus {
    match status {
        "processing" => JobStatus::Processing,
        "ready" => JobStatus::Ready,
        "applied" => JobStatus::Applied,
        "in_progress" => JobStatus::InProgress,
        "expired" => JobStatus::Expired,
        "skipped" => JobStatus::Skipped,
        _ => JobStatus::Discovered,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_job_source_from_mena_board_urls() {
        assert_eq!(
            infer_job_source_from_url("https://wuzzuf.net/jobs/p/rust-backend-engineer-riyadh"),
            "wazzuf"
        );
        assert_eq!(
            infer_job_source_from_url(
                "https://www.bayt.com/en/saudi-arabia/jobs/senior-rust-engineer-12345/"
            ),
            "bayt"
        );
        assert_eq!(
            infer_job_source_from_url("https://khamsat.com/programming/rust-api"),
            "fiveamsat"
        );
        assert_eq!(
            infer_job_source_from_url("https://www.linkedin.com/jobs/view/123"),
            "linkedin"
        );
        assert_eq!(
            infer_job_source_from_url("https://example.com/jobs/42"),
            "manual"
        );
    }

    #[test]
    fn persistent_store_imports_manual_job_with_normalized_contract() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://wuzzuf.net/jobs/p/rust-backend-engineer-riyadh".into(),
                title: "Imported Rust Engineer".into(),
                employer: "Test Company".into(),
                location: "Riyadh, Saudi Arabia".into(),
                description: "Build Rust APIs for a MENA product team.".into(),
            })
            .expect("import job");

        assert!(imported.id.starts_with("manual-"));
        assert_eq!(imported.source, "wazzuf");
        assert_eq!(imported.status, JobStatus::Discovered);
        assert!(imported.score > 72);
        assert!(imported
            .timeline
            .iter()
            .any(|event| event.label.contains("manual import")));

        let persisted = store
            .job(&imported.id)
            .expect("load imported job")
            .expect("imported job exists");
        assert_eq!(persisted.title, "Imported Rust Engineer");
        assert_eq!(persisted.source, "wazzuf");
    }

    #[test]
    fn persistent_store_records_import_extraction_audit_in_timeline() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://www.bayt.com/en/saudi-arabia/jobs/senior-rust-engineer-riyadh-12345/"
                    .into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: "".into(),
            })
            .expect("import from url");

        assert!(imported
            .timeline
            .iter()
            .any(|event| event.label.contains("URL slug")));

        let persisted = store
            .job(&imported.id)
            .expect("load imported job")
            .expect("imported job exists");
        assert!(persisted
            .timeline
            .iter()
            .any(|event| event.label.contains("URL slug")));
    }

    #[test]
    fn persistent_store_extracts_missing_job_fields_from_mena_url() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://www.bayt.com/en/saudi-arabia/jobs/senior-rust-engineer-riyadh-12345/"
                    .into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: "".into(),
            })
            .expect("import from url");

        assert_eq!(imported.source, "bayt");
        assert_eq!(imported.title, "Senior Rust Engineer");
        assert_eq!(imported.employer, "Bayt");
        assert_eq!(imported.location, "Riyadh, Saudi Arabia");
        assert!(imported.description.contains("senior-rust-engineer-riyadh"));
    }

    #[test]
    fn persistent_store_scores_imported_jobs_against_saved_profile() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Product Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend, product operations".into(),
                target_locations: "Riyadh, Dubai".into(),
                resume_filename: "jaber-rust-cv.pdf".into(),
                resume_skills: String::new(),
                resume_languages: String::new(),
                resume_seniority: String::new(),
                resume_regions: String::new(),
                resume_work_examples: String::new(),
            })
            .expect("save profile");

        let matching = store
            .import_manual_job(ManualJobImportInput {
                url: "https://wuzzuf.net/jobs/p/senior-rust-backend-engineer-riyadh".into(),
                title: "Senior Rust Backend Engineer".into(),
                employer: "MENA Platform".into(),
                location: "Riyadh, Saudi Arabia".into(),
                description: "Build Rust APIs for product operations workflows.".into(),
            })
            .expect("import matching job");

        std::thread::sleep(std::time::Duration::from_millis(1));

        let unrelated = store
            .import_manual_job(ManualJobImportInput {
                url: "https://example.com/jobs/visual-designer-berlin".into(),
                title: "Visual Designer".into(),
                employer: "Brand Studio".into(),
                location: "Berlin, Germany".into(),
                description: "Create campaign artwork and brand systems.".into(),
            })
            .expect("import unrelated job");

        assert!(
            matching.score >= 90,
            "matching score was {}",
            matching.score
        );
        assert!(
            unrelated.score <= 70,
            "unrelated score was {}",
            unrelated.score
        );
        assert!(matching.score > unrelated.score);
    }

    #[test]
    fn persistent_store_explains_imported_job_fit_against_profile() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Product Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend".into(),
                target_locations: "Riyadh".into(),
                resume_filename: "jaber-rust-cv.pdf".into(),
                resume_skills: String::new(),
                resume_languages: String::new(),
                resume_seniority: String::new(),
                resume_regions: String::new(),
                resume_work_examples: String::new(),
            })
            .expect("save profile");

        let input = ManualJobImportInput {
            url: "https://wuzzuf.net/jobs/p/senior-rust-backend-engineer-riyadh".into(),
            title: "Senior Rust Backend Engineer".into(),
            employer: "MENA Platform".into(),
            location: "Riyadh, Saudi Arabia".into(),
            description: "Build Rust APIs for regional teams.".into(),
        };
        let preview = store
            .preview_manual_job_import(input.clone())
            .expect("preview import");

        assert!(preview.fit_explanation.contains("Rust"));
        assert!(preview.fit_explanation.contains("Riyadh"));
        assert!(preview.fit_explanation.contains("WUZZUF"));

        let imported = store.import_manual_job(input).expect("import job");
        assert_eq!(imported.fit_explanation, preview.fit_explanation);
    }

    #[test]
    fn imported_job_fit_uses_resume_filename_keywords_as_profile_signals() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Data Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Customer success".into(),
                target_locations: "Cairo".into(),
                resume_filename: "senior-python-data-analytics-cv.pdf".into(),
                resume_skills: "Python, SQL, dashboards".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "Egypt, MENA".into(),
                resume_work_examples: "Built product analytics dashboards.".into(),
            })
            .expect("save profile");

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://www.bayt.com/en/egypt/jobs/python-data-analyst-cairo-12345/".into(),
                title: "Python Data Analyst".into(),
                employer: "MENA Insights".into(),
                location: "Cairo, Egypt".into(),
                description: "Build Python analytics pipelines and product dashboards.".into(),
            })
            .expect("import job");

        assert!(
            imported.score >= 90,
            "resume-derived match score was {}",
            imported.score
        );
        assert!(imported.fit_explanation.contains("resume signals"));
        assert!(imported.fit_explanation.contains("Python"));
        assert!(imported.fit_explanation.contains("Data"));
        assert!(imported.fit_explanation.contains("Analytics"));
    }

    #[test]
    fn manual_import_preview_reports_extraction_quality_for_url_slug() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let preview = store
            .preview_manual_job_import(ManualJobImportInput {
                url: "https://www.bayt.com/en/saudi-arabia/jobs/senior-rust-engineer-riyadh-12345/"
                    .into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: "".into(),
            })
            .expect("preview import");

        assert_eq!(preview.extraction_quality, "high");
        assert!(preview.extraction_summary.contains("URL slug"));
        assert_eq!(preview.field_sources.title, "url_slug");
        assert_eq!(preview.field_sources.employer, "source_preset");
        assert_eq!(preview.field_sources.location, "url_slug");
        assert_eq!(preview.field_sources.description, "url_slug");
    }

    #[test]
    fn manual_import_preview_reports_extraction_quality_for_pasted_labels() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let preview = store
            .preview_manual_job_import(ManualJobImportInput {
                url: "".into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: r#"Title: Senior Rust Backend Engineer
Company: Noon
Location: Riyadh, Saudi Arabia

Description:
Build Rust APIs."#
                    .into(),
            })
            .expect("preview import");

        assert_eq!(preview.extraction_quality, "high");
        assert!(preview.extraction_summary.contains("pasted labels"));
        assert_eq!(preview.field_sources.title, "pasted_label");
        assert_eq!(preview.field_sources.employer, "pasted_label");
        assert_eq!(preview.field_sources.location, "pasted_label");
        assert_eq!(preview.field_sources.description, "manual_text");
    }

    #[test]
    fn persistent_store_extracts_missing_job_fields_from_pasted_job_text() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let pasted_post = r#"Title: Senior Rust Backend Engineer
Company: Noon
Location: Riyadh, Saudi Arabia

Description:
Build Rust APIs for a MENA marketplace platform and collaborate with product teams."#;

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "".into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: pasted_post.into(),
            })
            .expect("import from pasted job text");

        assert_eq!(imported.source, "manual");
        assert_eq!(imported.title, "Senior Rust Backend Engineer");
        assert_eq!(imported.employer, "Noon");
        assert_eq!(imported.location, "Riyadh, Saudi Arabia");
        assert!(imported.description.contains("Build Rust APIs"));
    }

    #[test]
    fn persistent_store_previews_manual_import_without_creating_job() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        let initial_count = store.bootstrap().expect("bootstrap").jobs.len();

        let preview = store
            .preview_manual_job_import(ManualJobImportInput {
                url: "".into(),
                title: "".into(),
                employer: "".into(),
                location: "".into(),
                description: r#"Title: Senior Rust Backend Engineer
Company: Noon
Location: Riyadh, Saudi Arabia

Description:
Build Rust APIs for a MENA marketplace platform."#
                    .into(),
            })
            .expect("preview import");

        assert_eq!(preview.source, "manual");
        assert_eq!(preview.title, "Senior Rust Backend Engineer");
        assert_eq!(preview.employer, "Noon");
        assert_eq!(preview.location, "Riyadh, Saudi Arabia");
        assert!(preview.description.contains("Build Rust APIs"));
        assert_eq!(
            store
                .bootstrap()
                .expect("bootstrap after preview")
                .jobs
                .len(),
            initial_count
        );
    }

    #[test]
    fn persistent_store_keeps_unlabeled_prose_from_becoming_job_title() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let result = store.import_manual_job(ManualJobImportInput {
            url: "https://example.com/".into(),
            title: "".into(),
            employer: "Test Company".into(),
            location: "Riyadh, Saudi Arabia".into(),
            description: "Missing title should show feedback.".into(),
        });

        assert_eq!(
            result
                .expect_err("missing title should remain invalid")
                .to_string(),
            "job title is required"
        );
    }

    #[test]
    fn persistent_store_updates_job_details() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let updated = store
            .update_job_details(
                "job-3",
                UpdateJobDetailsRequest {
                    title: "Edited Product Growth Lead".into(),
                    employer: "Edited Halan".into(),
                    location: "Cairo or remote".into(),
                    description: "Own growth experiments and application priorities.".into(),
                },
            )
            .expect("update job");

        assert_eq!(updated.title, "Edited Product Growth Lead");
        assert_eq!(updated.employer, "Edited Halan");
        assert_eq!(updated.location, "Cairo or remote");
        assert_eq!(
            updated.description,
            "Own growth experiments and application priorities."
        );

        let persisted = store.job("job-3").expect("load job").expect("job exists");
        assert_eq!(persisted.title, "Edited Product Growth Lead");
    }

    #[test]
    fn persistent_store_deletes_jobs_and_dependent_rows() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_assistant_draft("job-2", "Draft before delete")
            .expect("save draft");
        store
            .save_application_package(
                "job-2",
                "Resume",
                "Resume body",
                "Letter",
                "Letter body",
                "PDF ready",
            )
            .expect("save package");

        store.delete_job("job-2").expect("delete job");

        assert!(store.job("job-2").expect("load deleted job").is_none());
        assert!(store
            .assistant_draft("job-2")
            .expect("load deleted draft")
            .is_none());
        assert!(store
            .application_package("job-2")
            .expect("load deleted package")
            .is_none());
    }

    #[test]
    fn persistent_store_saves_onboarding_profile() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let profile = store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Product Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend, Product operations".into(),
                target_locations: "Riyadh, Dubai, Cairo".into(),
                resume_filename: "jaber-rust-cv.pdf".into(),
                resume_skills: String::new(),
                resume_languages: String::new(),
                resume_seniority: String::new(),
                resume_regions: String::new(),
                resume_work_examples: String::new(),
            })
            .expect("save profile");

        assert_eq!(profile.display_name, "Jaber Product Builder");
        assert_eq!(profile.target_roles, "Rust backend, Product operations");
        assert_eq!(profile.target_locations, "Riyadh, Dubai, Cairo");
        assert_eq!(profile.resume_filename, "jaber-rust-cv.pdf");

        let bootstrap = store.bootstrap().expect("load bootstrap");
        assert_eq!(bootstrap.profile.display_name, "Jaber Product Builder");
    }

    #[test]
    fn persistent_store_saves_structured_resume_profile_fields() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let profile = store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Data Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Product analytics".into(),
                target_locations: "Riyadh, Cairo".into(),
                resume_filename: "jaber-analytics-cv.pdf".into(),
                resume_skills: "Python, SQL, dashboards, Rust".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "MENA, Saudi Arabia, Egypt".into(),
                resume_work_examples:
                    "Built product analytics dashboards and backend scoring services.".into(),
            })
            .expect("save structured profile");

        assert_eq!(profile.resume_skills, "Python, SQL, dashboards, Rust");
        assert_eq!(profile.resume_languages, "Arabic, English");
        assert_eq!(profile.resume_seniority, "Senior");
        assert!(profile.resume_work_examples.contains("dashboards"));

        let bootstrap = store.bootstrap().expect("load bootstrap");
        assert_eq!(
            bootstrap.profile.resume_regions,
            "MENA, Saudi Arabia, Egypt"
        );
    }

    #[test]
    fn resume_text_preview_extracts_structured_profile_fields() {
        let preview = parse_resume_text(ResumeTextParseRequest {
            filename: "jaber-product-analytics-cv.pdf".into(),
            text: r#"Name: Jaber Analytics Builder
Role: Product Analytics Lead
Location: Riyadh, Cairo
Skills: Python, SQL, dashboards, Rust
Languages: Arabic, English
Seniority: Senior
Regions: Saudi Arabia, Egypt, MENA
Examples: Built Arabic analytics dashboards and backend scoring workflows."#
                .into(),
        })
        .expect("parse resume");

        assert_eq!(preview.display_name, "Jaber Analytics Builder");
        assert_eq!(preview.target_roles, "Product Analytics Lead");
        assert_eq!(preview.target_locations, "Riyadh, Cairo");
        assert_eq!(preview.resume_filename, "jaber-product-analytics-cv.pdf");
        assert_eq!(preview.resume_skills, "Python, SQL, dashboards, Rust");
        assert_eq!(preview.resume_languages, "Arabic, English");
        assert_eq!(preview.resume_seniority, "Senior");
        assert_eq!(preview.resume_regions, "Saudi Arabia, Egypt, MENA");
        assert!(preview.resume_work_examples.contains("backend scoring"));
        assert!(preview.extraction_summary.contains("resume text"));
    }

    #[test]
    fn imported_job_fit_uses_structured_resume_profile_signals() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Analytics Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Operations".into(),
                target_locations: "Dubai".into(),
                resume_filename: "jaber-cv.pdf".into(),
                resume_skills: "Python, SQL, dashboards".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "Saudi Arabia, Egypt".into(),
                resume_work_examples: "Built product analytics dashboards for MENA operations."
                    .into(),
            })
            .expect("save structured profile");

        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://www.bayt.com/en/saudi-arabia/jobs/senior-python-data-analyst-riyadh-12345/"
                    .into(),
                title: "Senior Python Data Analyst".into(),
                employer: "MENA Insights".into(),
                location: "Riyadh, Saudi Arabia".into(),
                description: "Use Python, SQL, Arabic dashboards, and MENA product analytics examples.".into(),
            })
            .expect("import job");

        assert!(
            imported.score >= 90,
            "structured score was {}",
            imported.score
        );
        assert!(imported.fit_explanation.contains("skill signals"));
        assert!(imported.fit_explanation.contains("Python"));
        assert!(imported.fit_explanation.contains("language signals"));
        assert!(imported.fit_explanation.contains("Arabic"));
        assert!(imported.fit_explanation.contains("seniority signals"));
        assert!(imported.fit_explanation.contains("region signals"));
    }

    #[test]
    fn status_counts_include_pipeline_statuses_from_plan() {
        let counts = status_counts(&seed_jobs());

        assert!(counts.contains(&(JobStatus::Discovered, 1)));
        assert!(counts.contains(&(JobStatus::Ready, 2)));
        assert!(counts.contains(&(JobStatus::Applied, 1)));
        assert!(counts.contains(&(JobStatus::Expired, 1)));
    }

    #[test]
    fn source_summaries_include_import_preset_metadata() {
        let sources = seed_sources();
        let bayt = sources
            .iter()
            .find(|source| source.id == "bayt")
            .expect("Bayt source exists");
        let wazzuf = sources
            .iter()
            .find(|source| source.id == "wazzuf")
            .expect("WUZZUF source exists");
        let khamsat = sources
            .iter()
            .find(|source| source.id == "fiveamsat")
            .expect("Khamsat source exists");
        let linkedin = sources
            .iter()
            .find(|source| source.id == "linkedin")
            .expect("LinkedIn source exists");

        assert_eq!(bayt.import_url_template, "https://www.bayt.com/en/jobs/");
        assert!(bayt.import_hint.contains("Bayt"));
        assert_eq!(wazzuf.import_url_template, "https://wuzzuf.net/jobs/");
        assert!(wazzuf.import_hint.contains("WUZZUF"));
        assert_eq!(khamsat.import_url_template, "https://khamsat.com/");
        assert!(khamsat.import_hint.contains("Khamsat"));
        assert_eq!(
            linkedin.import_url_template,
            "https://www.linkedin.com/jobs/"
        );
    }

    #[test]
    fn arabic_search_filters_by_role_location_and_source() {
        let jobs = seed_jobs();

        let filtered = filter_jobs(&jobs, "الرياض", Some("wazzuf"));

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].source, "wazzuf");
        assert!(filtered[0].location.contains("الرياض"));
    }

    #[test]
    fn recruiter_messages_route_to_matched_job_timeline() {
        let messages = seed_messages();
        let interview = messages
            .iter()
            .find(|message| message.message_type == "interview")
            .expect("seed should include interview message");

        assert_eq!(interview.provider, "gmail");
        assert_eq!(interview.matched_job_id.as_deref(), Some("job-2"));
        assert_eq!(interview.timeline_action, "schedule_interview");
    }

    #[test]
    fn persistent_store_seeds_jobs_and_preserves_status_changes() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .update_job_status("job-3", JobStatus::Applied)
            .expect("update status");

        let reloaded = store.job("job-3").expect("load job").expect("job exists");
        assert_eq!(reloaded.status, JobStatus::Applied);
    }

    #[test]
    fn persistent_store_records_status_changes_in_job_timeline() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .update_job_status("job-3", JobStatus::Applied)
            .expect("update status");

        let reloaded = store.job("job-3").expect("load job").expect("job exists");
        let status_event = reloaded
            .timeline
            .iter()
            .find(|event| event.label.contains("تم نقل الوظيفة إلى تم التقديم"))
            .expect("status timeline event");
        assert_eq!(status_event.timestamp, "الآن");
        assert_eq!(status_event.category, "حالة");
    }

    #[test]
    fn persistent_store_records_assistant_drafts_in_job_timeline() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "Follow-up draft")
            .expect("save draft");

        let reloaded = store.job("job-2").expect("load job").expect("job exists");
        let draft_event = reloaded
            .timeline
            .iter()
            .find(|event| event.label.contains("تم حفظ مسودة المساعد"))
            .expect("assistant timeline event");
        assert_eq!(draft_event.timestamp, "الآن");
        assert_eq!(draft_event.category, "مساعد");
    }

    #[test]
    fn persistent_store_records_application_package_actions_in_job_timeline() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_application_package(
                "job-2",
                "Resume",
                "Resume body",
                "Letter",
                "Letter body",
                "PDF draft",
            )
            .expect("save package");
        store
            .generate_application_package("job-2")
            .expect("generate package");

        let reloaded = store.job("job-2").expect("load job").expect("job exists");
        let saved_event = reloaded
            .timeline
            .iter()
            .find(|event| event.label.contains("تم حفظ حزمة التقديم"))
            .expect("saved package timeline event");
        assert_eq!(saved_event.timestamp, "الآن");
        assert_eq!(saved_event.category, "مستندات");
        let generated_event = reloaded
            .timeline
            .iter()
            .find(|event| event.label.contains("تم توليد حزمة التقديم"))
            .expect("generated package timeline event");
        assert_eq!(generated_event.timestamp, "الآن");
        assert_eq!(generated_event.category, "مستندات");
    }

    #[test]
    fn persistent_store_saves_assistant_drafts_and_application_packages() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "مسودة متابعة محفوظة")
            .expect("save draft");
        store
            .save_application_package(
                "job-2",
                "سيرة Rust v2",
                "ملخص سيرة محفوظ",
                "خطاب Careem v2",
                "خطاب تقديم محفوظ",
                "PDF محفوظ",
            )
            .expect("save package");

        assert_eq!(
            store
                .assistant_draft("job-2")
                .expect("load draft")
                .as_deref(),
            Some("مسودة متابعة محفوظة")
        );
        let package = store
            .application_package("job-2")
            .expect("load package")
            .expect("package exists");
        assert_eq!(package.resume_title, "سيرة Rust v2");
        assert_eq!(package.pdf_status, "PDF محفوظ");
    }

    #[test]
    fn persistent_store_saves_application_package_draft_bodies() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_application_package(
                "job-2",
                "Resume title",
                "Resume body edited by the candidate.",
                "Cover letter title",
                "Cover letter body edited by the candidate.",
                "PDF draft",
            )
            .expect("save package");

        let package = store
            .application_package("job-2")
            .expect("load package")
            .expect("package exists");

        assert_eq!(package.resume_title, "Resume title");
        assert_eq!(package.resume_body, "Resume body edited by the candidate.");
        assert_eq!(package.cover_letter_title, "Cover letter title");
        assert_eq!(
            package.cover_letter_body,
            "Cover letter body edited by the candidate."
        );
        assert_eq!(package.pdf_status, "PDF draft");
    }

    #[test]
    fn persistent_store_keeps_assistant_draft_history_versions() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "First assistant draft")
            .expect("save first draft");
        store
            .save_assistant_draft("job-2", "Second assistant draft")
            .expect("save second draft");

        let history = store
            .assistant_draft_history("job-2")
            .expect("load draft history");

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].content, "Second assistant draft");
        assert_eq!(history[0].version, 2);
        assert_eq!(history[1].content, "First assistant draft");
        assert_eq!(history[1].version, 1);
    }

    #[test]
    fn persistent_store_keeps_application_package_history_versions() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_application_package(
                "job-2",
                "Resume v1",
                "Resume body v1",
                "Letter v1",
                "Letter body v1",
                "PDF draft",
            )
            .expect("save first package");
        store
            .save_application_package(
                "job-2",
                "Resume v2",
                "Resume body v2",
                "Letter v2",
                "Letter body v2",
                "PDF ready",
            )
            .expect("save second package");

        let history = store
            .application_package_history("job-2")
            .expect("load package history");

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].resume_title, "Resume v2");
        assert_eq!(history[0].version, 2);
        assert_eq!(history[1].resume_title, "Resume v1");
        assert_eq!(history[1].version, 1);
    }

    #[test]
    fn persistent_store_restores_assistant_draft_history_version() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "Draft to restore")
            .expect("save first draft");
        store
            .save_assistant_draft("job-2", "Current draft")
            .expect("save current draft");

        let restored = store
            .restore_assistant_draft_version("job-2", 1)
            .expect("restore draft version");

        assert_eq!(restored.content, "Draft to restore");
        assert_eq!(
            store
                .assistant_draft("job-2")
                .expect("load latest draft")
                .as_deref(),
            Some("Draft to restore")
        );
        assert_eq!(
            store
                .assistant_draft_history("job-2")
                .expect("load history")
                .first()
                .expect("new restore history version")
                .version,
            3
        );
    }

    #[test]
    fn persistent_store_restores_application_package_history_version() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_application_package(
                "job-2",
                "Resume restore target",
                "Resume body restore target",
                "Letter restore target",
                "Letter body restore target",
                "PDF draft",
            )
            .expect("save first package");
        store
            .save_application_package(
                "job-2",
                "Current resume",
                "Current resume body",
                "Current letter",
                "Current letter body",
                "PDF ready",
            )
            .expect("save current package");

        let restored = store
            .restore_application_package_version("job-2", 1)
            .expect("restore package version");

        assert_eq!(restored.resume_title, "Resume restore target");
        assert_eq!(restored.resume_body, "Resume body restore target");
        assert_eq!(
            store
                .application_package("job-2")
                .expect("load latest package")
                .expect("latest package")
                .resume_title,
            "Resume restore target"
        );
        assert_eq!(
            store
                .application_package_history("job-2")
                .expect("load history")
                .first()
                .expect("new restore history version")
                .version,
            3
        );
    }

    #[test]
    fn persistent_store_generates_package_from_profile_and_job() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Product Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend, Product operations".into(),
                target_locations: "Riyadh, Dubai, Cairo".into(),
                resume_filename: "jaber-rust-cv.pdf".into(),
                resume_skills: String::new(),
                resume_languages: String::new(),
                resume_seniority: String::new(),
                resume_regions: String::new(),
                resume_work_examples: String::new(),
            })
            .expect("save profile");

        let package = store
            .generate_application_package("job-2")
            .expect("generate package");

        assert_eq!(package.job_id, "job-2");
        assert!(package.resume_title.contains("Rust"));
        assert!(package.resume_body.contains("Jaber Product Builder"));
        assert!(package
            .resume_body
            .contains("Rust backend, Product operations"));
        assert!(package.resume_body.contains("Careem"));
        assert!(package.cover_letter_body.contains("Careem"));
        assert!(package.cover_letter_body.contains("مهندس برمجيات Rust"));

        let reloaded = store
            .application_package("job-2")
            .expect("load package")
            .expect("package exists");
        assert_eq!(reloaded.resume_body, package.resume_body);
        assert_eq!(reloaded.cover_letter_body, package.cover_letter_body);
    }

    #[test]
    fn generated_package_includes_profile_fit_context_for_imported_jobs() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Data Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Customer success".into(),
                target_locations: "Cairo".into(),
                resume_filename: "senior-python-data-analytics-cv.pdf".into(),
                resume_skills: "Python, SQL, dashboards".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "Egypt, MENA".into(),
                resume_work_examples: "Built product analytics dashboards.".into(),
            })
            .expect("save profile");
        let imported = store
            .import_manual_job(ManualJobImportInput {
                url: "https://www.bayt.com/en/egypt/jobs/python-data-analyst-cairo-12345/".into(),
                title: "Python Data Analyst".into(),
                employer: "MENA Insights".into(),
                location: "Cairo, Egypt".into(),
                description: "Build Python analytics pipelines and product dashboards.".into(),
            })
            .expect("import job");

        let package = store
            .generate_application_package(&imported.id)
            .expect("generate package");

        assert!(package.resume_body.contains("resume signals"));
        assert!(package.resume_body.contains("Python, SQL, dashboards"));
        assert!(package
            .resume_body
            .contains("Built product analytics dashboards"));
        assert!(package.resume_body.contains("Python"));
        assert!(package.resume_body.contains("Data"));
        assert!(package.cover_letter_body.contains("MENA Insights"));
    }

    #[test]
    fn generated_package_includes_bilingual_cv_summary_sections() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Analytics Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend, Product analytics".into(),
                target_locations: "Riyadh, Dubai".into(),
                resume_filename: "jaber-analytics-cv.pdf".into(),
                resume_skills: "Rust, SQL, dashboards".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "Saudi Arabia, UAE".into(),
                resume_work_examples: "Built analytics dashboards for Arabic SaaS teams.".into(),
            })
            .expect("save profile");

        let package = store
            .generate_application_package("job-2")
            .expect("generate package");

        assert!(package.resume_body.contains("ملخص مهني عربي"));
        assert!(package.resume_body.contains("English CV Summary"));
        assert!(package.resume_body.contains("Rust, SQL, dashboards"));
        assert!(package.resume_body.contains("Arabic, English"));
        assert!(package.resume_body.contains("Senior"));
        assert!(package.resume_body.contains("Saudi Arabia, UAE"));
        assert!(package
            .resume_body
            .contains("Built analytics dashboards for Arabic SaaS teams"));
        assert!(package.cover_letter_body.contains("English CV Summary"));
    }

    #[test]
    fn generated_package_uses_export_ready_document_sections() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .save_profile(SaveProfileRequest {
                display_name: "Jaber Product Builder".into(),
                preferred_language: "ar".into(),
                target_roles: "Rust backend, Product operations".into(),
                target_locations: "Riyadh, Dubai".into(),
                resume_filename: "jaber-product-cv.pdf".into(),
                resume_skills: "Rust, SQL, Arabic UX".into(),
                resume_languages: "Arabic, English".into(),
                resume_seniority: "Senior".into(),
                resume_regions: "Saudi Arabia, UAE".into(),
                resume_work_examples: "Built job-search automation and document workflows.".into(),
            })
            .expect("save profile");

        let package = store
            .generate_application_package("job-2")
            .expect("generate package");
        let html = store
            .package_preview_html("job-2")
            .expect("render package preview");

        assert!(package.resume_body.contains("CV Section: Summary"));
        assert!(package.resume_body.contains("CV Section: Skills"));
        assert!(package.resume_body.contains("CV Section: Match Evidence"));
        assert!(package.resume_body.contains("CV Section: Tailoring Plan"));
        assert!(package.resume_body.contains("- Rust, SQL, Arabic UX"));
        assert!(package
            .cover_letter_body
            .contains("Cover Letter Section: Opening"));
        assert!(package
            .cover_letter_body
            .contains("Cover Letter Section: Value Match"));
        assert!(package
            .cover_letter_body
            .contains("Cover Letter Section: Close"));
        assert!(html.contains("CV Section: Skills"));
        assert!(html.contains("Cover Letter Section: Value Match"));
    }

    #[test]
    fn persistent_store_renders_printable_package_preview_html() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .generate_application_package("job-2")
            .expect("generate package");

        let html = store
            .package_preview_html("job-2")
            .expect("render package preview");

        assert!(html.contains("dir=\"rtl\""));
        assert!(html.contains("معاينة PDF"));
        assert!(html.contains("مهندس برمجيات Rust"));
        assert!(html.contains("Careem"));
        assert!(html.contains("سيرة مخصصة"));
        assert!(html.contains("خطاب مخصص"));
        assert!(html.contains("window.print"));
    }

    #[test]
    fn printable_package_preview_renders_document_sections_and_escapes_content() {
        let job = Job {
            id: "job-x".into(),
            title: "Rust <Backend>".into(),
            employer: "MENA & Co".into(),
            source: "manual".into(),
            location: "Riyadh".into(),
            score: 88,
            status: JobStatus::Ready,
            deadline: "2026-08-01".into(),
            description: String::new(),
            tailored_resume: String::new(),
            cover_letter: String::new(),
            fit_explanation: String::new(),
            timeline: Vec::new(),
        };
        let package = ApplicationPackage {
            job_id: "job-x".into(),
            resume_title: "سيرة <مخصصة>".into(),
            resume_body: "قسم السيرة: المهارات / CV Section: Skills\n- Rust <safe>\n- Arabic UX\n\nقسم السيرة: دليل المطابقة / CV Section: Match Evidence\n- MENA & dashboards".into(),
            cover_letter_title: "خطاب <مخصص>".into(),
            cover_letter_body: "قسم الخطاب: قيمة المرشح / Cover Letter Section: Value Match\n- Product <impact>\n\nقسم الخطاب: الإغلاق / Cover Letter Section: Close\nشكراً".into(),
            pdf_status: "PDF <draft>".into(),
            generated_at: "2026-07-10".into(),
        };

        let html = render_package_preview_html(&job, &package);

        assert!(html.contains(r#"class="doc-section""#));
        assert!(html.contains(r#"<h3>قسم السيرة: المهارات / CV Section: Skills</h3>"#));
        assert!(html.contains(r#"<li>Rust &lt;safe&gt;</li>"#));
        assert!(html.contains(r#"<li>MENA &amp; dashboards</li>"#));
        assert!(html
            .contains(r#"<h3>قسم الخطاب: قيمة المرشح / Cover Letter Section: Value Match</h3>"#));
        assert!(html.contains("Rust &lt;Backend&gt;"));
        assert!(!html.contains("Rust <Backend>"));
        assert!(!html.contains("Rust <safe>"));
    }

    #[test]
    fn persistent_store_exports_application_package_pdf_bytes() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");
        store
            .generate_application_package("job-2")
            .expect("generate package");

        let pdf = store.package_pdf_bytes("job-2").expect("export pdf");

        assert!(pdf.starts_with(b"%PDF-"));
        assert!(pdf.ends_with(b"%%EOF"));
        assert!(pdf
            .windows(b"/Type/Catalog".len())
            .any(|window| window == b"/Type/Catalog"));
        assert!(pdf
            .windows(b"/Type/Pages".len())
            .any(|window| window == b"/Type/Pages"));
        assert!(pdf
            .windows(b"/Type/Page/".len())
            .any(|window| window == b"/Type/Page/"));
        assert!(pdf
            .windows(b"/Count 2".len())
            .any(|window| window == b"/Count 2"));
    }

    #[test]
    fn application_package_pdf_preserves_structured_sections_and_bullets() {
        let job = Job {
            id: "job-pdf".into(),
            title: "Rust Engineer".into(),
            employer: "MENA Cloud".into(),
            source: "manual".into(),
            location: "Riyadh".into(),
            score: 91,
            status: JobStatus::Ready,
            deadline: "2026-08-01".into(),
            description: String::new(),
            tailored_resume: String::new(),
            cover_letter: String::new(),
            fit_explanation: String::new(),
            timeline: Vec::new(),
        };
        let package = ApplicationPackage {
            job_id: job.id.clone(),
            resume_title: "Tailored resume".into(),
            resume_body: "CV Section: Skills\n- Rust\n- Arabic UX\n\nCV Section: Evidence\nBuilt MENA products".into(),
            cover_letter_title: "Tailored cover letter".into(),
            cover_letter_body: "Cover Letter Section: Opening\nHello team\n\nCover Letter Section: Close\nThank you".into(),
            pdf_status: "Ready".into(),
            generated_at: "2026-07-10".into(),
        };

        let html = render_package_pdf_html(&job, &package);

        assert!(html.contains("<h3>CV Section: Skills</h3>"));
        assert!(html.contains("<li>Rust</li>"));
        assert!(html.contains("<h3>Cover Letter Section: Close</h3>"));
    }

    #[test]
    fn application_package_pdf_paginates_long_structured_documents() {
        let job = Job {
            id: "job-long-pdf".into(),
            title: "Platform Engineer".into(),
            employer: "Long Form Co".into(),
            source: "manual".into(),
            location: "Dubai".into(),
            score: 84,
            status: JobStatus::Ready,
            deadline: "2026-08-01".into(),
            description: String::new(),
            tailored_resume: String::new(),
            cover_letter: String::new(),
            fit_explanation: String::new(),
            timeline: Vec::new(),
        };
        let long_bullets = (1..=80)
            .map(|index| format!("- Evidence item {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        let package = ApplicationPackage {
            job_id: job.id.clone(),
            resume_title: "Long resume".into(),
            resume_body: format!("CV Section: Evidence\n{long_bullets}"),
            cover_letter_title: "Cover letter".into(),
            cover_letter_body: "Cover Letter Section: Close\nThank you".into(),
            pdf_status: "Ready".into(),
            generated_at: "2026-07-10".into(),
        };

        let pdf_bytes = render_package_pdf_bytes(&job, &package);
        let pdf = String::from_utf8_lossy(&pdf_bytes);

        assert!(!pdf.contains("/Count 1"));
        assert!(pdf.matches("/Type/Page").count() > 1);
    }

    #[test]
    fn application_package_pdf_embeds_a_unicode_font_for_arabic() {
        let job = Job {
            id: "job-arabic-pdf".into(),
            title: "مهندس منصات".into(),
            employer: "شركة سحاب".into(),
            source: "manual".into(),
            location: "الرياض".into(),
            score: 90,
            status: JobStatus::Ready,
            deadline: "2026-08-01".into(),
            description: String::new(),
            tailored_resume: String::new(),
            cover_letter: String::new(),
            fit_explanation: String::new(),
            timeline: Vec::new(),
        };
        let package = ApplicationPackage {
            job_id: job.id.clone(),
            resume_title: "سيرة مخصصة".into(),
            resume_body: "قسم السيرة: الملخص\nمرشح بخبرة في بناء المنتجات العربية".into(),
            cover_letter_title: "خطاب مخصص".into(),
            cover_letter_body: "شكراً لفريق التوظيف".into(),
            pdf_status: "جاهز".into(),
            generated_at: "2026-07-10".into(),
        };

        let pdf = render_package_pdf_bytes(&job, &package);
        let pdf_source = String::from_utf8_lossy(&pdf);

        assert!(pdf_source.contains("/FontFile2"));
        assert!(!pdf_source.contains("/BaseFont /Helvetica"));
        assert!(pdf_source.contains("/Count 2"));
    }

    #[test]
    fn persistent_store_routes_recruiter_message_into_job_timeline() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store.link_recruiter_message("msg-1").expect("link message");

        let job = store.job("job-2").expect("load job").expect("job exists");
        assert!(job
            .timeline
            .iter()
            .any(|event| event.label.contains("تم ربط رسالة")));
    }

    #[test]
    fn persistent_store_builds_application_checklists_from_saved_workflow_state() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "Checklist draft")
            .expect("save draft");
        store
            .save_application_package(
                "job-2",
                "Checklist resume",
                "Checklist resume body",
                "Checklist letter",
                "Checklist letter body",
                "PDF ready",
            )
            .expect("save package");
        store.link_recruiter_message("msg-1").expect("link message");
        store
            .update_job_status("job-2", JobStatus::Ready)
            .expect("mark ready");

        let checklist = store
            .application_checklist("job-2")
            .expect("load checklist")
            .expect("job checklist exists");

        assert_eq!(checklist.job_id, "job-2");
        assert_eq!(checklist.completed_count, 5);
        assert_eq!(checklist.total_count, 5);
        assert!(checklist
            .items
            .iter()
            .any(|item| item.key == "assistant_draft" && item.completed));
        assert!(checklist
            .items
            .iter()
            .any(|item| item.key == "application_package" && item.completed));
        assert!(checklist
            .items
            .iter()
            .any(|item| item.key == "gmail_followup" && item.completed));
    }

    #[test]
    fn persistent_store_builds_cross_job_activity_feed() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        store
            .save_assistant_draft("job-2", "Activity feed draft")
            .expect("save draft");
        store
            .update_job_status("job-3", JobStatus::Applied)
            .expect("update status");

        let feed = store.activity_feed().expect("load activity feed");

        assert!(feed.len() >= 2);
        assert_eq!(feed[0].timestamp, "الآن");
        assert!(feed.iter().any(|item| {
            item.job_id == "job-2"
                && item.job_title == "مهندس برمجيات Rust"
                && item.category == "مساعد"
                && item.label.contains("تم حفظ مسودة المساعد")
        }));
        assert!(feed.iter().any(|item| {
            item.job_id == "job-3"
                && item.job_title == "مدير نمو المنتجات"
                && item.category == "حالة"
        }));
    }

    #[tokio::test]
    async fn app_entry_routes_redirect_and_serve_the_shell() {
        use axum::http::Request;
        use tower::ServiceExt;

        let response = app_with_store(PersistentStore::open_in_memory().expect("open store"))
            .oneshot(
                Request::get("/")
                    .body(Body::empty())
                    .expect("build root request"),
            )
            .await
            .expect("request root route");

        assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(response.headers()[header::LOCATION], "/app");

        let response = app_with_store(PersistentStore::open_in_memory().expect("open store"))
            .oneshot(
                Request::get("/app")
                    .body(Body::empty())
                    .expect("build app request"),
            )
            .await
            .expect("request app route");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn persistent_store_adds_custom_source_and_scans_multiple_relevant_jobs() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let source = store
            .add_custom_source(AddSourceRequest {
                label: "Remote OK".into(),
                url: "https://remoteok.com/remote-rust-jobs".into(),
                region: "Remote".into(),
            })
            .expect("add custom source");

        assert!(source.custom);
        assert_eq!(source.url, "https://remoteok.com/remote-rust-jobs");

        let result = store
            .scan_source(
                &source.id,
                ScanSourceRequest {
                    query: "Rust backend".into(),
                    location: "Riyadh".into(),
                    max_results: 3,
                },
            )
            .expect("scan custom source");

        assert_eq!(result.jobs.len(), 3);
        assert!(result.jobs.iter().all(|job| job.source == source.id));
        assert!(result.jobs.iter().all(|job| job.score >= 50));
        assert_eq!(store.jobs().expect("load jobs").len(), 8);
    }

    #[test]
    fn persistent_store_updates_multiple_jobs_for_monitoring() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let updated = store
            .update_jobs_status(&["job-1".into(), "job-2".into()], JobStatus::InProgress)
            .expect("bulk update statuses");

        assert_eq!(updated.len(), 2);
        assert!(updated
            .iter()
            .all(|job| job.status == JobStatus::InProgress));
    }

    #[test]
    fn persistent_store_schedules_source_scans_with_connector_metadata() {
        let store = PersistentStore::open_in_memory().expect("open store");
        store.seed_if_empty().expect("seed store");

        let source = store
            .schedule_source(
                "wazzuf",
                ScheduleSourceRequest {
                    enabled: true,
                    interval_minutes: 60,
                },
            )
            .expect("schedule source");

        assert!(source.scheduled);
        assert_eq!(source.connector_mode, "public_html");
        assert!(!source.next_scan_at.is_empty());
        assert!(source.connector_note.contains("عامة"));
    }
}
