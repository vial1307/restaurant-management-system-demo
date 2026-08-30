import { flatSkillCatalog, normalizeCustomSkill, normalizeSkillAssessment, normalizeSkillProfiles } from "./skills.js";

export const STAFF_ROLES = [
  { id: "manager", vi: "Quản lý", zh: "管理者" },
  { id: "supervisor", vi: "Tổ trưởng", zh: "組長" },
  { id: "employee", vi: "Nhân viên", zh: "員工" },
  { id: "parttime", vi: "Part-time", zh: "兼職" },
];

const ROLE_PERMISSIONS = {
  manager: ["sop:edit", "sop:approve", "sop:delete", "skills:manage", "skills:evaluate", "skills:approve", "staff:manage", "attendance:manage", "reports:export", "checks:record", "schedule:manage", "jobs:manage", "tasks:assign"],
  supervisor: ["sop:edit", "skills:evaluate", "attendance:manage", "reports:export", "checks:record"],
  employee: ["checks:record"],
  parttime: ["checks:record"],
};

export const STAFFING_SHIFTS = [
  { id: "morning", vi: "Ca sáng", zh: "早班", start: "10:00", end: "16:00" },
  { id: "evening", vi: "Ca tối", zh: "晚班", start: "16:00", end: "22:00" },
  { id: "full", vi: "Ca cả ngày", zh: "全天班", start: "10:00", end: "22:00" },
  { id: "custom", vi: "Tùy chỉnh", zh: "自訂", start: "", end: "" },
];

export const DEPARTMENTS = [
  { id: "inside", vi: "Trong bếp", zh: "內場" },
  { id: "outside", vi: "Ngoài sảnh", zh: "外場" },
];

const DEFAULT_JOB_CATALOG = [
  { id: "job-noodles-open", department: "inside", area: "noodles", label: "麵區開班", labelVi: "Mở ca khu mì", sopArea: "noodles", evidence: "photo", active: true },
  { id: "job-soup-open", department: "inside", area: "soup", label: "湯區開班", labelVi: "Mở ca khu canh", sopArea: "soup", evidence: "check", active: true },
  { id: "job-seafood-thaw", department: "inside", area: "seafood", label: "海鮮退冰檢查", labelVi: "Kiểm tra rã đông hải sản", sopArea: "seafood", evidence: "photo", active: true },
  { id: "job-meat-layout", department: "inside", area: "meat", label: "肉品擺盤", labelVi: "Sắp xếp khu thịt", sopArea: "meat", evidence: "photo", active: true },
  { id: "job-table-service", department: "outside", area: "service", label: "桌邊服務", labelVi: "Phục vụ bàn", sopArea: "", evidence: "check", active: true },
  { id: "job-cashier-close", department: "outside", area: "cashier", label: "收銀對帳", labelVi: "Đối soát thu ngân", sopArea: "", evidence: "approval", active: true },
];

export const MENU_CATALOG = [
  { id: "menu-handmade-noodles", label: "手工麵", labelVi: "Mì thủ công", area: "noodles", frequency: "common", sopId: "sop-handmade-noodles" },
  { id: "menu-thin-noodles", label: "細麵", labelVi: "Mì sợi nhỏ", area: "noodles", frequency: "common", sopId: "sop-thin-noodles" },
  { id: "menu-original-broth", label: "原味湯底", labelVi: "Nước canh nguyên vị", area: "soup", frequency: "common", sopId: "sop-original-broth" },
  { id: "menu-shrimp", label: "白蝦", labelVi: "Tôm trắng", area: "seafood", frequency: "common", sopId: "sop-shrimp" },
  { id: "menu-clams", label: "蛤蜊", labelVi: "Nghêu", area: "seafood", frequency: "common", sopId: "sop-clams" },
  { id: "menu-beef-brisket", label: "牛胸肉", labelVi: "Thịt ức bò", area: "meat", frequency: "common", sopId: "sop-beef-brisket" },
  { id: "menu-pork", label: "豬肉", labelVi: "Thịt heo", area: "meat", frequency: "common", sopId: "sop-pork" },
  { id: "menu-silver-ear", label: "銀耳基底", labelVi: "Nền chè nấm tuyết", area: "soup", frequency: "rare", sopId: "" },
  { id: "menu-tapioca", label: "山粉圓", labelVi: "Hạt sơn phấn viên", area: "soup", frequency: "rare", sopId: "" },
  { id: "menu-shishang", label: "食尚", labelVi: "Món hải sản 食尚", area: "seafood", frequency: "rare", sopId: "" },
  { id: "menu-chuanwei", label: "川味", labelVi: "Món vị Tứ Xuyên", area: "seafood", frequency: "rare", sopId: "" },
  { id: "menu-dumplings", label: "餃類", labelVi: "Nhóm món sủi cảo", area: "seafood", frequency: "rare", sopId: "" },
];

export const TRAINING_STATUSES = ["assigned", "practicing", "pending_check", "passed"];

const DEFAULT_TRAINING_RECORDS = [
  { id: "training-hd-silver-ear", assigneeName: "鄭文海登", label: "銀耳基底（剪＋上爐）", labelVi: "Nền chè nấm tuyết: cắt và đưa lên bếp", category: "menu", area: "soup", menuItemId: "menu-silver-ear", sopId: "", skillId: "sop-sequence", status: "pending_check", attempts: 1, note: "教育完成，待獨立實作確認 / Đã hướng dẫn, chờ kiểm tra làm độc lập" },
  { id: "training-hd-tapioca", assigneeName: "鄭文海登", label: "山粉圓煮法", labelVi: "Cách nấu hạt sơn phấn viên", category: "menu", area: "soup", menuItemId: "menu-tapioca", sopId: "", skillId: "timer-operation", status: "pending_check", attempts: 1, note: "教育完成，待實際出餐確認 / Đã học, chờ kiểm tra khi xuất món thực tế" },
  { id: "training-hd-inventory", assigneeName: "鄭文海登", label: "津鼎盤點第一次", labelVi: "Kiểm kê Jinding lần đầu", category: "external", area: "noodles", menuItemId: "", sopId: "", skillId: "count-stock", status: "pending_check", attempts: 1, note: "已完成第一次盤點；下次需自行完成 / Đã kiểm kê lần đầu, lần sau cần tự làm" },
  { id: "training-hd-products", assigneeName: "鄭文海登", label: "認識產品及叫貨數量", labelVi: "Nhận biết sản phẩm và số lượng gọi hàng", category: "external", area: "noodles", menuItemId: "", sopId: "", skillId: "delivery-schedule", status: "practicing", attempts: 1, note: "需結合庫存、到貨日與供應商休假 / Cần kết hợp tồn kho, lịch giao và ngày nghỉ nhà cung cấp" },
  { id: "training-hd-dessert", assigneeName: "鄭文海登", label: "外場喊甜點會出餐", labelVi: "Nghe sảnh gọi món tráng miệng và xuất món", category: "external", area: "soup", menuItemId: "", sopId: "", skillId: "understand-kitchen-calls", status: "practicing", attempts: 1, note: "需觀察尖峰時是否仍能正確出餐 / Cần quan sát thêm trong giờ cao điểm" },
  { id: "training-lun-order", assigneeName: "Lun", label: "第二次叫貨：自行盤點填寫，主管核對", labelVi: "Gọi hàng lần hai: tự kiểm kê, tự điền, quản lý đối chiếu", category: "external", area: "noodles", menuItemId: "", sopId: "", skillId: "restock-vs-order", status: "assigned", attempts: 0, note: "主管只核對結果，不代替填寫 / Quản lý chỉ kiểm tra, không làm thay" },
  { id: "training-nam-shishang", assigneeName: "阮進成南", label: "海鮮台－食尚", labelVi: "Khu hải sản – món 食尚", category: "menu", area: "seafood", menuItemId: "menu-shishang", sopId: "", skillId: "sop-sequence", status: "pending_check", attempts: 1, note: "已教育，待獨立出餐測試 / Đã học, chờ kiểm tra xuất món độc lập" },
  { id: "training-nam-chuanwei", assigneeName: "阮進成南", label: "海鮮台－川味", labelVi: "Khu hải sản – món vị Tứ Xuyên", category: "menu", area: "seafood", menuItemId: "menu-chuanwei", sopId: "", skillId: "sop-sequence", status: "pending_check", attempts: 1, note: "已教育，待獨立出餐測試 / Đã học, chờ kiểm tra xuất món độc lập" },
  { id: "training-nam-dumplings", assigneeName: "阮進成南", label: "海鮮台－餃類", labelVi: "Khu hải sản – nhóm món sủi cảo", category: "menu", area: "seafood", menuItemId: "menu-dumplings", sopId: "", skillId: "timer-operation", status: "pending_check", attempts: 1, note: "已教育，待確認不同品項時間 / Đã học, cần kiểm tra thời gian từng loại" },
  { id: "training-nam-chicken", assigneeName: "阮進成南", label: "雞肉切法", labelVi: "Kỹ thuật cắt thịt gà", category: "station", area: "meat", menuItemId: "", sopId: "", skillId: "knife-cut-standard", status: "practicing", attempts: 2, note: "已練習兩次，切法仍需加強 / Đã luyện hai lần, cần tiếp tục sửa kỹ thuật cắt" },
  { id: "training-lun-schedule", assigneeName: "Lun", label: "教育訓練排程持續發布於崗位表", labelVi: "Tiếp tục đăng lịch đào tạo trên bảng vị trí", category: "external", area: "noodles", menuItemId: "", sopId: "", skillId: "teach-sop", status: "assigned", attempts: 0, note: "持續性管理工作 / Công việc quản lý cần duy trì" },
];

export function normalizeTrainingRecord(input = {}) {
  const status = TRAINING_STATUSES.includes(input.status) ? input.status : "assigned";
  return {
    id: String(input.id || `training-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    assigneeName: String(input.assigneeName || "").trim(),
    label: String(input.label || input.labelVi || "").trim(),
    labelVi: String(input.labelVi || input.label || "").trim(),
    category: ["menu", "station", "external"].includes(input.category) ? input.category : "external",
    area: ["noodles", "soup", "seafood", "meat"].includes(input.area) ? input.area : "noodles",
    menuItemId: String(input.menuItemId || ""),
    sopId: String(input.sopId || ""),
    skillId: String(input.skillId || ""),
    status,
    attempts: Math.max(0, Math.round(Number(input.attempts) || 0)),
    note: String(input.note || "").trim(),
  };
}

export const DEFAULT_PAYROLL_POLICY = {
  latePenaltyEnabled: false,
  lateGraceMinutes: 0,
  latePenaltyAmount: 0,
  latePenaltyMode: "fixed",
  note: "",
};

const SOP_EXAMPLES = [
  {
    id: "sop-handmade-noodles", area: "noodles", label: "手工麵", labelVi: "Mì thủ công", cookSeconds: 180,
    dineContainer: "深口麵碗", takeawayContainer: "外帶麵盒＋防漏蓋",
    dineNote: "依內用標準裝碗", takeawayNote: "麵、湯分開包裝",
    plating: "麵條置中；實際配料位置待門市確認",
    utensils: [{ name: "湯勺 / Muỗng canh", cc: 120, count: 2 }, { name: "醬勺 / Muỗng sốt", cc: 30, count: 1 }],
    steps: ["確認麵種與份量 / Kiểm tra loại và lượng mì", "依設定時間煮麵 / Nấu theo thời gian quy định", "選擇內用碗或外帶盒 / Chọn bát hoặc hộp", "確認擺盤後出餐 / Kiểm tra trình bày"],
  },
  {
    id: "sop-thin-noodles", area: "noodles", label: "細麵", labelVi: "Mì sợi nhỏ", cookSeconds: 150,
    dineContainer: "白色麵碗", takeawayContainer: "圓形外帶麵盒",
    dineNote: "依門市標準使用內用碗", takeawayNote: "醬料獨立包裝",
    plating: "配料位置待門市確認", utensils: [{ name: "湯勺 / Muỗng canh", cc: 100, count: 2 }],
    steps: ["確認麵條份量 / Kiểm tra lượng mì", "計時煮麵 / Bấm giờ nấu", "依出餐方式裝碗或裝盒 / Cho vào bát hoặc hộp"],
  },
  {
    id: "sop-original-broth", area: "soup", label: "原味湯底", labelVi: "Nước canh nguyên vị", cookSeconds: 60,
    dineContainer: "內用湯碗", takeawayContainer: "防漏湯杯＋杯蓋",
    dineNote: "使用指定湯碗及湯匙", takeawayNote: "杯蓋壓緊並分開包裝",
    plating: "湯量及配料位置待門市確認", utensils: [{ name: "湯勺 / Vá canh", cc: 180, count: 2 }, { name: "調味匙 / Thìa nêm", cc: 15, count: 1 }],
    steps: ["確認湯底種類 / Kiểm tra loại nước canh", "依勺數盛湯 / Múc đúng số vá", "核對內用或外帶容器 / Chọn dụng cụ phù hợp"],
  },
  {
    id: "sop-shrimp", area: "seafood", label: "白蝦", labelVi: "Tôm trắng", cookSeconds: 0,
    dineContainer: "橢圓海鮮盤", takeawayContainer: "海鮮外帶保鮮盒",
    dineNote: "使用指定海鮮盤", takeawayNote: "與其他食材分開包裝",
    plating: "蝦頭同方向，依實際照片及門市確認的數量排列",
    utensils: [{ name: "醬料勺 / Muỗng sốt", cc: 30, count: 1 }],
    steps: ["確認品項及數量 / Kiểm tra loại và số lượng", "選擇指定海鮮盤 / Chọn đĩa hải sản", "依實拍照片排列 / Xếp theo ảnh thực tế"],
  },
  {
    id: "sop-clams", area: "seafood", label: "蛤蜊", labelVi: "Nghêu", cookSeconds: 0,
    dineContainer: "小圓海鮮盤", takeawayContainer: "小型保鮮盒",
    dineNote: "使用指定小圓盤", takeawayNote: "使用指定防漏盒",
    plating: "數量與排列方式依門市實拍確認", utensils: [],
    steps: ["確認數量 / Kiểm tra số lượng", "選擇指定容器 / Chọn dụng cụ", "依標準照片擺盤 / Trình bày theo ảnh"],
  },
  {
    id: "sop-beef-brisket", area: "meat", label: "牛胸肉", labelVi: "Thịt ức bò", cookSeconds: 0,
    dineContainer: "長方形肉盤", takeawayContainer: "肉品保鮮盒＋封膜",
    dineNote: "使用指定長方肉盤", takeawayNote: "確認保鮮盒與封膜",
    plating: "肉片同方向排列；層數與間距依實際照片確認",
    utensils: [{ name: "醬料匙 / Thìa sốt", cc: 15, count: 1 }],
    steps: ["確認肉品與份量 / Kiểm tra loại và phần thịt", "選擇指定肉盤 / Chọn đĩa thịt", "依照片方向排列 / Xếp theo ảnh thực tế"],
  },
  {
    id: "sop-pork", area: "meat", label: "豬肉", labelVi: "Thịt heo", cookSeconds: 0,
    dineContainer: "圓形肉盤", takeawayContainer: "肉品外帶盒",
    dineNote: "使用指定內用肉盤", takeawayNote: "使用指定外帶盒",
    plating: "依門市照片確認肉片方向與間距", utensils: [],
    steps: ["確認肉品份量 / Kiểm tra phần thịt", "依實際照片擺盤 / Xếp theo ảnh thực tế"],
  },
];

function clone(value) {
  return structuredClone(value);
}

export function normalizeSop(input = {}) {
  return {
    id: String(input.id || `sop-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`),
    area: ["noodles", "soup", "seafood", "meat"].includes(input.area) ? input.area : "noodles",
    label: String(input.label ?? "").trim(),
    labelVi: String(input.labelVi ?? "").trim(),
    cookSeconds: Math.max(0, Math.round(Number(input.cookSeconds) || 0)),
    dineContainer: String(input.dineContainer ?? "").trim(),
    takeawayContainer: String(input.takeawayContainer ?? "").trim(),
    dineNote: String(input.dineNote ?? "").trim(),
    takeawayNote: String(input.takeawayNote ?? "").trim(),
    plating: String(input.plating ?? "").trim(),
    utensils: Array.isArray(input.utensils)
      ? input.utensils.map((item) => ({ name: String(item.name ?? "").trim(), cc: Math.max(0, Number(item.cc) || 0), count: Math.max(1, Number(item.count) || 1) })).filter((item) => item.name)
      : [],
    steps: Array.isArray(input.steps) ? input.steps.map((step) => String(step).trim()).filter(Boolean) : [],
    photos: Array.isArray(input.photos) ? input.photos.map((photo) => ({ id: String(photo.id ?? `photo-${Date.now()}`), name: String(photo.name ?? "photo"), src: String(photo.src ?? "") })).filter((photo) => photo.src.startsWith("data:image/")) : [],
  };
}

function defaultSop(input) {
  const details = normalizeSop(input);
  const snapshot = clone(details);
  return {
    ...details,
    revision: 1,
    status: "published",
    pending: null,
    updatedAt: null,
    updatedBy: null,
    versions: [{ number: 1, status: "published", at: null, editor: "system", approver: "system", snapshot }],
  };
}

export function createOperationalState(settings = {}) {
  return {
    sops: SOP_EXAMPLES.map(defaultSop),
    staff: [{ id: "staff-manager", name: String(settings.employeeName || "阿南"), role: "manager", area: "noodles", hourlyRate: 230, active: true, pin: "" }],
    activeStaffId: "staff-manager",
    learning: [],
    inspections: [],
    attendance: [],
    audit: [],
    payroll: clone(DEFAULT_PAYROLL_POLICY),
    schedules: [],
    jobCatalog: clone(DEFAULT_JOB_CATALOG),
    customSkills: [],
    skillProfiles: { noodles: {}, soup: {}, seafood: {}, meat: {} },
    skillAssessments: [],
    skillApprovals: [],
    menuCatalog: clone(MENU_CATALOG),
    trainingRecords: clone(DEFAULT_TRAINING_RECORDS),
    pendingSync: 0,
  };
}

export function hydrateOperations(input, settings = {}) {
  const fallback = createOperationalState(settings);
  if (!input || typeof input !== "object") return fallback;
  const staff = Array.isArray(input.staff) && input.staff.length
    ? input.staff.map((item) => ({ id: String(item.id), name: String(item.name || "員工"), role: STAFF_ROLES.some((role) => role.id === item.role) ? item.role : "employee", area: item.area || "noodles", hourlyRate: Math.max(0, Number(item.hourlyRate) || 0), active: item.active !== false, pin: String(item.pin ?? "") }))
    : fallback.staff;
  const sops = Array.isArray(input.sops)
    ? input.sops.map((item) => ({ ...normalizeSop(item), revision: Number.isFinite(Number(item.revision)) ? Math.max(0, Number(item.revision)) : 1, status: item.status || "published", pending: item.pending ? normalizeSop(item.pending) : null, updatedAt: item.updatedAt || null, updatedBy: item.updatedBy || null, versions: Array.isArray(item.versions) ? item.versions : [] }))
    : fallback.sops;
  const customSkills = Array.isArray(input.customSkills) ? input.customSkills.map(normalizeCustomSkill).filter(Boolean) : [];
  const validSkillIds = flatSkillCatalog(customSkills).map((skill) => skill.id);
  const skillProfiles = normalizeSkillProfiles(input.skillProfiles, validSkillIds);
  const skillAssessments = Array.isArray(input.skillAssessments)
    ? input.skillAssessments.map((entry) => normalizeSkillAssessment(entry, validSkillIds)).filter(Boolean)
    : [];
  const skillApprovals = Array.isArray(input.skillApprovals)
    ? input.skillApprovals.filter((entry) => entry && String(entry.staffId || "") && ["noodles", "soup", "seafood", "meat"].includes(entry.area) && ["D", "C", "B", "A"].includes(entry.level)).map((entry) => ({ ...entry, staffId: String(entry.staffId), level: String(entry.level) }))
    : [];

  return {
    sops,
    staff,
    activeStaffId: staff.some((item) => item.id === input.activeStaffId && item.active) ? input.activeStaffId : staff.find((item) => item.active)?.id || staff[0].id,
    learning: Array.isArray(input.learning) ? input.learning : [],
    inspections: Array.isArray(input.inspections) ? input.inspections : [],
    attendance: Array.isArray(input.attendance) ? input.attendance : [],
    audit: Array.isArray(input.audit) ? input.audit : [],
    payroll: { ...clone(DEFAULT_PAYROLL_POLICY), ...(input.payroll || {}) },
    schedules: Array.isArray(input.schedules) ? input.schedules.map(normalizeSchedule).filter(Boolean) : [],
    jobCatalog: Array.isArray(input.jobCatalog) && input.jobCatalog.length
      ? input.jobCatalog.map(normalizeJob).filter(Boolean)
      : fallback.jobCatalog,
    customSkills,
    skillProfiles,
    skillAssessments,
    skillApprovals,
    menuCatalog: Array.isArray(input.menuCatalog) && input.menuCatalog.length ? input.menuCatalog : fallback.menuCatalog,
    trainingRecords: Array.isArray(input.trainingRecords) && input.trainingRecords.length
      ? input.trainingRecords.map(normalizeTrainingRecord).filter((entry) => entry.assigneeName && (entry.label || entry.labelVi))
      : fallback.trainingRecords,
    pendingSync: Math.max(0, Number(input.pendingSync) || 0),
  };
}

export function normalizeSchedule(input = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? String(input.date) : "";
  const month = /^\d{4}-\d{2}$/.test(String(input.month || "")) ? String(input.month) : date.slice(0, 7);
  const applyMode = input.applyMode === "month" ? "month" : "day";
  if (!date || !String(input.staffId || "")) return null;
  return {
    id: String(input.id || `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    date,
    month,
    weekday: Number.isInteger(Number(input.weekday)) ? Number(input.weekday) : new Date(`${date}T12:00:00`).getDay(),
    applyMode,
    staffId: String(input.staffId),
    staffName: String(input.staffName || ""),
    department: input.department === "outside" ? "outside" : "inside",
    area: String(input.area || (input.department === "outside" ? "service" : "noodles")),
    shift: STAFFING_SHIFTS.some((item) => item.id === input.shift) ? input.shift : "evening",
    start: String(input.start || "16:00"),
    end: String(input.end || "22:00"),
    note: String(input.note || ""),
  };
}

export function normalizeJob(input = {}) {
  const label = String(input.label || "").trim();
  const labelVi = String(input.labelVi || "").trim();
  if (!label && !labelVi) return null;
  return {
    id: String(input.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    department: input.department === "outside" ? "outside" : "inside",
    area: String(input.area || "noodles"),
    label: label || labelVi,
    labelVi: labelVi || label,
    sopArea: String(input.sopArea || ""),
    evidence: ["check", "photo", "approval"].includes(input.evidence) ? input.evidence : "check",
    active: input.active !== false,
  };
}

export function staffingRequirement(dinnerTables) {
  const tables = Math.max(0, Math.round(Number(dinnerTables) || 0));
  if (tables >= 4 && tables <= 6) return { tables, requiredInside: 3, fixedAreas: false, needsReview: false };
  if (tables >= 7 && tables <= 12) return { tables, requiredInside: 4, fixedAreas: true, needsReview: false };
  return { tables, requiredInside: tables < 4 ? 2 : 4, fixedAreas: tables > 12, needsReview: true };
}

export function schedulesForDate(operations, date, shift = "evening") {
  const month = String(date).slice(0, 7);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (operations?.schedules || []).filter((entry) => {
    const applies = entry.applyMode === "month"
      ? entry.month === month && Number(entry.weekday) === weekday
      : entry.date === date;
    const coversShift = entry.shift === shift || entry.shift === "full" || entry.shift === "custom";
    return applies && coversShift;
  });
}

export function qualifiedAreas(operations, staffId) {
  const areas = ["noodles", "soup", "seafood", "meat"];
  return areas.filter((area) => {
    const standards = (operations?.sops || []).filter((sop) => sop.area === area && sop.revision > 0);
    return standards.length > 0 && standards.every((sop) => (operations?.learning || []).some((entry) => entry.staffId === staffId && entry.sopId === sop.id && entry.revision === sop.revision));
  });
}

export function assessShiftCapacity(state, date, shift = "evening") {
  const record = state.records[date];
  const requirement = staffingRequirement(record?.reservation?.dinnerTables || 0);
  const entries = schedulesForDate(state.operations, date, shift);
  const inside = entries.filter((entry) => entry.department === "inside");
  const outside = entries.filter((entry) => entry.department === "outside");
  const requiredAreas = ["noodles", "soup", "seafood", "meat"];
  const coveredAreas = new Set();
  for (const entry of inside) {
    const qualified = qualifiedAreas(state.operations, entry.staffId);
    if (qualified.includes(entry.area)) coveredAreas.add(entry.area);
    if (!requirement.fixedAreas) qualified.forEach((area) => coveredAreas.add(area));
  }
  const missingAreas = requiredAreas.filter((area) => !coveredAreas.has(area));
  const overloaded = inside.length < requirement.requiredInside || (requirement.fixedAreas && missingAreas.length > 0);
  return { ...requirement, entries, inside, outside, coveredAreas: [...coveredAreas], missingAreas, overloaded };
}

export function currentStaff(state) {
  return state.operations.staff.find((item) => item.id === state.operations.activeStaffId) || state.operations.staff[0];
}

export function roleCan(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.includes(permission));
}

export function roleLabel(role, language = "vi") {
  const match = STAFF_ROLES.find((item) => item.id === role);
  return match ? match[language] : role;
}

export function calculateAttendance(entry, payroll = DEFAULT_PAYROLL_POLICY) {
  const start = new Date(entry.clockIn || "invalid").getTime();
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : NaN;
  const totalMinutes = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 60_000) - Math.max(0, Number(entry.breakMinutes) || 0))
    : 0;
  const hourlyRate = Math.max(0, Number(entry.hourlyRate) || 0);
  const gross = Math.round(totalMinutes / 60 * hourlyRate);
  let lateMinutes = 0;

  if (Number.isFinite(start) && /^\d{2}:\d{2}$/.test(String(entry.scheduledStart || ""))) {
    const scheduled = new Date(`${entry.date}T${entry.scheduledStart}:00`).getTime();
    if (Number.isFinite(scheduled)) lateMinutes = Math.max(0, Math.round((start - scheduled) / 60_000));
  }

  const grace = Math.max(0, Number(payroll.lateGraceMinutes) || 0);
  const penaltyAmount = Math.max(0, Number(payroll.latePenaltyAmount) || 0);
  const chargeableMinutes = Math.max(0, lateMinutes - grace);
  const deduction = payroll.latePenaltyEnabled && penaltyAmount > 0 && chargeableMinutes > 0
    ? payroll.latePenaltyMode === "per-minute" ? chargeableMinutes * penaltyAmount : penaltyAmount
    : 0;

  return { totalMinutes, hours: Math.round(totalMinutes / 60 * 100) / 100, hourlyRate, gross, lateMinutes, deduction, net: Math.max(0, gross - deduction), complete: Number.isFinite(end) };
}

export function attendanceTotals(entries, payroll = DEFAULT_PAYROLL_POLICY) {
  return entries.reduce((summary, entry) => {
    const calculated = calculateAttendance(entry, payroll);
    summary.minutes += calculated.totalMinutes;
    summary.gross += calculated.gross;
    summary.deduction += calculated.deduction;
    summary.net += calculated.net;
    summary.late += calculated.lateMinutes > 0 ? 1 : 0;
    return summary;
  }, { minutes: 0, gross: 0, deduction: 0, net: 0, late: 0 });
}

export function learningFor(operations, sopId, staffId) {
  return operations.learning.find((entry) => entry.sopId === sopId && entry.staffId === staffId) || null;
}

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function excelWorkbook(title, columns, rows) {
  const rowMarkup = (values, header = false) => `<Row>${values.map((value) => `<Cell${header ? ' ss:StyleID="Header"' : ""}><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`).join("")}</Row>`;
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF4ED" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="${xmlEscape(String(title).slice(0, 31))}"><Table>${rowMarkup(columns, true)}${rows.map((row) => rowMarkup(row)).join("")}</Table></Worksheet></Workbook>`;
}
