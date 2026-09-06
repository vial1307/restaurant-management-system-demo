from pathlib import Path

path = Path("src/store-core.js")
text = path.read_text()


def replace_method(name, next_name, block):
    global text
    start_token = f"    {name}("
    end_token = f"    {next_name}("
    assert text.count(start_token) == 1, f"{name} boundary changed"
    start = text.index(start_token)
    end = text.index(end_token, start)
    text = text[:start] + block + text[end:]


replace_method("selectDate", "updateSetting", '''    selectDate(date) {
      if (state.selectedDate === date && state.records[date]) return state;
      return update((draft) => {
        ensureRecord(draft, date);
        draft.selectedDate = date;
      });
    },
''')
replace_method("updateSetting", "updateReservation", '''    updateSetting(key, value) {
      const next = ["language", "employeeName", "workstation"].includes(key) ? value : clampNumber(value);
      if (state.settings[key] === next) return state;
      return update((draft) => { draft.settings[key] = next; });
    },
''')
replace_method("updateReservation", "updateRemaining", '''    updateReservation(key, value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].reservation[key] === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].reservation[key] = next; });
    },
''')
replace_method("updateRemaining", "updateRice", '''    updateRemaining(key, value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].reservation.remaining[key] === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].reservation.remaining[key] = next; });
    },
''')
replace_method("updateRice", "updateProcurementLine", '''    updateRice(value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].riceRemaining === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].riceRemaining = next; });
    },
''')
replace_method("updateProcurementLine", "updateProcurementOrderDate", '''    updateProcurementLine(id, key, value) {
      const next = clampNumber(value);
      const record = state.records[state.selectedDate];
      const bucketName = key === "planned" ? "planned" : "incoming";
      const currentBucket = record.procurement?.[bucketName];
      if (currentBucket && Object.hasOwn(currentBucket, id) && currentBucket[id] === next) return state;
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        targetRecord.procurement ??= { planned: {}, incoming: {} };
        const bucket = bucketName === "planned" ? targetRecord.procurement.planned : targetRecord.procurement.incoming;
        bucket[id] = next;
      });
    },
''')
replace_method("updateProcurementOrderDate", "toggleProcurementClosedDay", '''    updateProcurementOrderDate(category, value) {
      const next = String(value);
      if (!["noodles", "vegetables", "factory"].includes(category) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(next)) return state;
      if (state.records[state.selectedDate].procurement?.orderDates?.[category] === next) return state;
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        record.procurement ??= { planned: {}, incoming: {}, orderDates: {} };
        record.procurement.orderDates ??= {};
        record.procurement.orderDates[category] = next;
      });
    },
''')
replace_method("updateItem", "updateWorkItem", '''    updateItem(id, key, value) {
      const record = state.records[state.selectedDate];
      const item = record.inventory.find((entry) => entry.id === id);
      if (!item) return state;
      const next = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
      const propagated = ["workArea", "label", "labelVi", "unit"].includes(key);
      if (item[key] === next) {
        if (!propagated) return state;
        const workItem = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
        const inventoryMatches = record.inventory.filter((entry) => entry.stockKey === item.stockKey).every((entry) => entry[key] === next);
        const workMatches = !workItem || workItem[key] === next;
        if (inventoryMatches && workMatches) return state;
      }
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        const targetItem = targetRecord.inventory.find((entry) => entry.id === id);
        if (!targetItem) return;
        targetItem[key] = next;
        if (propagated) {
          const workItem = targetRecord.workInventory.find((entry) => entry.stockKey === targetItem.stockKey);
          if (workItem) workItem[key] = next;
          for (const source of targetRecord.inventory) if (source.stockKey === targetItem.stockKey) source[key] = next;
        }
      });
    },
''')
replace_method("updateWorkItem", "restockWorkItem", '''    updateWorkItem(id, key, value) {
      const record = state.records[state.selectedDate];
      const item = record.workInventory.find((entry) => entry.id === id);
      if (!item) return state;
      const next = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
      if (item[key] === next) {
        if (key !== "workArea") return state;
        const sourcesMatch = record.inventory.filter((entry) => entry.stockKey === item.stockKey).every((entry) => entry.workArea === next);
        if (sourcesMatch) return state;
      }
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        const targetItem = targetRecord.workInventory.find((entry) => entry.id === id);
        if (!targetItem) return;
        targetItem[key] = next;
        if (key === "workArea") for (const source of targetRecord.inventory) if (source.stockKey === targetItem.stockKey) source.workArea = next;
      });
    },
''')

path.write_text(text)
