export const SKILL_ASSIGNMENT_STATUSES = ["core", "scored", "reference", "inactive"];

export const SKILL_GROUPS = [
  {
    id: "language",
    vi: "Đọc hiểu và giao tiếp trong bếp",
    zh: "出單閱讀與廚房溝通",
    skills: [
      { id: "read-dish-names", critical: true, vi: { title: "Nhận biết tên món và loại nguyên liệu", detail: "Đọc đúng tên món, loại mì, loại thịt, nước dùng, gia vị và bao bì thường dùng tại khu." }, zh: { title: "看得懂品名與原料名稱", detail: "能正確辨認本站會用到的餐點、麵種、肉品、湯底、調味料與包材名稱。" } },
      { id: "read-order-ticket", critical: true, vi: { title: "Đọc chính xác phiếu món", detail: "Xác định đúng số lượng, số bàn, dùng tại quán/mang đi và các ghi chú thêm, bớt hoặc không dùng." }, zh: { title: "正確讀懂出單內容", detail: "能確認數量、桌號、內用／外帶，以及加料、減量、不加等備註。" } },
      { id: "recognize-similar-words", critical: true, vi: { title: "Phân biệt các chữ và món dễ nhầm", detail: "Không nhầm những tên có mặt chữ hoặc cách gọi gần giống nhau; biết dừng lại hỏi khi chưa chắc." }, zh: { title: "分辨容易看錯的字與品項", detail: "不混淆字形或叫法相近的品項；不確定時會先確認，不自行猜測。" } },
      { id: "understand-kitchen-calls", vi: { title: "Nghe hiểu khẩu lệnh trong bếp", detail: "Nghe được tên món, số lượng, món gấp, món làm lại và yêu cầu hỗ trợ trong môi trường ồn." }, zh: { title: "聽懂廚房口令", detail: "在吵雜環境中仍能聽懂品項、數量、催單、重做與支援需求。" } },
      { id: "repeat-back", vi: { title: "Xác nhận lại thông tin quan trọng", detail: "Nhắc lại món, số lượng và yêu cầu đặc biệt để tránh sai do nghe nhầm hoặc khác ngôn ngữ." }, zh: { title: "重要資訊會覆誦確認", detail: "針對品項、數量與特殊需求進行覆誦，降低口音或語言差異造成的錯誤。" } },
      { id: "read-label-dates", critical: true, vi: { title: "Đọc nhãn ngày và trạng thái bảo quản", detail: "Hiểu ngày mở bao, ngày sơ chế, hạn dùng và các nhãn đông lạnh, làm mát, sống, chín." }, zh: { title: "看得懂日期與保存標示", detail: "能辨認開封日、製作日、使用期限，以及冷凍、冷藏、生食、熟食等標示。" } },
    ],
  },
  {
    id: "ingredients",
    vi: "Nhận biết nguyên liệu và chất lượng",
    zh: "原料辨識與品質判斷",
    skills: [
      { id: "identify-ingredients", critical: true, vi: { title: "Nhận đúng nguyên liệu", detail: "Nhận biết nguyên liệu bằng tên, hình dạng, bao bì và vị trí; không chỉ lấy theo thói quen." }, zh: { title: "正確辨識原料", detail: "可由名稱、外觀、包裝與存放位置確認原料，不只靠習慣拿取。" } },
      { id: "ingredient-condition", critical: true, vi: { title: "Phát hiện nguyên liệu bất thường", detail: "Nhận ra màu, mùi, độ tươi, kết cấu hoặc bao bì bất thường và dừng sử dụng để báo quản lý." }, zh: { title: "判斷原料是否異常", detail: "能發現顏色、氣味、鮮度、質地或包裝異常，先停用並回報主管。" } },
      { id: "raw-prepped-cooked", critical: true, vi: { title: "Phân biệt sống, đã sơ chế và đã chín", detail: "Không lấy nhầm trạng thái nguyên liệu và biết cách bảo quản riêng theo SOP." }, zh: { title: "分清生料、備料與熟食", detail: "不會拿錯處理狀態，並依門市規範分開存放。" } },
      { id: "allowed-substitution", vi: { title: "Biết giới hạn thay thế nguyên liệu", detail: "Biết trường hợp nào được thay thế và trường hợp nào phải hỏi quản lý trước khi làm." }, zh: { title: "知道原料替代的界線", detail: "清楚哪些情況可替換，哪些必須先詢問主管，不自行變更。" } },
    ],
  },
  {
    id: "station_setup",
    vi: "Bố trí khu và chuẩn bị mở ca",
    zh: "工作區配置與開班準備",
    skills: [
      { id: "station-map", vi: { title: "Nắm rõ vị trí đồ trong khu", detail: "Biết nguyên liệu, dụng cụ, bao bì, đồ dự phòng và vị trí lấy hàng mà không phải tìm kiếm lâu." }, zh: { title: "熟悉本站物品位置", detail: "清楚原料、器具、包材、備品與補貨來源，取用時不需長時間尋找。" } },
      { id: "opening-check", critical: true, vi: { title: "Hoàn thành kiểm tra đầu ca", detail: "Kiểm tra vệ sinh, thiết bị, nguyên liệu, nhãn ngày, timer và bao bì theo danh sách của khu." }, zh: { title: "完成開班點檢", detail: "依本站清單確認清潔、設備、原料、日期標示、計時器與包材。" } },
      { id: "prep-forecast", vi: { title: "Chuẩn bị theo lượng khách dự kiến", detail: "Dựa trên đặt bàn, ngày thường/cuối tuần và tồn hiện tại để chuẩn bị vừa đủ." }, zh: { title: "依預估來客量備料", detail: "能依訂位、平假日與現有庫存準備適量物料。" } },
      { id: "organize-workflow", vi: { title: "Sắp xếp khu theo thứ tự thao tác", detail: "Đặt dụng cụ và nguyên liệu theo luồng làm việc, giảm bước đi thừa nhưng không làm sai quy định." }, zh: { title: "依作業順序安排工作區", detail: "依操作流程擺放器具與原料，減少多餘走動，同時符合門市規範。" } },
    ],
  },
  {
    id: "knife",
    vi: "Kỹ năng sử dụng dao",
    zh: "刀工與刀具安全",
    skills: [
      { id: "knife-selection", critical: true, vi: { title: "Chọn và kiểm tra dao phù hợp", detail: "Chọn đúng loại dao, kiểm tra cán và lưỡi trước khi sử dụng; báo ngay khi dao không an toàn." }, zh: { title: "正確選用並檢查刀具", detail: "依工作選擇刀具，使用前確認刀柄與刀刃狀況，異常立即回報。" } },
      { id: "knife-hand-safety", critical: true, vi: { title: "Tư thế tay và thao tác dao an toàn", detail: "Giữ nguyên liệu và điều khiển dao ổn định, không đặt tay hoặc người khác vào hướng nguy hiểm." }, zh: { title: "持刀與扶料姿勢安全", detail: "能穩定控制刀具與食材，不讓自己或他人處於刀鋒危險方向。" } },
      { id: "knife-cut-standard", vi: { title: "Cắt đúng kích thước và đồng đều", detail: "Thành phẩm đạt độ dày, hình dạng và số lượng theo tiêu chuẩn món." }, zh: { title: "切工尺寸一致", detail: "切出的厚度、形狀與數量符合品項標準。" } },
      { id: "knife-speed-waste", vi: { title: "Tốc độ cắt và tỷ lệ hao hụt hợp lý", detail: "Duy trì tốc độ ổn định, không làm nát nguyên liệu hoặc tạo hao hụt không cần thiết." }, zh: { title: "刀工速度與耗損控制", detail: "速度穩定，不因求快壓壞原料或造成不必要耗損。" } },
      { id: "knife-board-separation", critical: true, vi: { title: "Tách dao thớt sống và chín", detail: "Dùng, vệ sinh và cất dao thớt đúng phân loại để tránh nhiễm chéo." }, zh: { title: "生熟食刀板分流", detail: "依分類使用、清潔與收納刀具砧板，避免交叉污染。" } },
    ],
  },
  {
    id: "coordination",
    vi: "Phối hợp tay, mắt và di chuyển",
    zh: "手眼協調與工作動線",
    skills: [
      { id: "two-hand-coordination", vi: { title: "Phối hợp hai tay khi thao tác", detail: "Hai tay phối hợp hợp lý khi lấy đồ, chia phần, đóng gói hoặc theo dõi món." }, zh: { title: "雙手操作協調", detail: "取料、分裝、包裝與看單時，雙手能有效分工配合。" } },
      { id: "hand-eye-control", vi: { title: "Phối hợp mắt với thao tác", detail: "Vừa làm vừa theo dõi phiếu món, timer và trạng thái thành phẩm mà không bỏ quên bước." }, zh: { title: "手眼協調穩定", detail: "操作同時能注意出單、計時器與成品狀態，不遺漏步驟。" } },
      { id: "efficient-movement", vi: { title: "Di chuyển gọn và không thừa bước", detail: "Lấy đồ có mục đích, không chạy, không lùi hoặc quay người gây va chạm trong bếp." }, zh: { title: "動線俐落、不做多餘走動", detail: "取物有順序，不奔跑、不突然後退或轉身造成碰撞。" } },
      { id: "hot-item-movement", critical: true, vi: { title: "Di chuyển đồ nóng an toàn", detail: "Dùng dụng cụ bảo hộ và báo rõ khi mang nồi, nước hoặc món nóng qua khu vực chung." }, zh: { title: "安全搬運高溫物品", detail: "使用適當防護，搬運熱鍋、熱湯或熱食經過共用動線時會清楚示警。" } },
    ],
  },
  {
    id: "sop_execution",
    vi: "Thực hiện món theo SOP",
    zh: "依 SOP 製作餐點",
    skills: [
      { id: "sop-sequence", critical: true, vi: { title: "Làm đúng trình tự", detail: "Thực hiện đủ các bước theo đúng thứ tự; không bỏ bước để làm nhanh hơn." }, zh: { title: "依正確順序作業", detail: "按照標準順序完成所有步驟，不為求快省略流程。" } },
      { id: "sop-portion", critical: true, vi: { title: "Đúng định lượng", detail: "Dùng đúng dụng cụ và định lượng; không tự ý lấy dư hoặc giảm phần." }, zh: { title: "份量符合標準", detail: "使用指定器具與份量，不自行多給或減量。" } },
      { id: "dine-takeaway", critical: true, vi: { title: "Phân biệt dùng tại quán và mang đi", detail: "Chọn đúng bát, hộp, nắp, cách đóng gói và thành phần đi kèm." }, zh: { title: "分清內用與外帶規格", detail: "正確選用碗盤、外帶盒、杯蓋、包裝方式與附餐。" } },
      { id: "special-request", critical: true, vi: { title: "Xử lý đúng yêu cầu đặc biệt", detail: "Làm đúng mức cay, thêm, bớt, không dùng hoặc yêu cầu được phép theo SOP." }, zh: { title: "正確處理客製需求", detail: "依規範處理辣度、加料、減量、不加等允許的客製內容。" } },
      { id: "sop-version", vi: { title: "Theo đúng phiên bản SOP hiện hành", detail: "Biết nội dung đã thay đổi và không tiếp tục làm theo thói quen của phiên bản cũ." }, zh: { title: "依現行版本執行", detail: "了解新版調整內容，不再沿用舊版習慣。" } },
    ],
  },
  {
    id: "timing",
    vi: "Thời gian và nhịp làm việc",
    zh: "計時與出餐節奏",
    skills: [
      { id: "timer-operation", critical: true, vi: { title: "Sử dụng timer chính xác", detail: "Bấm đúng timer cho đúng món và biết từng timer đang theo dõi việc gì." }, zh: { title: "正確使用計時器", detail: "每個品項設定正確時間，並清楚每個計時器對應的餐點。" } },
      { id: "prepare-next-step", vi: { title: "Chuẩn bị bước tiếp theo đúng lúc", detail: "Trong lúc chờ biết chuẩn bị bát, hộp, sốt hoặc nguyên liệu cho bước sau." }, zh: { title: "等待時能先準備下一步", detail: "等待烹調時會先備妥碗盒、醬料或下一步所需物品。" } },
      { id: "stable-speed", vi: { title: "Tốc độ ổn định", detail: "Đạt thời gian chuẩn trong ca thường mà không tăng lỗi hoặc bỏ quy trình." }, zh: { title: "工作速度穩定", detail: "一般班別能在標準時間內完成，不因求快增加錯誤或省略流程。" } },
      { id: "recover-interruption", vi: { title: "Không mất nhịp khi bị gián đoạn", detail: "Sau khi trả lời, lấy hàng hoặc hỗ trợ việc khác vẫn nhớ trạng thái các món đang làm." }, zh: { title: "被打斷後能接回進度", detail: "回應、補貨或短暫支援後，仍能掌握手上各餐點的處理進度。" } },
    ],
  },
  {
    id: "queue_peak",
    vi: "Nhiều đơn và giờ cao điểm",
    zh: "多單處理與尖峰應變",
    skills: [
      { id: "read-full-queue", vi: { title: "Nắm được toàn bộ hàng đợi", detail: "Biết đang có bao nhiêu đơn, món nào lâu, món nào gấp và món nào cần đi cùng." }, zh: { title: "掌握目前全部待出餐點", detail: "清楚單量、耗時較長品項、急單及需同時出餐的組合。" } },
      { id: "order-priority", critical: true, vi: { title: "Sắp xếp đúng thứ tự ưu tiên", detail: "Ưu tiên theo thời gian chế biến, thứ tự đơn và sự phụ thuộc giữa các khu." }, zh: { title: "正確安排出餐順序", detail: "依製作時間、單據順序及各區配合關係安排優先次序。" } },
      { id: "combine-orders", vi: { title: "Ghép thao tác cho nhiều đơn", detail: "Xử lý chung những bước có thể ghép nhưng vẫn giữ đúng từng món và từng đơn." }, zh: { title: "多單併行處理", detail: "可合併處理相同步驟，同時維持每道餐點與每張單的正確性。" } },
      { id: "peak-accuracy", vi: { title: "Giữ chính xác trong giờ cao điểm", detail: "Khi đơn tăng vẫn không bỏ bước kiểm tra, không nhầm món và không mất dấu đơn." }, zh: { title: "尖峰時仍維持正確率", detail: "單量增加時仍不省略檢查、不混單、不漏單。" } },
      { id: "ask-support-early", vi: { title: "Báo hỗ trợ trước khi quá tải", detail: "Nhận biết giới hạn của khu và gọi hỗ trợ trước khi hàng đợi bị nghẽn hoàn toàn." }, zh: { title: "超載前主動請求支援", detail: "能判斷本站負荷，在全面塞單前清楚提出支援需求。" } },
      { id: "divide-support-work", vi: { title: "Chia việc rõ khi có người hỗ trợ", detail: "Giao phần việc cụ thể và cập nhật trạng thái để hai người không làm trùng hoặc bỏ sót." }, zh: { title: "有人支援時能清楚分工", detail: "明確分配工作並同步進度，避免重複製作或遺漏。" } },
    ],
  },
  {
    id: "quality",
    vi: "Kiểm tra chất lượng và sai sót",
    zh: "品質確認與錯誤處理",
    skills: [
      { id: "final-check", critical: true, vi: { title: "Kiểm tra trước khi giao món", detail: "Xác nhận lại món, số lượng, yêu cầu, hình thức, bao bì và thành phần đi kèm." }, zh: { title: "出餐前完成最後確認", detail: "再次核對品項、數量、客製內容、外觀、包裝與附餐。" } },
      { id: "finished-standard", vi: { title: "Nhận biết thành phẩm đạt chuẩn", detail: "Biết tiêu chuẩn về độ chín, hình thức, lượng sốt/nước và cách trình bày của khu." }, zh: { title: "判斷成品是否合格", detail: "能依本站標準判斷熟度、外觀、醬汁／湯量及擺盤。" } },
      { id: "stop-wrong-dish", critical: true, vi: { title: "Phát hiện sai và chặn món kịp thời", detail: "Khi thấy sai phải dừng món trước khi giao, không chờ khu khác hoặc khách phát hiện." }, zh: { title: "發現錯誤能立即攔餐", detail: "看到錯誤會在送出前立即停止，不等其他區或客人發現。" } },
      { id: "record-rework", vi: { title: "Ghi nhận món làm lại và hao hụt", detail: "Nêu đúng nguyên nhân, lượng nguyên liệu mất và cách phòng tránh; không che giấu lỗi." }, zh: { title: "如實記錄重做與耗損", detail: "記錄原因、耗損量與改善方式，不隱瞞錯誤。" } },
    ],
  },
  {
    id: "food_safety",
    vi: "Vệ sinh và an toàn thực phẩm",
    zh: "衛生與食品安全",
    skills: [
      { id: "hand-hygiene", critical: true, vi: { title: "Vệ sinh tay đúng thời điểm", detail: "Rửa tay và thay găng phù hợp khi đổi công việc; không chạm đồ bẩn rồi tiếp tục làm món." }, zh: { title: "依正確時機洗手與換手套", detail: "工作切換時確實清潔雙手並視需要更換手套，不碰髒污後直接製餐。" } },
      { id: "cross-contamination", critical: true, vi: { title: "Ngăn ngừa nhiễm chéo", detail: "Tách nguyên liệu, dụng cụ, bề mặt và luồng thao tác giữa đồ sống và đồ chín." }, zh: { title: "避免交叉污染", detail: "生熟食材、器具、檯面與操作流程確實分流。" } },
      { id: "date-storage", critical: true, vi: { title: "Dán ngày và bảo quản đúng", detail: "Ghi nhãn đầy đủ, đặt đúng khu, che đậy và ưu tiên sử dụng theo quy định của quán." }, zh: { title: "日期標示與保存正確", detail: "標示完整、放置正確、妥善覆蓋，並依門市規定安排使用順序。" } },
      { id: "thawing", critical: true, vi: { title: "Rã đông đúng quy trình", detail: "Chuẩn bị đủ sớm, đúng phương pháp và không để nguyên liệu ở trạng thái không an toàn." }, zh: { title: "依規定退冰", detail: "提早安排並使用正確方式退冰，不讓原料處於不安全狀態。" } },
      { id: "temperature-response", critical: true, vi: { title: "Theo dõi nhiệt độ và xử lý bất thường", detail: "Thực hiện kiểm tra theo SOP; khi tủ hoặc nguyên liệu bất thường phải dừng sử dụng và báo quản lý." }, zh: { title: "溫度檢查與異常處置", detail: "依 SOP 完成檢查；冰箱或原料溫度異常時先停用並回報主管。" } },
      { id: "allergen-awareness", critical: true, vi: { title: "Nhận biết yêu cầu liên quan dị ứng", detail: "Không tự suy đoán; biết dừng và hỏi quản lý khi đơn có yêu cầu tránh thành phần gây dị ứng." }, zh: { title: "正確處理過敏相關需求", detail: "遇到過敏需求不自行判斷，先停止並向主管確認。" } },
      { id: "report-safety-risk", critical: true, vi: { title: "Báo cáo nguy cơ an toàn ngay lập tức", detail: "Không che giấu nguyên liệu hỏng, nhiễm bẩn, thiết bị bảo quản lỗi hoặc hành vi nguy hiểm." }, zh: { title: "立即回報食安風險", detail: "不隱瞞原料異常、污染、冷藏設備故障或危險操作。" } },
    ],
  },
  {
    id: "equipment",
    vi: "Thiết bị và đồ nóng",
    zh: "設備操作與高溫安全",
    skills: [
      { id: "equipment-start-stop", critical: true, vi: { title: "Khởi động và tắt thiết bị đúng cách", detail: "Thực hiện đúng trình tự của khu, không bỏ thiết bị hoạt động khi chưa bàn giao." }, zh: { title: "正確開關設備", detail: "依本站流程操作，未交接前不讓設備處於無人管理狀態。" } },
      { id: "equipment-safe-use", critical: true, vi: { title: "Sử dụng thiết bị an toàn", detail: "Dùng đúng chức năng, dụng cụ bảo hộ và không vượt phạm vi được phép thao tác." }, zh: { title: "安全操作設備", detail: "依指定用途使用設備與防護用品，不進行未授權操作。" } },
      { id: "equipment-abnormal", critical: true, vi: { title: "Phát hiện và báo thiết bị bất thường", detail: "Nhận ra tiếng, mùi, nhiệt, điện hoặc hoạt động khác thường; dừng dùng và báo đúng người." }, zh: { title: "發現設備異常並正確回報", detail: "察覺異音、異味、過熱、電力或運轉異常時停用並通知負責人。" } },
    ],
  },
  {
    id: "inventory",
    vi: "Bổ sung hàng và kiểm kê",
    zh: "補貨與庫存管理",
    skills: [
      { id: "count-stock", vi: { title: "Kiểm kê đúng số lượng hiện có", detail: "Đếm theo đúng đơn vị, bao gồm hàng đang dùng, hàng dự trữ và hàng chờ giao nếu được yêu cầu." }, zh: { title: "正確盤點現有數量", detail: "依正確單位清點工作區、備用庫存及需要納入的在途數量。" } },
      { id: "restock-vs-order", critical: true, vi: { title: "Phân biệt bù đồ và gọi hàng", detail: "Tủ bếp thiếu thì kiểm tra kho chính trước; chỉ báo gọi hàng khi nguồn dự trữ không đủ." }, zh: { title: "分清補貨與叫貨", detail: "工作冰箱不足時先查主要庫存，備用量也不足才提出叫貨。" } },
      { id: "par-level", vi: { title: "Theo dõi định mức của khu", detail: "Biết mức tối thiểu và lượng cần chuẩn bị, báo trước khi nguyên liệu xuống dưới ngưỡng." }, zh: { title: "掌握本站安全庫存", detail: "了解最低需求與備料量，在庫存低於標準前提出提醒。" } },
      { id: "delivery-schedule", vi: { title: "Hiểu ngày gọi và lịch giao hàng", detail: "Biết ngày nghỉ nhà cung cấp, ngày nào cần gọi cho nhiều ngày và lượng hàng đang chờ giao." }, zh: { title: "了解叫貨日與到貨安排", detail: "清楚供應商休假、需一次叫多日用量的日期，以及目前在途數量。" } },
      { id: "receive-goods", vi: { title: "Kiểm tra hàng khi nhận", detail: "Đối chiếu đúng mặt hàng, số lượng, chất lượng và cập nhật tồn sau khi nhận." }, zh: { title: "到貨驗收", detail: "核對品項、數量與品質，驗收後更新庫存。" } },
      { id: "report-stock-gap", vi: { title: "Báo sai lệch tồn kho", detail: "Khi số hệ thống khác thực tế phải ghi nhận và tìm nguyên nhân, không tự sửa để khớp." }, zh: { title: "回報庫存差異", detail: "系統數量與實際不符時如實記錄並查找原因，不直接修改數字掩蓋差異。" } },
    ],
  },
  {
    id: "cleaning",
    vi: "Vệ sinh, đóng khu và bàn giao",
    zh: "清潔、收班與交接",
    skills: [
      { id: "clean-as-you-go", vi: { title: "Vừa làm vừa giữ khu sạch", detail: "Xử lý rác, nước đổ và dụng cụ bẩn trong ca, không dồn toàn bộ đến cuối ngày." }, zh: { title: "隨手維持工作區整潔", detail: "班中持續處理垃圾、潑灑與髒器具，不把所有清潔留到收班。" } },
      { id: "cleaning-separation", critical: true, vi: { title: "Dùng dụng cụ vệ sinh đúng khu", detail: "Không dùng chung khăn hoặc dụng cụ khiến chất bẩn lan sang bề mặt chế biến." }, zh: { title: "清潔工具分區使用", detail: "不混用抹布或清潔工具，避免污染製餐檯面。" } },
      { id: "closing-clean", vi: { title: "Hoàn thành vệ sinh cuối ca", detail: "Vệ sinh thiết bị, dụng cụ, bề mặt và sàn theo checklist của khu." }, zh: { title: "完成收班清潔", detail: "依本站清單完成設備、器具、檯面與地面清潔。" } },
      { id: "closing-stock", vi: { title: "Kiểm tra và bảo quản cuối ca", detail: "Kiểm kê, che đậy, dán nhãn, cất đúng vị trí và ghi lại những nguyên liệu cần xử lý." }, zh: { title: "收班盤點與保存", detail: "完成盤點、覆蓋、標示與歸位，並記錄待處理原料。" } },
      { id: "handover", vi: { title: "Bàn giao rõ ràng cho ca sau", detail: "Nêu cụ thể hàng thiếu, việc chưa xong, thiết bị lỗi và trạng thái món; xác nhận người nhận đã hiểu." }, zh: { title: "交接內容清楚完整", detail: "說明缺貨、未完成事項、設備異常與餐點狀態，並確認接班人已了解。" } },
    ],
  },
  {
    id: "communication",
    vi: "Phối hợp với người và khu khác",
    zh: "跨區協作與回報",
    skills: [
      { id: "closed-loop", vi: { title: "Nhận việc và phản hồi rõ ràng", detail: "Trả lời khi nhận thông tin, báo khi hoàn thành và xác nhận lại khi nội dung chưa rõ." }, zh: { title: "接收指令後有明確回應", detail: "收到資訊會回覆，完成後會回報，內容不清楚時主動確認。" } },
      { id: "report-delay", vi: { title: "Báo món chậm hoặc thiếu hàng sớm", detail: "Thông báo nguyên nhân và thời gian dự kiến trước khi ảnh hưởng toàn bộ đơn." }, zh: { title: "提早回報延誤或缺貨", detail: "在影響整張單前說明原因與預計時間。" } },
      { id: "coordinate-stations", vi: { title: "Phối hợp thời điểm với khu khác", detail: "Trao đổi để những món cùng đơn hoàn thành hợp lý, không để món chờ quá lâu." }, zh: { title: "與其他工作區協調出餐", detail: "配合同桌餐點完成時間，避免成品等待過久。" } },
      { id: "respectful-pressure", vi: { title: "Giữ giao tiếp rõ và tôn trọng khi đông khách", detail: "Không im lặng, quát mắng hoặc đổ lỗi; tập trung vào thông tin cần xử lý." }, zh: { title: "忙碌時仍保持清楚且尊重的溝通", detail: "不沉默、不吼叫、不推責，聚焦需要處理的資訊。" } },
    ],
  },
  {
    id: "problem_solving",
    vi: "Xử lý tình huống bất thường",
    zh: "異常狀況處理",
    skills: [
      { id: "wrong-order-response", vi: { title: "Xử lý món sai hoặc bị trả lại", detail: "Dừng món, xác nhận lỗi, ưu tiên làm lại hợp lý và ghi nhận nguyên nhân." }, zh: { title: "處理錯餐與退餐", detail: "先攔餐、確認原因，合理安排重做並留下紀錄。" } },
      { id: "shortage-response", vi: { title: "Xử lý thiếu nguyên liệu giữa ca", detail: "Kiểm tra nguồn bù, báo quản lý và khu liên quan, không tự ý thay nguyên liệu." }, zh: { title: "處理營業中缺料", detail: "確認補貨來源並通知主管及相關工作區，不自行更換原料。" } },
      { id: "equipment-failure-response", critical: true, vi: { title: "Xử lý khi thiết bị gặp sự cố", detail: "Dừng nguy cơ, bảo vệ món đang làm, báo đúng người và chuyển sang phương án đã được duyệt." }, zh: { title: "設備故障時正確應變", detail: "先停止風險、保護處理中的餐點、通知負責人，再採用核准的替代方式。" } },
      { id: "overload-response", vi: { title: "Xử lý khi khu bị nghẽn", detail: "Xác định điểm nghẽn, báo thời gian, chia lại việc và khôi phục hàng đợi có thứ tự." }, zh: { title: "工作區塞單時能正確處理", detail: "找出卡點、回報時間、重新分工，並依順序恢復出餐。" } },
      { id: "stop-report-document", critical: true, vi: { title: "Biết dừng, báo cáo và ghi nhận", detail: "Phân biệt việc được tự xử lý với việc phải dừng để quản lý quyết định; không che giấu sự cố." }, zh: { title: "知道何時停下、回報並記錄", detail: "分清可自行處理與需主管決定的狀況，不隱瞞事故。" } },
    ],
  },
  {
    id: "ownership_training",
    vi: "Chủ động, trách nhiệm và hướng dẫn",
    zh: "主動性、責任感與帶訓",
    skills: [
      { id: "self-check", vi: { title: "Tự kiểm tra mà không chờ nhắc", detail: "Chủ động kiểm tra khu, tồn, nhãn ngày và công việc còn lại trong phạm vi trách nhiệm." }, zh: { title: "不需提醒也會主動檢查", detail: "主動確認本站、庫存、日期標示與待辦事項。" } },
      { id: "own-mistake", vi: { title: "Nhận và sửa lỗi có trách nhiệm", detail: "Báo đúng sự việc, khắc phục theo hướng dẫn và nêu cách tránh lặp lại." }, zh: { title: "對錯誤負責並完成改善", detail: "如實說明、依指示修正，並提出避免再次發生的方法。" } },
      { id: "support-without-abandoning", vi: { title: "Hỗ trợ khu khác đúng thời điểm", detail: "Chỉ rời khu khi khu mình đã ổn định hoặc đã bàn giao; không hỗ trợ một nơi làm bỏ trống nơi khác." }, zh: { title: "在正確時機支援其他區", detail: "本站穩定或完成交接後再支援，不因幫忙而讓原工作區無人處理。" } },
      { id: "teach-sop", vi: { title: "Hướng dẫn người mới theo SOP", detail: "Giải thích rõ, làm mẫu đúng, quan sát thực hành và sửa lỗi thay vì chỉ làm hộ." }, zh: { title: "依 SOP 帶訓新人", detail: "說明清楚、正確示範、觀察實作並修正，不只是代替新人完成。" } },
      { id: "evaluate-fairly", vi: { title: "Ghi nhận tiến độ khách quan", detail: "Đánh giá dựa trên ca làm và bằng chứng, không dựa vào quan hệ cá nhân hoặc một lần biểu hiện." }, zh: { title: "客觀記錄學習進度", detail: "依實際班別與證據評估，不受私人關係或單次表現影響。" } },
      { id: "suggest-improvement", vi: { title: "Đề xuất cải tiến có căn cứ", detail: "Nêu rõ vấn đề, nguyên nhân, ảnh hưởng và phương án; không tự ý đổi quy trình trước khi duyệt." }, zh: { title: "提出有依據的改善建議", detail: "說明問題、原因、影響與方案，未核准前不自行更改流程。" } },
    ],
  },
];

export const CUSTOM_SKILL_GROUP = { id: "custom", vi: "Kỹ năng bổ sung của quán", zh: "門市自訂技能" };

export function flatSkillCatalog(customSkills = []) {
  const builtIn = SKILL_GROUPS.flatMap((group) => group.skills.map((skill) => ({ ...skill, groupId: group.id, custom: false })));
  return [...builtIn, ...customSkills.map((skill) => ({ ...skill, groupId: "custom", custom: true }))];
}

export function normalizeCustomSkill(input = {}) {
  const viTitle = String(input.vi?.title ?? input.viTitle ?? "").trim();
  const zhTitle = String(input.zh?.title ?? input.zhTitle ?? "").trim();
  if (!viTitle || !zhTitle) return null;
  return {
    id: String(input.id || `skill-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`),
    critical: input.critical === true,
    vi: { title: viTitle, detail: String(input.vi?.detail ?? input.viDetail ?? "").trim() },
    zh: { title: zhTitle, detail: String(input.zh?.detail ?? input.zhDetail ?? "").trim() },
  };
}

export function normalizeSkillProfiles(input = {}, validSkillIds = []) {
  const allowed = new Set(validSkillIds);
  const profiles = { noodles: {}, soup: {}, seafood: {}, meat: {} };
  for (const area of Object.keys(profiles)) {
    const source = input?.[area] && typeof input[area] === "object" ? input[area] : {};
    for (const [skillId, status] of Object.entries(source)) {
      if (allowed.has(skillId) && SKILL_ASSIGNMENT_STATUSES.includes(status) && status !== "inactive") profiles[area][skillId] = status;
    }
  }
  return profiles;
}

export function skillProfileSummary(operations, area) {
  const profile = operations?.skillProfiles?.[area] || {};
  return Object.values(profile).reduce((summary, status) => {
    if (status === "core") summary.core += 1;
    if (status === "scored") summary.scored += 1;
    if (status === "reference") summary.reference += 1;
    summary.active += 1;
    return summary;
  }, { active: 0, core: 0, scored: 0, reference: 0 });
}

export const SKILL_LEVELS = [0, 1, 2, 3, 4];

export function normalizeSkillAssessment(input = {}, validSkillIds = []) {
  const allowed = new Set(validSkillIds);
  const area = ["noodles", "soup", "seafood", "meat"].includes(input.area) ? input.area : "noodles";
  const ratings = Array.isArray(input.ratings)
    ? input.ratings.map((entry) => ({ skillId: String(entry.skillId || ""), level: Number(entry.level) }))
      .filter((entry) => allowed.has(entry.skillId) && SKILL_LEVELS.includes(entry.level))
    : [];
  if (!String(input.staffId || "") || !String(input.evaluatorId || "") || !ratings.length) return null;
  return {
    id: String(input.id || `assessment-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`),
    staffId: String(input.staffId),
    staffName: String(input.staffName || ""),
    area,
    evaluatorId: String(input.evaluatorId),
    evaluatorName: String(input.evaluatorName || ""),
    evaluatorRole: String(input.evaluatorRole || ""),
    ratings,
    note: String(input.note || "").trim(),
    at: String(input.at || new Date().toISOString()),
  };
}

export function latestSkillRatings(operations, staffId, area) {
  const latest = new Map();
  const sessions = (operations?.skillAssessments || [])
    .filter((entry) => entry.staffId === staffId && entry.area === area)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const session of sessions) {
    for (const rating of session.ratings || []) {
      const key = `${session.evaluatorId}:${rating.skillId}`;
      if (!latest.has(key)) latest.set(key, { ...rating, evaluatorId: session.evaluatorId, evaluatorName: session.evaluatorName, at: session.at });
    }
  }
  return [...latest.values()];
}

export function assessEmployeeSkills(operations, staffId, area) {
  const profile = operations?.skillProfiles?.[area] || {};
  const gradingSkills = Object.entries(profile).filter(([, status]) => status === "core" || status === "scored");
  const latest = latestSkillRatings(operations, staffId, area);
  const bySkill = new Map();
  for (const rating of latest) {
    if (!bySkill.has(rating.skillId)) bySkill.set(rating.skillId, []);
    bySkill.get(rating.skillId).push(rating);
  }
  const rows = gradingSkills.map(([skillId, status]) => {
    const ratings = bySkill.get(skillId) || [];
    const average = ratings.length ? ratings.reduce((sum, entry) => sum + entry.level, 0) / ratings.length : null;
    return { skillId, status, ratings, average };
  });
  const observed = rows.filter((row) => row.average !== null);
  const coverage = rows.length ? Math.round(observed.length / rows.length * 100) : 0;
  const evaluators = new Map(latest.map((entry) => [entry.evaluatorId, entry.evaluatorName]));
  const weighted = observed.reduce((summary, row) => {
    const weight = row.status === "core" ? 2 : 1;
    summary.points += row.average * weight;
    summary.weight += weight;
    return summary;
  }, { points: 0, weight: 0 });
  const average = weighted.weight ? weighted.points / weighted.weight : null;
  const coreRows = rows.filter((row) => row.status === "core");
  const coreComplete = coreRows.every((row) => row.average !== null);
  const coreMinimum = coreComplete && coreRows.length ? Math.min(...coreRows.map((row) => row.average)) : coreRows.length ? null : 4;
  let suggestedLevel = null;
  if (coverage >= 50 && average !== null) {
    suggestedLevel = "D";
    if (coverage >= 60 && coreComplete && coreMinimum >= 2 && average >= 2) suggestedLevel = "C";
    if (coverage >= 80 && coreComplete && coreMinimum >= 3 && average >= 3) suggestedLevel = "B";
    if (coverage === 100 && coreComplete && coreMinimum >= 3.5 && average >= 3.7) suggestedLevel = "A";
  }
  const approvalReady = Boolean(suggestedLevel)
    && coverage >= 80
    && (!["A", "B"].includes(suggestedLevel) || evaluators.size >= 2);
  const latestAssessmentAt = (operations?.skillAssessments || [])
    .filter((entry) => entry.staffId === staffId && entry.area === area)
    .reduce((latestAt, entry) => String(entry.at) > latestAt ? String(entry.at) : latestAt, "");
  const approval = (operations?.skillApprovals || [])
    .filter((entry) => entry.staffId === staffId && entry.area === area)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  return {
    total: rows.length,
    observed: observed.length,
    coverage,
    average: average === null ? null : Math.round(average * 100) / 100,
    coreComplete,
    coreMinimum,
    evaluatorCount: evaluators.size,
    evaluators: [...evaluators.entries()].map(([id, name]) => ({ id, name })),
    suggestedLevel,
    approvalReady,
    approval: approval && String(approval.at) >= latestAssessmentAt ? approval : null,
    rows,
  };
}
