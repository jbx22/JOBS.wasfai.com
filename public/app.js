const STATUS_LABELS = {
  discovered: "مكتشفة",
  processing: "قيد المعالجة",
  ready: "جاهزة للتقديم",
  applied: "تم التقديم",
  in_progress: "قيد المتابعة",
  expired: "منتهية",
  skipped: "مؤجلة",
};

const STATUS_ORDER = [
  "discovered",
  "processing",
  "ready",
  "applied",
  "in_progress",
  "expired",
  "skipped",
];

const NAV_ITEMS = [
  ["app", "بحث", "search"],
  ["documents", "السيرة", "docs"],
  ["assistant", "المساعد", "spark"],
  ["analytics", "النتائج", "chart"],
  ["settings/sources", "المصادر", "source"],
];

let state = {
  profile: {
    display_name: "",
    preferred_language: "ar",
    target_roles: "",
    target_locations: "",
    resume_filename: "",
    resume_skills: "",
    resume_languages: "",
    resume_seniority: "",
    resume_regions: "",
    resume_work_examples: "",
  },
  jobs: [],
  messages: [],
  packages: [],
  package_history: [],
  drafts: [],
  draft_history: [],
  sources: [],
  activity_feed: [],
  application_checklists: [],
  query: "",
  source: "all",
  activityFilter: "all",
  activeTab: "resume",
  draftEdits: {},
  editingJobId: "",
  jobEditForms: {},
  action: {
    pending: "",
    message: "",
    error: "",
  },
  importForm: {
    url: "",
    title: "",
    employer: "",
    location: "",
    description: "",
  },
  resumeText: "",
  resumePreview: null,
  importRequest: null,
  importPreview: null,
  importPreset: "manual",
};

const app = document.querySelector("#app");

const icon = (name) => {
  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-7"/></svg>',
    source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18l6-6-6-6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="m5 8 7 5 7-5"/></svg>',
  };
  return icons[name] || icons.search;
};

function navigate(path) {
  history.pushState(null, "", path.startsWith("/") ? path : `/${path}`);
  render();
}

function currentRoute() {
  const path = location.pathname.replace(/^\/+/, "") || "app";
  return path === "" ? "app" : path;
}

function statusKey(status) {
  return status;
}

function countByStatus() {
  return STATUS_ORDER.reduce((counts, status) => {
    counts[status] = state.jobs.filter((job) => job.status === status).length;
    return counts;
  }, {});
}

function filteredJobs() {
  const query = state.query.trim().toLowerCase();
  return state.jobs.filter((job) => {
    const sourceMatches = state.source === "all" || job.source === state.source;
    const queryMatches =
      !query ||
      job.title.toLowerCase().includes(query) ||
      job.employer.toLowerCase().includes(query) ||
      job.location.toLowerCase().includes(query) ||
      job.source.toLowerCase().includes(query);
    return sourceMatches && queryMatches;
  });
}

function sourceLabel(sourceId) {
  return state.sources.find((source) => source.id === sourceId)?.label || sourceId;
}

function packageFor(jobId) {
  return state.packages.find((item) => item.job_id === jobId);
}

function draftFor(jobId) {
  return state.drafts.find((item) => item.job_id === jobId);
}

function packageHistoryFor(jobId) {
  return (state.package_history || [])
    .filter((item) => item.job_id === jobId)
    .sort((left, right) => right.version - left.version);
}

function draftHistoryFor(jobId) {
  return (state.draft_history || [])
    .filter((item) => item.job_id === jobId)
    .sort((left, right) => right.version - left.version);
}

function nextHistoryVersion(items, jobId) {
  return (
    Math.max(
      0,
      ...(items || [])
        .filter((item) => item.job_id === jobId)
        .map((item) => Number(item.version) || 0),
    ) + 1
  );
}

function prependHistoryItem(key, item) {
  state[key] = [item, ...(state[key] || []).filter((candidate) => {
    return !(candidate.job_id === item.job_id && candidate.version === item.version);
  })];
}

function formatDraftSavedAt(value) {
  return value ? value.replace("T", " ").slice(0, 16) : "";
}

function draftSaveState(jobId, content) {
  const draft = draftFor(jobId);
  const savedContent = draft?.content ?? "";
  if (content !== savedContent) {
    return "تعديلات غير محفوظة";
  }
  if (draft?.updated_at) {
    return `آخر حفظ: ${formatDraftSavedAt(draft.updated_at)}`;
  }
  return "لم تحفظ مسودة بعد";
}

function applicationChecklistFor(job) {
  const pkg = packageFor(job.id);
  const draft = draftFor(job.id);
  const linkedMessages = state.messages.filter((message) => message.matched_job_id === job.id);
  const hasGmailTimeline = (job.timeline || []).some((event) => event.category === "Gmail");
  const movedToApplicationStage = ["ready", "applied", "in_progress"].includes(job.status);
  const items = [
    {
      key: "fit_review",
      label: "مراجعة المطابقة",
      completed: Boolean(job.fit_explanation || job.score),
      detail: job.fit_explanation ? "تمت قراءة الملاءمة والكلمات المفتاحية" : "راجع درجة الملاءمة قبل التقديم",
    },
    {
      key: "assistant_draft",
      label: "مسودة المساعد",
      completed: Boolean(draft?.content?.trim()),
      detail: draft?.content?.trim() ? "مسودة محفوظة" : "احفظ مسودة خطاب أو متابعة",
    },
    {
      key: "application_package",
      label: "حزمة التقديم",
      completed: Boolean(pkg?.resume_body?.trim() && pkg?.cover_letter_body?.trim()),
      detail: pkg ? "السيرة والخطاب جاهزان" : "ولّد أو احفظ السيرة والخطاب",
    },
    {
      key: "gmail_followup",
      label: "متابعة Gmail",
      completed: linkedMessages.length > 0 || hasGmailTimeline,
      detail: linkedMessages.length > 0 || hasGmailTimeline ? "رسالة مرتبطة بالخط الزمني" : "اربط رسالة عند وصول رد من الموظف",
    },
    {
      key: "application_status",
      label: "حالة الطلب",
      completed: movedToApplicationStage,
      detail: movedToApplicationStage ? "الوظيفة انتقلت لمرحلة تنفيذية" : "انقل الوظيفة إلى جاهزة أو تم التقديم",
    },
  ];
  return {
    job_id: job.id,
    completed_count: items.filter((item) => item.completed).length,
    total_count: items.length,
    items,
  };
}

function applicationChecklistCard(job) {
  const checklist = applicationChecklistFor(job);
  return `<section class="assistant-card application-checklist" data-application-checklist="${job.id}">
    <div class="section-title">
      <div><h2>قائمة التقديم</h2><p>خطوات جاهزية الطلب لهذه الوظيفة.</p></div>
      <span class="small-chip teal">${checklist.completed_count}/${checklist.total_count}</span>
    </div>
    <div class="checklist-items">
      ${checklist.items
        .map(
          (item) => `<div class="checklist-item ${item.completed ? "complete" : ""}" data-checklist-item="${item.key}">
            <span class="check-icon">${item.completed ? "✓" : ""}</span>
            <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span>
          </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function currentJobId() {
  const route = currentRoute();
  if (route.startsWith("jobs/")) {
    return route.split("/")[1];
  }
  return "job-2";
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }
  return response.json();
}

function replaceJob(job) {
  const exists = state.jobs.some((candidate) => candidate.id === job.id);
  state.jobs = exists
    ? state.jobs.map((candidate) => (candidate.id === job.id ? job : candidate))
    : [job, ...state.jobs];
}

function removeJob(jobId) {
  state.jobs = state.jobs.filter((candidate) => candidate.id !== jobId);
  state.packages = state.packages.filter((item) => item.job_id !== jobId);
  state.drafts = state.drafts.filter((item) => item.job_id !== jobId);
}

async function apiNoContent(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }
}

async function runAction(key, loading, success, task) {
  state.action = { pending: key, message: loading, error: "" };
  render();
  try {
    const result = await task();
    state.action = { pending: "", message: success, error: "" };
    return result;
  } catch (error) {
    state.action = {
      pending: "",
      message: "",
      error:
        "\u062a\u0639\u0630\u0631 \u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u0639\u0645\u0644\u064a\u0629. \u0631\u0627\u062c\u0639 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    };
    render();
    return null;
  }
}

function editFormFor(job) {
  if (!state.jobEditForms[job.id]) {
    state.jobEditForms[job.id] = {
      title: job.title,
      employer: job.employer,
      location: job.location,
      description: job.description,
    };
  }
  return state.jobEditForms[job.id];
}

function replaceDraft(draft) {
  state.drafts = [
    draft,
    ...state.drafts.filter((candidate) => candidate.job_id !== draft.job_id),
  ];
}

function appendDraftHistory(draft) {
  prependHistoryItem("draft_history", {
    job_id: draft.job_id,
    version: nextHistoryVersion(state.draft_history, draft.job_id),
    content: draft.content,
    updated_at: draft.updated_at,
  });
}

function replacePackage(item) {
  state.packages = [
    item,
    ...state.packages.filter((candidate) => candidate.job_id !== item.job_id),
  ];
}

function appendPackageHistory(pkg) {
  prependHistoryItem("package_history", {
    job_id: pkg.job_id,
    version: nextHistoryVersion(state.package_history, pkg.job_id),
    resume_title: pkg.resume_title,
    resume_body: pkg.resume_body,
    cover_letter_title: pkg.cover_letter_title,
    cover_letter_body: pkg.cover_letter_body,
    pdf_status: pkg.pdf_status,
    generated_at: pkg.generated_at,
  });
}

function setupEvents() {
  document.querySelectorAll("[data-nav]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(item.dataset.nav);
    });
  });

  document.querySelectorAll("[data-job]").forEach((item) => {
    item.addEventListener("click", () => navigate(`/jobs/${item.dataset.job}`));
  });

  document.querySelectorAll("[data-source]").forEach((item) => {
    item.addEventListener("click", () => {
      state.source = item.dataset.source;
      render();
    });
  });

  document.querySelectorAll("[data-activity-filter]").forEach((item) => {
    item.addEventListener("click", () => {
      state.activityFilter = item.dataset.activityFilter;
      render();
    });
  });

  const search = document.querySelector("[data-search]");
  if (search) {
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
    });
  }

  document.querySelectorAll("[data-status-action]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = state.jobs.find((candidate) => candidate.id === item.dataset.statusAction);
      if (job) {
        const nextStatus =
          job.status === "applied" || job.status === "in_progress"
            ? "in_progress"
            : "applied";
        const updated = await runAction(
          "status",
          "\u062c\u0627\u0631\u064a \u062a\u062d\u062f\u064a\u062b \u062d\u0627\u0644\u0629 \u0627\u0644\u0648\u0638\u064a\u0641\u0629...",
          "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062d\u0627\u0644\u0629",
          () =>
            apiJson(`/api/jobs/${job.id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: nextStatus }),
            }),
        );
        if (updated) {
          replaceJob(updated);
        }
      }
      render();
    });
  });

  document.querySelectorAll("[data-tab]").forEach((item) => {
    item.addEventListener("click", () => {
      state.activeTab = item.dataset.tab;
      render();
    });
  });

  const composer = document.querySelector("[data-composer]");
  if (composer) {
    composer.addEventListener("input", (event) => {
      const jobId = event.target.dataset.composer;
      state.draftEdits[jobId] = event.target.value;
      const saveState = document.querySelector(`[data-draft-save-state="${jobId}"]`);
      if (saveState) {
        saveState.textContent = draftSaveState(jobId, event.target.value);
      }
    });
  }

  document.querySelectorAll("[data-prompt-chip]").forEach((item) => {
    item.addEventListener("click", () => {
      const jobId = item.dataset.promptJob;
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (!job) return;
      const prompt = assistantPromptText(item.dataset.promptChip, job);
      state.draftEdits[jobId] = prompt;
      render();
    });
  });

  document.querySelectorAll("[data-restore-draft-version]").forEach((item) => {
    item.addEventListener("click", async () => {
      const [jobId, version] = item.dataset.restoreDraftVersion.split(":");
      const draft = await runAction(
        "restore-draft",
        "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u0633\u0648\u062f\u0629...",
        "\u062a\u0645 \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u0633\u0648\u062f\u0629",
        () => apiJson(`/api/drafts/${jobId}/history/${version}/restore`, { method: "POST" }),
      );
      if (draft) {
        state.draftEdits[jobId] = draft.content;
        replaceDraft(draft);
        appendDraftHistory(draft);
      }
      render();
    });
  });

  const generate = document.querySelector("[data-generate]");
  if (generate) {
    generate.addEventListener("click", async () => {
      const jobId = generate.dataset.generate;
      const composerValue =
        document.querySelector(`[data-composer="${jobId}"]`)?.value || state.draftEdits[jobId] || "";
      const content =
        composerValue.trim() ||
        "تم تجهيز مسودة عربية مختصرة: أستطيع ربط خبرتك بمتطلبات الوظيفة، إبراز الأثر بالأرقام، وصياغة رسالة متابعة مهنية مناسبة لسوق المنطقة.";
      const draft = await runAction(
        "draft",
        "\u062c\u0627\u0631\u064a \u062a\u0648\u0644\u064a\u062f \u0627\u0644\u0645\u0633\u0648\u062f\u0629...",
        "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629",
        () =>
          apiJson("/api/drafts", {
            method: "POST",
            body: JSON.stringify({ job_id: jobId, content }),
          }),
      );
      if (draft) {
        state.draftEdits[jobId] = draft.content;
        replaceDraft(draft);
        appendDraftHistory(draft);
      }
      render();
    });
  }

  const generatePackage = document.querySelector("[data-generate-package]");
  if (generatePackage) {
    generatePackage.addEventListener("click", async () => {
      const jobId = generatePackage.dataset.generatePackage;
      const pkg = await runAction(
        "package",
        "\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u062d\u0632\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645...",
        "\u062a\u0645 \u062a\u062c\u0647\u064a\u0632 \u062d\u0632\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645",
        () =>
          apiJson(`/api/packages/${jobId}/generate`, {
            method: "POST",
          }),
      );
      if (pkg) {
        replacePackage(pkg);
        appendPackageHistory(pkg);
      }
      render();
    });
  }

  document.querySelectorAll("[data-link-message]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = await runAction(
        "message",
        "\u062c\u0627\u0631\u064a \u0631\u0628\u0637 \u0627\u0644\u0631\u0633\u0627\u0644\u0629...",
        "\u062a\u0645 \u0631\u0628\u0637 \u0627\u0644\u0631\u0633\u0627\u0644\u0629",
        () =>
          apiJson(`/api/messages/${item.dataset.linkMessage}/link`, {
            method: "POST",
          }),
      );
      if (job) {
        replaceJob(job);
        navigate(`/jobs/${job.id}`);
      }
    });
  });

  document.querySelectorAll("[data-save-package], [data-save-package-draft]").forEach((item) => {
    item.addEventListener("click", async () => {
      const jobId = item.dataset.savePackage || item.dataset.savePackageDraft;
      const currentPackage = packageFor(jobId) || {};
      const resumeBody =
        document.querySelector(`[data-package-field="resume_body"][data-job-id="${jobId}"]`)?.value ||
        currentPackage.resume_body ||
        "";
      const coverLetterBody =
        document.querySelector(`[data-package-field="cover_letter_body"][data-job-id="${jobId}"]`)?.value ||
        currentPackage.cover_letter_body ||
        "";
      const pkg = await runAction(
        "package",
        "\u062c\u0627\u0631\u064a \u062d\u0641\u0638 \u062d\u0632\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645...",
        "\u062a\u0645 \u062d\u0641\u0638 \u062d\u0632\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645",
        () =>
          apiJson(`/api/packages/${jobId}`, {
            method: "PUT",
            body: JSON.stringify({
              resume_title: currentPackage.resume_title || "سيرة مخصصة",
              resume_body: resumeBody,
              cover_letter_title: currentPackage.cover_letter_title || "خطاب مخصص",
              cover_letter_body: coverLetterBody,
              pdf_status: "PDF محفوظ",
            }),
          }),
      );
      if (pkg) {
        replacePackage(pkg);
        appendPackageHistory(pkg);
      }
      render();
    });
  });

  document.querySelectorAll("[data-restore-package-version]").forEach((item) => {
    item.addEventListener("click", async () => {
      const [jobId, version] = item.dataset.restorePackageVersion.split(":");
      const pkg = await runAction(
        "restore-package",
        "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u062d\u0632\u0645\u0629...",
        "\u062a\u0645 \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u062d\u0632\u0645\u0629",
        () => apiJson(`/api/packages/${jobId}/history/${version}/restore`, { method: "POST" }),
      );
      if (pkg) {
        replacePackage(pkg);
        appendPackageHistory(pkg);
      }
      render();
    });
  });

  const editJob = document.querySelector("[data-edit-job]");
  if (editJob) {
    editJob.addEventListener("click", () => {
      const job = state.jobs.find((candidate) => candidate.id === editJob.dataset.editJob);
      if (job) {
        state.editingJobId = job.id;
        editFormFor(job);
      }
      render();
    });
  }

  const cancelEdit = document.querySelector("[data-cancel-edit]");
  if (cancelEdit) {
    cancelEdit.addEventListener("click", () => {
      state.editingJobId = "";
      render();
    });
  }

  document.querySelectorAll("[data-edit-field]").forEach((item) => {
    item.addEventListener("input", (event) => {
      const jobId = event.target.dataset.editJobId;
      if (!state.jobEditForms[jobId]) {
        state.jobEditForms[jobId] = {};
      }
      state.jobEditForms[jobId][event.target.dataset.editField] = event.target.value;
    });
  });

  const saveJob = document.querySelector("[data-save-job]");
  if (saveJob) {
    saveJob.addEventListener("click", async () => {
      const jobId = saveJob.dataset.saveJob;
      const updated = await runAction(
        "save-job",
        "\u062c\u0627\u0631\u064a \u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644...",
        "\u062a\u0645 \u062d\u0641\u0638 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
        () =>
          apiJson(`/api/jobs/${jobId}`, {
            method: "PUT",
            body: JSON.stringify(state.jobEditForms[jobId]),
          }),
      );
      if (updated) {
        replaceJob(updated);
        state.jobEditForms[jobId] = {
          title: updated.title,
          employer: updated.employer,
          location: updated.location,
          description: updated.description,
        };
        state.editingJobId = "";
      }
      render();
    });
  }

  const deleteJob = document.querySelector("[data-delete-job]");
  if (deleteJob) {
    deleteJob.addEventListener("click", async () => {
      const jobId = deleteJob.dataset.deleteJob;
      const deleted = await runAction(
        "delete-job",
        "\u062c\u0627\u0631\u064a \u062d\u0630\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629...",
        "\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
        () => apiNoContent(`/api/jobs/${jobId}`, { method: "DELETE" }),
      );
      if (deleted !== null) {
        removeJob(jobId);
        navigate("/app");
      }
    });
  }

  document.querySelectorAll("[data-import-field]").forEach((item) => {
    item.addEventListener("input", (event) => {
      state.importForm[event.target.dataset.importField] = event.target.value;
      state.importRequest = null;
      state.importPreview = null;
    });
  });

  document.querySelectorAll("[data-source-preset]").forEach((item) => {
    item.addEventListener("click", () => {
      const source = state.sources.find((candidate) => candidate.id === item.dataset.sourcePreset);
      if (!source) return;
      state.importPreset = source.id;
      state.importRequest = null;
      state.importPreview = null;
      state.importForm = {
        ...state.importForm,
        url: source.import_url_template || "",
      };
      render();
    });
  });

  document.querySelectorAll("[data-profile-field]").forEach((item) => {
    item.addEventListener("input", (event) => {
      state.profile[event.target.dataset.profileField] = event.target.value;
    });
    item.addEventListener("change", (event) => {
      state.profile[event.target.dataset.profileField] = event.target.value;
    });
  });

  const resumeText = document.querySelector("[data-resume-text]");
  if (resumeText) {
    resumeText.addEventListener("input", (event) => {
      state.resumeText = event.target.value;
      state.resumePreview = null;
    });
  }

  const previewResume = document.querySelector("[data-preview-resume]");
  if (previewResume) {
    previewResume.addEventListener("click", async () => {
      const preview = await runAction(
        "resume-preview",
        "\u062c\u0627\u0631\u064a \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0633\u064a\u0631\u0629...",
        "\u062a\u0645 \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0645\u0644\u062e\u0635 \u0627\u0644\u0633\u064a\u0631\u0629",
        () =>
          apiJson("/api/profile/resume/preview", {
            method: "POST",
            body: JSON.stringify({
              filename: state.profile.resume_filename || "resume.txt",
              text: state.resumeText,
            }),
          }),
      );
      if (preview) {
        state.resumePreview = preview;
      }
      render();
    });
  }

  const applyResumePreview = document.querySelector("[data-apply-resume-preview]");
  if (applyResumePreview) {
    applyResumePreview.addEventListener("click", () => {
      if (state.resumePreview) {
        const { extraction_summary, ...profileFields } = state.resumePreview;
        state.profile = { ...state.profile, ...profileFields };
      }
      render();
    });
  }

  const saveProfile = document.querySelector("[data-save-profile]");
  if (saveProfile) {
    saveProfile.addEventListener("click", async () => {
      const profile = await runAction(
        "profile",
        "\u062c\u0627\u0631\u064a \u062d\u0641\u0638 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0647\u0646\u064a...",
        "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0647\u0646\u064a",
        () =>
          apiJson("/api/profile", {
            method: "PUT",
            body: JSON.stringify(state.profile),
          }),
      );
      if (profile) {
        state.profile = profile;
      }
      render();
    });
  }

  const importJob = document.querySelector("[data-import-job]");
  if (importJob) {
    importJob.addEventListener("click", async () => {
      const preview = await runAction(
        "import",
        "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0648\u0638\u064a\u0641\u0629...",
        "\u062a\u0645 \u062a\u062c\u0647\u064a\u0632 \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f",
        () =>
          apiJson("/api/jobs/import/preview", {
            method: "POST",
            body: JSON.stringify(state.importForm),
          }),
      );
      if (preview) {
        state.importPreview = preview;
        state.importRequest = { ...state.importForm };
        state.importForm = {
          url: preview.url,
          title: preview.title,
          employer: preview.employer,
          location: preview.location,
          description: preview.description,
        };
        render();
      }
    });
  }

  const confirmImport = document.querySelector("[data-confirm-import]");
  if (confirmImport) {
    confirmImport.addEventListener("click", async () => {
      const job = await runAction(
        "import-confirm",
        "\u062c\u0627\u0631\u064a \u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0648\u0638\u064a\u0641\u0629...",
        "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
        () =>
          apiJson("/api/jobs/import", {
            method: "POST",
            body: JSON.stringify(state.importRequest || state.importForm),
          }),
      );
      if (job) {
        replaceJob(job);
        state.source = "all";
        state.importForm = {
          url: "",
          title: "",
          employer: "",
          location: "",
          description: "",
        };
        state.importRequest = null;
        state.importPreview = null;
        navigate(`/jobs/${job.id}`);
      }
    });
  }
}

function navMarkup() {
  const route = currentRoute();
  return NAV_ITEMS.map(([path, label, iconName]) => {
    const active = route === path || (path === "app" && route.startsWith("jobs/"));
    return `<a class="nav-link ${active ? "active" : ""}" href="/${path}" data-nav="/${path}">${icon(iconName)}<span>${label}</span></a>`;
  }).join("");
}

function shell(content) {
  const side = `<aside class="side-nav">
      <div class="brand"><span class="brand-mark">J</span><div><h1 class="brand-title">JOBS.wasfai.com</h1><p class="brand-subtitle">مركز البحث ورحلة التقديم من مصدر واحد</p></div></div>
    <nav>${navMarkup()}</nav>
    <p class="screen-note">نموذج أولي يستلهم من JobOps وCareer-Ops وAI Job Search.</p>
  </aside>`;

  app.innerHTML = `<div class="layout ${state.editingJobId ? "is-editing" : ""}">${side}<main class="main">${feedbackBanner()}${content}</main><nav class="bottom-nav">${navMarkup()}</nav></div>`;
  setupEvents();
}

function feedbackBanner() {
  if (state.action.pending) {
    return `<div class="feedback-banner loading" data-action-status>${state.action.message}</div>`;
  }
  if (state.action.error) {
    return `<div class="feedback-banner error" data-action-error>${state.action.error}</div>`;
  }
  if (state.action.message) {
    return `<div class="feedback-banner success" data-action-message>${state.action.message}</div>`;
  }
  return "";
}

function topbar(subtitle = "جاهز للبحث والتخصيص والمتابعة") {
  const displayName = state.profile?.display_name || "جابر";
  return `<header class="topbar">
    <div class="brand">
      <span class="brand-mark">J</span>
      <div>
        <h1 class="brand-title">JOBS.wasfai.com</h1>
        <p class="brand-subtitle">${subtitle}</p>
      </div>
    </div>
    <button class="account-chip" data-nav="/login">${icon("source")} ${escapeHtml(displayName)}</button>
  </header>`;
}

function renderApp() {
  const counts = countByStatus();
  const jobs = filteredJobs();
  const statusStrip = STATUS_ORDER.slice(0, 5)
    .map((status) => `<div class="status-pill"><strong>${counts[status]}</strong><span>${STATUS_LABELS[status]}</span></div>`)
    .join("");
  const chips = [
    { id: "all", label: "كل المصادر" },
    ...state.sources.filter((source) => source.enabled),
  ]
    .map((source) => `<button class="source-chip ${state.source === source.id ? "active" : ""}" data-source="${source.id}">${source.label}</button>`)
    .join("");

  const list = jobs.length
    ? jobs.map(jobCard).join("")
    : `<div class="empty">لا توجد وظائف مطابقة. جرّب مدينة أو مصدر آخر.</div>`;

  shell(`${topbar()}
    <section class="hero-grid">
      <div class="command-panel">
        <div class="section-title">
          <div>
            <h2>ابحث عن وظيفة</h2>
            <p>ابحث، اختصر القائمة، خصص الحزمة، ثم تابع النتيجة.</p>
          </div>
        </div>
        <div class="search-row">
          <div class="search-box">${icon("search")}<input data-search value="${escapeHtml(state.query)}" placeholder="مثال: Rust في الرياض أو UX في دبي" /></div>
          <button class="primary-btn" data-nav="/settings/sources">${icon("source")} المصادر</button>
        </div>
        <div class="source-row">${chips}</div>
        <div class="status-row">${statusStrip}</div>
        <div class="job-list">${list}</div>
        ${assistantComposer()}
      </div>
      ${desktopPreview()}
    </section>`);
}

function jobCard(job) {
  return `<button class="job-card" data-job="${job.id}">
    <span class="score-ring" style="--score:${job.score}">${job.score}%</span>
    <span>
      <h3>${job.title}</h3>
      <p>${job.employer} · ${job.location}</p>
      <span class="job-meta">
        <span class="small-chip teal">${sourceLabel(job.source)}</span>
        <span class="small-chip gold">${STATUS_LABELS[job.status]}</span>
        <span class="small-chip">${job.deadline}</span>
      </span>
    </span>
  </button>`;
}

function assistantComposer(jobId = currentJobId()) {
  const content = state.draftEdits[jobId] ?? draftFor(jobId)?.content ?? "";
  const saveState = draftSaveState(jobId, content);
  return `<section class="assistant-card">
    <div class="section-title"><div><h2>المساعد</h2><p>Ghostwriter عربي لكل وظيفة ورسالة متابعة.</p></div></div>
    <div class="composer-meta"><span class="small-chip gold" data-draft-save-state="${jobId}">${escapeHtml(saveState)}</span></div>
    <textarea data-composer="${jobId}" placeholder="اكتب: جهز خطاب مختصر لوظيفة Rust في الرياض">${escapeHtml(content)}</textarea>
   <div class="button-row">
     <button class="primary-btn" data-generate="${jobId}">${icon("spark")} توليد مسودة</button>
     <button class="secondary-btn" data-generate-package="${jobId}">${icon("doc")} تجهيز السيرة والخطاب</button>
     <button class="secondary-btn" data-nav="/assistant">فتح المحادثة</button>
   </div>
    <div class="draft-box">${content || "ستظهر هنا مسودة مخصصة للسيرة أو الخطاب أو رد المتابعة."}</div>
    ${draftHistoryList(jobId)}
  </section>`;
}

function draftHistoryList(jobId) {
  const items = draftHistoryFor(jobId).slice(0, 4);
  const body = items.length
    ? items
        .map(
          (item) => `<div class="history-item"><div class="history-head"><span class="small-chip gold">نسخة ${item.version}</span><button class="ghost-btn" data-restore-draft-version="${jobId}:${item.version}">استعادة</button></div><p>${escapeHtml(item.content)}</p><small>${escapeHtml(item.updated_at)}</small></div>`,
        )
        .join("")
    : `<p class="empty">لا توجد نسخ محفوظة بعد.</p>`;
  return `<div class="history-list" data-draft-history="${jobId}"><div class="history-title">سجل المسودات</div>${body}</div>`;
}

function packageHistoryList(jobId) {
  const items = packageHistoryFor(jobId).slice(0, 4);
  const body = items.length
    ? items
        .map(
          (item) => `<div class="history-item"><div class="history-head"><span class="small-chip gold">نسخة ${item.version}</span><button class="ghost-btn" data-restore-package-version="${jobId}:${item.version}">استعادة</button></div><strong>${escapeHtml(item.resume_title)}</strong><p>${escapeHtml(item.resume_body)}</p><small>${escapeHtml(item.generated_at)} · ${escapeHtml(item.pdf_status)}</small></div>`,
        )
        .join("")
    : `<p class="empty">لا توجد نسخ محفوظة بعد.</p>`;
  return `<div class="history-list" data-package-history="${jobId}"><div class="history-title">سجل الحزم</div>${body}</div>`;
}

function assistantContext(jobId = currentJobId()) {
  const job = state.jobs.find((candidate) => candidate.id === jobId) || state.jobs[0];
  const pkg = packageFor(job.id);
  const draft = draftFor(job.id);
  const prompts = [
    ["cover", "خطاب تقديم مختصر"],
    ["followup", "رسالة متابعة للموظف"],
    ["interview", "إجابة عن سؤال المقابلة"],
  ];
  return `<section class="assistant-card assistant-context" data-assistant-context>
    <div class="section-title"><div><h2>سياق الوظيفة</h2><p>المساعد يعمل على وظيفة واحدة حتى تبقى المسودات مرتبطة بالمسار الصحيح.</p></div></div>
    <div class="context-grid">
      <div><span class="small-chip teal">${sourceLabel(job.source)}</span><h3>${escapeHtml(job.title)}</h3><p class="screen-note">${escapeHtml(job.employer)} · ${escapeHtml(job.location)}</p></div>
      <div><span class="small-chip gold">${job.score}% مطابقة</span><p class="screen-note">${escapeHtml(pkg?.pdf_status || "لم يتم تجهيز الحزمة بعد")}</p></div>
    </div>
    <div class="prompt-row">${prompts.map(([key, label]) => `<button class="prompt-chip" data-prompt-chip="${key}" data-prompt-job="${job.id}">${label}</button>`).join("")}</div>
    <p class="screen-note">${draft ? "آخر مسودة محفوظة جاهزة للمراجعة." : "ابدأ بمسودة، ثم احفظها في الخط الزمني وحزمة التقديم."}</p>
  </section>`;
}

function assistantPromptText(kind, job) {
  const base = `${job.title} لدى ${job.employer} في ${job.location}`;
  if (kind === "followup") {
    return `اكتب رسالة متابعة عربية مهنية إلى مسؤول التوظيف بخصوص وظيفة ${base}. اجعلها قصيرة، ودودة، وتطلب تحديث حالة الطلب أو موعد الخطوة التالية.`;
  }
  if (kind === "interview") {
    return `جهز إجابة مقابلة عربية لوظيفة ${base}. اربط خبرتي بمتطلبات الوظيفة، واستخدم أمثلة قابلة للقياس، واختم بسؤال ذكي للفريق.`;
  }
  return `اكتب خطاب تقديم عربي مختصر ومخصص لوظيفة ${base}. ابدأ بسبب الاهتمام، ثم اربط الخبرة بمتطلبات الإعلان، واختم بدعوة واضحة للتواصل.`;
}

function desktopPreview() {
  const topJobs = state.jobs.slice(0, 3);
  return `<aside class="desktop-preview">
    <div class="desktop-board">
      <div class="mini-nav">
        <strong>لوحة سطح المكتب</strong>
        <span class="small-chip teal">بحث</span>
        <span class="small-chip">المستندات</span>
        <span class="small-chip">Gmail</span>
        <span class="small-chip">النتائج</span>
      </div>
      <div class="mini-list">
        <strong>قائمة مختصرة</strong>
        ${topJobs.map((job) => `<div class="job-card"><span class="score-ring" style="--score:${job.score}">${job.score}%</span><span><h3>${job.title}</h3><p>${job.employer}</p></span></div>`).join("")}
      </div>
      <div class="mini-detail">
        <strong>المساعد والمتابعة</strong>
        <div class="inbox-card">${icon("mail")} رسالة مقابلة مرتبطة بوظيفة Careem</div>
        <div class="package-card">PDF جاهز · سيرة وخطاب</div>
        <div class="metric-card"><strong>42%</strong><span>معدل الردود</span></div>
      </div>
    </div>
  </aside>`;
}

function renderJob(route) {
  const id = route.split("/")[1];
  const job = state.jobs.find((candidate) => candidate.id === id) || state.jobs[0];
  const pkg = packageFor(job.id);
  const messages = state.messages.filter((message) => message.matched_job_id === job.id);
  const timeline = job.timeline?.length
    ? job.timeline.map(timelineItem).join("")
    : `<p class="empty">لا توجد أحداث بعد. ستظهر هنا خطوات التقديم عند الاستيراد أو التوليد أو المتابعة.</p>`;
  const tabContent =
    state.activeTab === "resume"
    ? `<div class="package-card"><strong>${pkg?.resume_title || "سيرة مخصصة"}</strong><p>${pkg?.resume_body || job.tailored_resume}</p><span class="small-chip teal">${pkg?.pdf_status || "PDF قيد التحضير"}</span></div>`
    : state.activeTab === "letter"
      ? `<div class="package-card"><strong>${pkg?.cover_letter_title || "خطاب مخصص"}</strong><p>${pkg?.cover_letter_body || job.cover_letter}</p></div>`
        : `<div class="package-card"><strong>معاينة PDF</strong><p>ملف قابل للتصدير عند ربط مولد المستندات في المرحلة التالية.</p><span class="small-chip gold">${pkg?.generated_at || "لم يتم التوليد"}</span></div>`;

  const editCopy = {
    edit: "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
    delete: "\u062d\u0630\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
    title: "\u062a\u062d\u062f\u064a\u062b \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
    titleLabel: "\u0627\u0644\u0645\u0633\u0645\u0649",
    employer: "\u0627\u0644\u0634\u0631\u0643\u0629",
    location: "\u0627\u0644\u0645\u0648\u0642\u0639",
    description: "\u0627\u0644\u0648\u0635\u0641",
    save: "\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644",
    cancel: "\u0625\u0644\u063a\u0627\u0621",
  };
  const editForm = editFormFor(job);
  const editPanel =
    state.editingJobId === job.id
      ? `<article class="assistant-card edit-card">
          <h2>${editCopy.title}</h2>
          <div class="button-row">
            <button class="primary-btn" data-save-job="${job.id}">${editCopy.save}</button>
            <button class="secondary-btn" data-cancel-edit>${editCopy.cancel}</button>
          </div>
          <div class="import-grid">
            <div class="field"><label>${editCopy.titleLabel}</label><input data-edit-job-id="${job.id}" data-edit-field="title" value="${escapeHtml(editForm.title)}" /></div>
            <div class="field"><label>${editCopy.employer}</label><input data-edit-job-id="${job.id}" data-edit-field="employer" value="${escapeHtml(editForm.employer)}" /></div>
            <div class="field full"><label>${editCopy.location}</label><input data-edit-job-id="${job.id}" data-edit-field="location" value="${escapeHtml(editForm.location)}" /></div>
            <div class="field full"><label>${editCopy.description}</label><textarea data-edit-job-id="${job.id}" data-edit-field="description">${escapeHtml(editForm.description)}</textarea></div>
          </div>
        </article>`
      : "";

  shell(`${topbar(job.employer)}
    <section class="detail-panel">
      <div class="detail-header">
        <div class="detail-title">
          <button class="ghost-btn" data-nav="/app">${icon("back")} العودة</button>
          <h1>${job.title}</h1>
          <p class="fit-note" data-fit-explanation>${escapeHtml(job.fit_explanation || "")}</p>
          <p>${job.employer} · ${job.location} · ${sourceLabel(job.source)}</p>
          <span class="small-chip gold">${STATUS_LABELS[job.status]}</span>
        </div>
        <span class="score-ring" style="--score:${job.score}">${job.score}%</span>
      </div>
      <div class="detail-actions">
        <button class="primary-btn" data-status-action="${job.id}">${job.status === "applied" ? "نقل للمتابعة" : "تسجيل التقديم"}</button>
        <button class="secondary-btn" data-nav="/assistant">فتح Ghostwriter</button>
        <button class="secondary-btn" data-edit-job="${job.id}">${editCopy.edit}</button>
        <button class="secondary-btn danger-btn" data-delete-job="${job.id}">${editCopy.delete}</button>
      </div>
      ${editPanel}
      <div class="workspace-grid">
        <article>
          <div class="tab-row">
            <button class="tab-btn ${state.activeTab === "resume" ? "active" : ""}" data-tab="resume">السيرة</button>
            <button class="tab-btn ${state.activeTab === "letter" ? "active" : ""}" data-tab="letter">الخطاب</button>
            <button class="tab-btn ${state.activeTab === "pdf" ? "active" : ""}" data-tab="pdf">PDF</button>
          </div>
          ${tabContent}
          <div class="assistant-card">
            <h2>وصف الوظيفة</h2>
            <p class="screen-note">${job.description}</p>
          </div>
        </article>
        <aside class="workspace-grid">
          ${applicationChecklistCard(job)}
          <section class="assistant-card">
            <h2>الخط الزمني</h2>
            <div class="timeline">${timeline}</div>
          </section>
          <section class="assistant-card">
            <h2>رسائل Gmail</h2>
            ${messages.length ? messages.map(messageCard).join("") : `<p class="screen-note">لا توجد رسائل مرتبطة بعد.</p>`}
          </section>
        </aside>
      </div>
    </section>`);
}

function timelineItem(item) {
  const category = item.category || "نشاط";
  return `<div class="timeline-item"><span class="timeline-dot ${item.tone}"></span><p><span class="timeline-meta"><span class="timeline-category" data-timeline-category="${escapeHtml(category)}">${escapeHtml(category)}</span><time>${escapeHtml(item.timestamp)}</time></span>${escapeHtml(item.label)}</p></div>`;
}

function activityFeedList(limit = Number.POSITIVE_INFINITY) {
  const items = (state.activity_feed || [])
    .filter((item) => state.activityFilter === "all" || item.category === state.activityFilter)
    .slice(0, limit);
  const body = items.length
    ? items
        .map(
          (item) => `<button class="activity-item" data-nav="/jobs/${item.job_id}"><span class="timeline-dot ${item.tone}"></span><span><span class="timeline-meta"><span class="timeline-category">${escapeHtml(item.category || "نشاط")}</span><time>${escapeHtml(item.timestamp)}</time></span><strong>${escapeHtml(item.job_title)}</strong><p>${escapeHtml(item.label)}</p><small>${escapeHtml(item.employer)}</small></span></button>`,
        )
        .join("")
    : `<p class="empty">لا توجد أنشطة بعد. ستظهر هنا تغييرات الحالة والمسودات والرسائل.</p>`;
  return `<div class="activity-feed" data-activity-feed>${body}</div>`;
}

function activityFilterBar() {
  const categories = [
    ["all", "الكل"],
    ...Array.from(new Set((state.activity_feed || []).map((item) => item.category).filter(Boolean))).map((category) => [
      category,
      category,
    ]),
  ];
  return `<div class="source-row activity-filter-row">${categories
    .map(
      ([id, label]) => `<button class="source-chip ${state.activityFilter === id ? "active" : ""}" data-activity-filter="${escapeHtml(id)}">${escapeHtml(label)}</button>`,
    )
    .join("")}</div>`;
}

function messageCard(message) {
  return `<div class="inbox-card"><strong>${message.subject}</strong><p class="screen-note">${message.sender}</p><span class="small-chip gold">${message.message_type}</span></div>`;
}

function renderDocuments() {
  const readyCount = state.packages.filter((pkg) => packageWorkflowLabel(pkg).includes("قابلة")).length;
  const summary = state.packages.length
    ? `<div class="docs-summary" data-docs-summary>
        <div><strong>${state.packages.length}</strong><span>حزم محفوظة</span></div>
        <div><strong>${readyCount}</strong><span>حزم جاهزة للتصدير</span></div>
        <div><strong>${state.jobs.length}</strong><span>وظائف في المسار</span></div>
      </div>`
    : `<p class="empty" data-docs-summary>لا توجد حزم بعد. افتح المساعد وجهز السيرة والخطاب لأول وظيفة.</p>`;
  const cards = state.packages.map((pkg) => {
    const job = state.jobs.find((candidate) => candidate.id === pkg.job_id);
    const previewHref = `/packages/${pkg.job_id}/preview`;
    const pdfHref = `/packages/${pkg.job_id}/export.pdf`;
    return `<article class="package-card package-editor" data-package-editor="${pkg.job_id}"><div class="package-heading"><div><strong>${pkg.resume_title}</strong><p class="screen-note">${job?.title || ""} · ${job?.employer || ""}</p></div><span class="small-chip teal" data-package-workflow="${pkg.job_id}">${packageWorkflowLabel(pkg)}</span></div><label class="field stack"><span>مسودة السيرة</span><textarea data-package-field="resume_body" data-job-id="${pkg.job_id}" rows="5">${escapeHtml(pkg.resume_body || "")}</textarea></label><label class="field stack"><span>مسودة الخطاب</span><textarea data-package-field="cover_letter_body" data-job-id="${pkg.job_id}" rows="5">${escapeHtml(pkg.cover_letter_body || "")}</textarea></label><span class="small-chip gold">${pkg.pdf_status}</span><div class="button-row"><button class="secondary-btn" data-save-package="${pkg.job_id}" data-save-package-draft="${pkg.job_id}">حفظ المسودات</button><a class="secondary-btn" data-package-preview="${pkg.job_id}" href="${previewHref}">معاينة PDF</a><a class="secondary-btn" data-package-pdf="${pkg.job_id}" href="${pdfHref}" download>تنزيل PDF</a></div>${packageHistoryList(pkg.job_id)}</article>`;
  }).join("");
  shell(`${topbar("السيرة والخطاب وملفات PDF")}
    <section class="detail-panel">
      <div class="section-title"><div><h1>السيرة والخطاب</h1><p>حزم تقديم مخصصة لكل وظيفة.</p></div></div>
      ${summary}
      <div class="source-grid">${cards}</div>
    </section>`);
}

function renderAssistant() {
  shell(`${topbar("محادثة لكل وظيفة")}
    <section class="detail-panel">
      <div class="section-title"><div><h1>المساعد</h1><p>اكتب طلبك بالعربية وسيقترح مسودة مناسبة.</p></div></div>
      ${assistantContext()}
      ${assistantComposer()}
    </section>`);
}

function packageWorkflowLabel(pkg) {
  const status = pkg.pdf_status || "";
  if (status.includes("يحتاج") || status.includes("مراجعة")) {
    return "تحتاج مراجعة";
  }
  return status ? "قابلة للتصدير" : "تحتاج مراجعة";
}

function renderAnalytics() {
  const counts = countByStatus();
  const total = state.jobs.length;
  const responseRate = Math.round((state.messages.length / Math.max(total, 1)) * 100);
  const metrics = [
    [`${total}`, "وظائف في المسار"],
    [`${counts.ready}`, "جاهزة للتقديم"],
    [`${counts.applied}`, "تم التقديم"],
    [`${responseRate}%`, "معدل الردود"],
  ].map(([value, label]) => `<div class="metric-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
  const bars = STATUS_ORDER.slice(0, 6).map((status) => {
    const count = counts[status];
    const width = Math.max(8, (count / Math.max(total, 1)) * 100);
    return `<div class="bar-row"><span>${STATUS_LABELS[status]}</span><span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span><span>${count}</span></div>`;
  }).join("");
  shell(`${topbar("قياس النتائج والمتابعة")}
    <section class="analytics-panel">
      <div class="section-title"><div><h1>النتائج</h1><p>لوحة قياس رحلة التقديم من الاكتشاف حتى الرد.</p></div></div>
      <div class="analytics-grid">${metrics}</div>
      <div class="assistant-card"><h2>المسار حسب الحالة</h2><div class="bar-chart">${bars}</div></div>
      <div class="assistant-card"><h2>آخر النشاطات</h2>${activityFilterBar()}${activityFeedList()}</div>
      <div class="assistant-card"><h2>متابعة Gmail</h2>${state.messages.map((message) => `<div class="inbox-card"><strong>${message.subject}</strong><p class="screen-note">${message.sender}</p><button class="secondary-btn" data-link-message="${message.id}">ربط بالخط الزمني</button></div>`).join("")}</div>
    </section>`);
}

function renderSourcesBase() {
  const cards = state.sources.map((source) => `<article class="package-card"><strong>${source.label}</strong><p class="screen-note">${source.region}</p><span class="small-chip ${source.enabled ? "teal" : ""}">${source.enabled ? "مفعل" : "يحتاج إعداد"}</span></article>`).join("");
  shell(`${topbar("مصادر البحث")}
    <section class="detail-panel">
      <div class="section-title"><div><h1>مصادر الوظائف</h1><p>مصادر عالمية وإقليمية مع خيار الإضافة اليدوية.</p></div></div>
      <div class="source-grid">${cards}</div>
    </section>`);
}

function renderSourcesMojibake() {
  const cards = state.sources.map((source) => `<article class="package-card"><strong>${source.label}</strong><p class="screen-note">${source.region}</p><span class="small-chip ${source.enabled ? "teal" : ""}">${source.enabled ? "Ù…ÙØ¹Ù„" : "ÙŠØ­ØªØ§Ø¬ Ø¥Ø¹Ø¯Ø§Ø¯"}</span></article>`).join("");
  const form = state.importForm;
  shell(`${topbar("Ù…ØµØ§Ø¯Ø± Ø§Ù„Ø¨Ø­Ø«")}
    <section class="detail-panel">
      <div class="section-title"><div><h1>Ù…ØµØ§Ø¯Ø± Ø§Ù„ÙˆØ¸Ø§Ø¦Ù</h1><p>Ù…ØµØ§Ø¯Ø± Ø¹Ø§Ù„Ù…ÙŠØ© ÙˆØ¥Ù‚Ù„ÙŠÙ…ÙŠØ© Ù…Ø¹ Ø®ÙŠØ§Ø± Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø§Ù„ÙŠØ¯ÙˆÙŠØ©.</p></div></div>
      <article class="assistant-card import-card">
        <div class="section-title"><div><h2>Ø¥Ø¶Ø§ÙØ© ÙˆØ¸ÙŠÙØ© Ù…Ù† Ø±Ø§Ø¨Ø·</h2><p>Ø§Ù„ØµÙ‚ Ø±Ø§Ø¨Ø· Ø§Ù„ÙˆØ¸ÙŠÙØ© Ø£Ùˆ Ø§Ù„Ù†ØµØŒ Ø«Ù… Ø­ÙˆÙ„Ù‡ Ø¥Ù„Ù‰ Ù…Ø³Ø§Ø­Ø© ØªÙ‚Ø¯ÙŠÙ… Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ù…ØªØ§Ø¨Ø¹Ø©.</p></div></div>
        <div class="import-grid">
          <div class="field full"><label>Ø§Ù„Ø±Ø§Ø¨Ø·</label><input data-import-field="url" value="${escapeHtml(form.url)}" placeholder="https://wuzzuf.net/jobs/..." inputmode="url" /></div>
          <div class="field"><label>Ø§Ù„Ù…Ø³Ù…Ù‰</label><input data-import-field="title" value="${escapeHtml(form.title)}" placeholder="Ù…Ù‡Ù†Ø¯Ø³ Rust" /></div>
          <div class="field"><label>Ø§Ù„Ø´Ø±ÙƒØ©</label><input data-import-field="employer" value="${escapeHtml(form.employer)}" placeholder="Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ©" /></div>
          <div class="field"><label>Ø§Ù„Ù…ÙˆÙ‚Ø¹</label><input data-import-field="location" value="${escapeHtml(form.location)}" placeholder="Ø§Ù„Ø±ÙŠØ§Ø¶ØŒ Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©" /></div>
          <div class="field full"><label>ÙˆØµÙ Ù…Ø®ØªØµØ±</label><textarea data-import-field="description" placeholder="Ø£Ù‡Ù… Ø§Ù„Ù…Ù‡Ø§Ù… ÙˆØ§Ù„Ù…ØªØ·Ù„Ø¨Ø§Øª">${escapeHtml(form.description)}</textarea></div>
        </div>
        <div class="button-row"><button class="primary-btn" data-import-job>${icon("source")} Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø³Ø§Ø­Ø© ÙˆØ¸ÙŠÙØ©</button></div>
      </article>
      <div class="source-grid">${cards}</div>
    </section>`);
}

function renderSources() {
  const copy = {
    enabled: "\u0645\u0641\u0639\u0644",
    needsSetup: "\u064a\u062d\u062a\u0627\u062c \u0625\u0639\u062f\u0627\u062f",
    title: "\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0628\u062d\u062b",
    heading: "\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0648\u0638\u0627\u0626\u0641",
    intro:
      "\u0645\u0635\u0627\u062f\u0631 \u0639\u0627\u0644\u0645\u064a\u0629 \u0648\u0625\u0642\u0644\u064a\u0645\u064a\u0629 \u0645\u0639 \u062e\u064a\u0627\u0631 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u064a\u062f\u0648\u064a\u0629.",
    importTitle:
      "\u0625\u0636\u0627\u0641\u0629 \u0648\u0638\u064a\u0641\u0629 \u0645\u0646 \u0631\u0627\u0628\u0637 \u0623\u0648 \u0646\u0635",
    importIntro:
      "\u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0623\u0648 \u0627\u0644\u0646\u0635 \u0627\u0644\u0643\u0627\u0645\u0644\u060c \u0648\u0633\u064a\u0633\u062a\u062e\u0631\u062c \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0633\u0645\u0649 \u0648\u0627\u0644\u0634\u0631\u0643\u0629 \u0648\u0627\u0644\u0645\u0648\u0642\u0639 \u0644\u0628\u0646\u0627\u0621 \u0645\u0633\u0627\u062d\u0629 \u062a\u0642\u062f\u064a\u0645.",
    url: "\u0627\u0644\u0631\u0627\u0628\u0637",
    role: "\u0627\u0644\u0645\u0633\u0645\u0649",
    rolePlaceholder: "\u0645\u0647\u0646\u062f\u0633 Rust",
    employer: "\u0627\u0644\u0634\u0631\u0643\u0629",
    employerPlaceholder: "\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629",
    location: "\u0627\u0644\u0645\u0648\u0642\u0639",
    locationPlaceholder:
      "\u0627\u0644\u0631\u064a\u0627\u0636\u060c \u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629",
    description: "\u0646\u0635 \u0627\u0644\u0648\u0638\u064a\u0641\u0629",
    descriptionPlaceholder:
      "Title: Senior Rust Backend Engineer\nCompany: Noon\nLocation: Riyadh, Saudi Arabia\n\nDescription:\n\u0627\u0644\u0635\u0642 \u0646\u0635 \u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0647\u0646\u0627 \u0623\u0648 \u0627\u0643\u062a\u0628 \u0627\u0644\u0645\u0647\u0627\u0645 \u0648\u0627\u0644\u0645\u062a\u0637\u0644\u0628\u0627\u062a.",
    create:
      "\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0648\u0645\u0631\u0627\u062c\u0639\u0629",
    reviewTitle:
      "\u0645\u0631\u0627\u062c\u0639\u0629 \u0642\u0628\u0644 \u0627\u0644\u0625\u0646\u0634\u0627\u0621",
    reviewIntro:
      "\u0631\u0627\u062c\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0623\u0639\u0644\u0627\u0647\u060c \u062b\u0645 \u0623\u0636\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0633\u0627\u0631.",
    sourceLabel:
      "\u0627\u0644\u0645\u0635\u062f\u0631",
    confirm:
      "\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0627\u062d\u0629 \u0648\u0638\u064a\u0641\u0629",
  };
  const cards = state.sources.map((source) => `<article class="package-card"><strong>${source.label}</strong><p class="screen-note">${source.region}</p><span class="small-chip ${source.enabled ? "teal" : ""}">${source.enabled ? copy.enabled : copy.needsSetup}</span></article>`).join("");
  const form = state.importForm;
  const activePreset =
    state.sources.find((source) => source.id === state.importPreset) ||
    state.sources.find((source) => source.id === "manual") ||
    state.sources[0];
  const presetCards = state.sources.map((source) => `<button class="source-preset ${state.importPreset === source.id ? "active" : ""}" data-source-preset="${source.id}">
          <strong>${source.label}</strong>
          <span>${source.region}</span>
        </button>`).join("");
  const preview = state.importPreview;
  const review = preview ? `<div class="import-review" data-import-review>
          <strong>${copy.reviewTitle}</strong>
          <div>
            <span class="small-chip teal">${copy.sourceLabel}: ${escapeHtml(preview.source)}</span>
            <h3>${escapeHtml(form.title)}</h3>
            <p class="fit-note">${escapeHtml(preview.fit_explanation || "")}</p>
            <p class="quality-note" data-extraction-quality>${escapeHtml(preview.extraction_summary || "")}</p>
            <p>${escapeHtml(form.employer)} · ${escapeHtml(form.location)}</p>
          </div>
          <p class="screen-note">${copy.reviewIntro}</p>
          <div class="button-row"><button class="primary-btn" data-confirm-import>${icon("source")} ${copy.confirm}</button></div>
        </div>` : "";
  shell(`${topbar(copy.title)}
    <section class="detail-panel">
      <div class="section-title"><div><h1>${copy.heading}</h1><p>${copy.intro}</p></div></div>
      <article class="assistant-card import-card">
        <div class="section-title"><div><h2>${copy.importTitle}</h2><p>${copy.importIntro}</p></div></div>
        <div class="button-row"><button class="primary-btn" data-import-job>${icon("source")} ${copy.create}</button></div>
        <div class="source-preset-row">${presetCards}</div>
        <div class="import-grid">
          <div class="field full"><label>${copy.url}</label><input data-import-field="url" value="${escapeHtml(form.url)}" placeholder="https://wuzzuf.net/jobs/..." inputmode="url" /><span data-import-preset-note>${escapeHtml(activePreset?.import_hint || "")}</span></div>
          <div class="field"><label>${copy.role}</label><input data-import-field="title" value="${escapeHtml(form.title)}" placeholder="${copy.rolePlaceholder}" /></div>
          <div class="field"><label>${copy.employer}</label><input data-import-field="employer" value="${escapeHtml(form.employer)}" placeholder="${copy.employerPlaceholder}" /></div>
          <div class="field"><label>${copy.location}</label><input data-import-field="location" value="${escapeHtml(form.location)}" placeholder="${copy.locationPlaceholder}" /></div>
          <div class="field full"><label>${copy.description}</label><textarea data-import-field="description" placeholder="${copy.descriptionPlaceholder}">${escapeHtml(form.description)}</textarea></div>
        </div>
        ${review}
      </article>
      <div class="source-grid">${cards}</div>
    </section>`);
}

function renderLoginStatic() {
  app.innerHTML = `<main class="login-page">
    <section class="login-panel">
      <div class="login-grid">
        <div class="login-card">
          <span class="brand-mark">J</span>
          <h1 class="brand-title">ابدأ رحلة التقديم</h1>
          <p class="screen-note">نموذج أولي لا يحفظ بيانات حقيقية. يوضح التسجيل، الملف المهني، وتفضيلات البحث في منطقة الشرق الأوسط وشمال أفريقيا.</p>
          <button class="primary-btn" data-nav="/app">دخول النموذج</button>
        </div>
        <form class="login-card">
          <div class="field"><label>الاسم</label><input value="جابر" /></div>
          <div class="field"><label>الدور المستهدف</label><input value="Rust / Product / UX" /></div>
          <div class="field"><label>المدينة</label><select><option>الرياض</option><option>دبي</option><option>القاهرة</option></select></div>
          <div class="field"><label>السيرة</label><input value="resume.pdf" /></div>
        </form>
      </div>
    </section>
  </main>`;
  setupEvents();
}

function renderLogin() {
  const copy = {
    title: "\u0627\u0628\u062f\u0623 \u0631\u062d\u0644\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645",
    intro:
      "\u0627\u062d\u0641\u0638 \u0645\u0644\u0641\u0643 \u0627\u0644\u0645\u0647\u0646\u064a\u060c \u0627\u0644\u0623\u062f\u0648\u0627\u0631 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629\u060c \u0648\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0628\u062d\u062b \u0644\u064a\u0633\u062a\u062e\u062f\u0645\u0647\u0627 \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0641\u064a \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0648\u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a.",
    openApp: "\u0641\u062a\u062d \u0645\u0631\u0643\u0632 \u0627\u0644\u0628\u062d\u062b",
    summary: "\u0645\u0644\u062e\u0635 \u0627\u0644\u0645\u0644\u0641",
    name: "\u0627\u0644\u0627\u0633\u0645",
    roles: "\u0627\u0644\u0623\u062f\u0648\u0627\u0631 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629",
    locations: "\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0628\u062d\u062b",
    language: "\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629",
    resume: "\u0627\u0644\u0633\u064a\u0631\u0629",
    skills: "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a",
    languages: "\u0644\u063a\u0627\u062a \u0627\u0644\u0639\u0645\u0644",
    seniority: "\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u062e\u0628\u0631\u0629",
    regions: "\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0648\u0627\u0644\u0645\u0646\u0627\u0637\u0642",
    examples: "\u0623\u0645\u062b\u0644\u0629 \u0639\u0645\u0644",
    pasteResume: "\u0644\u0635\u0642 \u0646\u0635 \u0627\u0644\u0633\u064a\u0631\u0629",
    previewResume: "\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u0645\u0644\u062e\u0635",
    applyResume: "\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u0644\u062e\u0635",
    save: "\u062d\u0641\u0638 \u0627\u0644\u0645\u0644\u0641",
    ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    en: "English",
  };
  const profile = state.profile || {};
  const resumePreview = state.resumePreview;
  const resumeReview = resumePreview
    ? `<div class="package-card" data-resume-preview>
          <strong>${escapeHtml(resumePreview.display_name)}</strong>
          <p class="screen-note">${escapeHtml(resumePreview.target_roles)} · ${escapeHtml(resumePreview.target_locations)}</p>
          <p class="screen-note">${escapeHtml(resumePreview.resume_skills)}</p>
          <span class="small-chip gold">${escapeHtml(resumePreview.extraction_summary)}</span>
          <div class="button-row"><button class="secondary-btn" data-apply-resume-preview>${copy.applyResume}</button></div>
        </div>`
    : "";
  app.innerHTML = `<main class="login-page">
    <section class="login-panel">
      ${feedbackBanner()}
      <div class="login-grid">
        <div class="login-card">
          <span class="brand-mark">J</span>
          <h1 class="brand-title">${copy.title}</h1>
          <p class="screen-note">${copy.intro}</p>
          <div class="package-card" data-profile-summary>
            <strong>${escapeHtml(profile.display_name || "جابر")}</strong>
            <p class="screen-note">${escapeHtml(profile.target_roles || "Rust / Product / UX")}</p>
            <p class="screen-note">${escapeHtml(profile.resume_skills || "Rust, SQL, dashboards")}</p>
            <span class="small-chip teal">${escapeHtml(profile.resume_filename || "resume.pdf")}</span>
          </div>
          <div class="button-row">
            <button class="primary-btn" data-save-profile>${copy.save}</button>
            <button class="secondary-btn" data-nav="/app">${copy.openApp}</button>
          </div>
        </div>
        <form class="login-card">
          <div class="field full"><label>${copy.pasteResume}</label><textarea data-resume-text placeholder="Name: ...&#10;Skills: Rust, SQL, dashboards">${escapeHtml(state.resumeText || "")}</textarea></div>
          <div class="button-row"><button class="secondary-btn" type="button" data-preview-resume>${copy.previewResume}</button></div>
          ${resumeReview}
          <div class="field"><label>${copy.name}</label><input data-profile-field="display_name" value="${escapeHtml(profile.display_name || "")}" /></div>
          <div class="field"><label>${copy.roles}</label><input data-profile-field="target_roles" value="${escapeHtml(profile.target_roles || "")}" /></div>
          <div class="field"><label>${copy.locations}</label><input data-profile-field="target_locations" value="${escapeHtml(profile.target_locations || "")}" /></div>
          <div class="field"><label>${copy.language}</label><select data-profile-field="preferred_language"><option value="ar" ${profile.preferred_language === "ar" ? "selected" : ""}>${copy.ar}</option><option value="en" ${profile.preferred_language === "en" ? "selected" : ""}>${copy.en}</option></select></div>
          <div class="field"><label>${copy.resume}</label><input data-profile-field="resume_filename" value="${escapeHtml(profile.resume_filename || "")}" placeholder="resume.pdf" /></div>
          <div class="field"><label>${copy.skills}</label><input data-profile-field="resume_skills" value="${escapeHtml(profile.resume_skills || "")}" placeholder="Rust, SQL, dashboards" /></div>
          <div class="field"><label>${copy.languages}</label><input data-profile-field="resume_languages" value="${escapeHtml(profile.resume_languages || "")}" placeholder="Arabic, English" /></div>
          <div class="field"><label>${copy.seniority}</label><input data-profile-field="resume_seniority" value="${escapeHtml(profile.resume_seniority || "")}" placeholder="Senior" /></div>
          <div class="field"><label>${copy.regions}</label><input data-profile-field="resume_regions" value="${escapeHtml(profile.resume_regions || "")}" placeholder="Saudi Arabia, UAE, Egypt" /></div>
          <div class="field full"><label>${copy.examples}</label><textarea data-profile-field="resume_work_examples" placeholder="Built Arabic job-search workflows and analytics dashboards.">${escapeHtml(profile.resume_work_examples || "")}</textarea></div>
        </form>
      </div>
    </section>
  </main>`;
  setupEvents();
}

function render() {
  const route = currentRoute();
  if (route === "login") return renderLogin();
  if (route.startsWith("jobs/")) return renderJob(route);
  if (route === "documents") return renderDocuments();
  if (route === "assistant") return renderAssistant();
  if (route === "analytics") return renderAnalytics();
  if (route === "settings/sources") return renderSources();
  return renderApp();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  const response = await fetch("/api/bootstrap");
  const data = await response.json();
  state = { ...state, ...data };
  if (location.pathname === "/") {
    history.replaceState(null, "", "/app");
  }
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

window.addEventListener("popstate", render);
init();
