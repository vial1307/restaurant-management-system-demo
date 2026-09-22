import assert from "node:assert/strict";

// Called only against CI's disposable PostgreSQL database, with two isolated
// browser sessions. No localStorage sharing can hide a broken SSE/read path.
export async function verifyInventoryCrossSurface({browser, adminPage, adminContext, login, base, profile}) {
  const context = await browser.newContext({viewport:{width:profile.width,height:profile.height},serviceWorkers:"block"});
  await login(context,"yangchuadmin");
  const main = await context.newPage();
  const errors=[];main.on("pageerror",e=>errors.push(e.message));
  const workspace=adminPage.locator("[data-inventory-database]");
  const api=async(path,body)=>{
    const response=body?await adminContext.request.post(`${base}${path}`,{data:body}):await adminContext.request.get(`${base}${path}`);
    assert.equal(response.status(),200,`${path}: ${await response.text()}`);
    return response.json();
  };
  const waitText=async(page,selector,text)=>page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text},{timeout:12000});
  const search=async(value)=>{
    await workspace.locator('[data-idb-search] [name="q"]').fill(value);
    await workspace.locator('[data-idb-search] button').click();
  };
  const save=async()=>{
    await workspace.locator('[data-idb-form] button[type="submit"]').click();
    await adminPage.waitForFunction(()=>!document.querySelector('[data-idb-form]'),null,{timeout:10000});
    await adminPage.waitForFunction(()=>!document.querySelector('[data-idb-action="refresh"]')?.disabled);
    assert.match(await workspace.locator('[data-idb-message]').textContent(),/Đã lưu vào PostgreSQL/);
  };
  try {
    await main.goto(`${base}/#inventory`,{waitUntil:"domcontentloaded"});
    await main.locator('.inventory-sql-ready').waitFor({timeout:20000});
    const stamp=Date.now().toString(36);
    for(const site of ["central","fuxing","yongji"]) {
      const key=`cross-${stamp}-${site}`, area=`cross-${stamp}`, code=`${site}-${key}`;
      await api('/api/master-data/work-areas',{action:"save",site,code:area,name_vi:area,name_zh_tw:area,active:true,department_code:"kitchen"});
      const {location}=await api('/api/master-data/locations',{action:"save",site,code,kind:"storage",name_vi:key,name_zh_tw:key,active:true,metadata:{ui_key:key,storage_group:"primary"}});
      const locations=[{code}];
      if(site!=="central") {
        const workCode=`${code}-w`;
        await api('/api/master-data/locations',{action:"save",site,code:workCode,kind:"work",name_vi:area,name_zh_tw:area,active:true,metadata:{ui_key:area,work_area:area}});
        locations.push({code:workCode});
      }
      await api('/api/inventory/catalog/sync',{expectedRevision:"0",item:{key:`${site}:${key}`,catalog_key:key,vi:key,zh:key,unit:"包",work_area:area,locations}});
      const snapshot=await api(`/api/inventory/${site}`), item=snapshot.items.find(i=>i.item_key===`${site}:${key}`);
      assert(item,`${site}: fixture missing`);
      if(await main.evaluate(()=>localStorage.getItem("shitu-admin-active-site-v1"))!==site) await main.locator(`[data-warehouse="${site}"]`).first().click();
      const row=main.locator('.storage-row').filter({has:main.locator(`[data-cloud-item-id="${item.id}"], [data-central-item-key="${item.item_key}"]`)}).first();
      await row.waitFor({state:"visible",timeout:15000});
      await workspace.locator('[name="site"]').selectOption(site);
      await workspace.locator('[data-idb-action="tab-locations"]').click();
      await workspace.locator('[data-idb-action="kind-areas"]').click();
      await search(area);
      await workspace.locator(`[data-idb-action="master"][data-id="${area}"]`).click();
      const areaName=`Khu mới 新工作區 ${site} ${stamp}`;
      await workspace.locator('[name="name_vi"]').fill(areaName);
      await workspace.locator('[name="name_zh_tw"]').fill(areaName);
      await save();
      const areaSelector=site==="central"?'select[data-central-inline-work-area]':'select[data-key="workArea"]';
      await main.waitForFunction(({selector,value,text})=>[...document.querySelectorAll(`${selector} option`)].some(o=>o.value===value&&o.textContent.includes(text)),{selector:areaSelector,value:area,text:areaName},{timeout:12000});
      await workspace.locator('[data-idb-action="kind-storage"]').click();await search(code);
      await workspace.locator(`[data-idb-action="master"][data-id="${location.id}"]`).click();
      const locationName=`Tủ mới 新儲位 ${site} ${stamp}`;
      await workspace.locator('[name="name_vi"]').fill(locationName);
      await workspace.locator('[name="name_zh_tw"]').fill(locationName);await save();
      const zoneSelector=site==="central"?'select[data-central-inline-zone]':'select[data-key="zone"]';
      await main.waitForFunction(({selector,value,text})=>[...document.querySelectorAll(`${selector} option`)].some(o=>o.value===value&&o.textContent.includes(text)),{selector:zoneSelector,value:key,text:locationName},{timeout:12000});
      await workspace.locator('[data-idb-action="tab-items"]').click();await search(key);
      await workspace.locator(`[data-idb-action="item"][data-id="${item.id}"]`).click();
      const adminName=`Admin ${key}`;
      await workspace.locator('[name="name_vi"]').fill(adminName);await save();
      await main.waitForFunction(text=>document.querySelector('.page-content')?.textContent.includes(text),adminName,{timeout:12000});
      const more=workspace.locator(`[data-idb-item="${item.id}"] details`);
      await more.locator('summary').click();
      await more.locator('[data-idb-action="item-stock"]').click();
      await workspace.locator(`[data-idb-action="minimum"][data-id="${item.id}"][data-location="${location.id}"]`).click();
      await workspace.locator('[name="value"]').fill('7');await workspace.locator('[name="note"]').fill('cross-surface CI');await save();
      const minSelector=site==="central"?`input[data-central-minimum][data-central-item-key="${item.item_key}"]`:`input[data-key="minimum"][data-cloud-item-id="${item.id}"]`;
      await main.waitForFunction(selector=>document.querySelector(selector)?.value==='7',minSelector,{timeout:12000});
      // The main ingredient editor uses those same names/options and writes
      // back into the existing row viewed by Super Admin.
      await row.locator(site==="central"?'[data-central-editor-open]':'[data-action="open-edit-item"]').click();
      const form=main.locator(site==="central"?'[data-central-editor-form]':'#ingredient-product-form');
      assert((await form.textContent()).includes(locationName),`${site}: editor storage label stale`);
      assert((await form.textContent()).includes(areaName),`${site}: editor area label stale`);
      const mainName=`Main ${key}`;
      await form.locator(site==="central"?'[name="central-label-vi"]':'[name="labelVi"]').fill(mainName);
      await form.locator('button[type="submit"]').click();
      await form.waitFor({state:"detached",timeout:12000});
      await waitText(adminPage,'[data-inventory-database] tbody',mainName);
      const change=main.waitForResponse(r=>r.url().endsWith('/api/inventory/set-minimum')&&r.request().method()==="POST");
      await main.locator(minSelector).fill('9');await main.locator(minSelector).dispatchEvent('change');
      assert.equal((await change).status(),200,`${site}: main minimum save failed`);
      await adminPage.waitForFunction(({id,locationId})=>[...document.querySelectorAll('[data-inventory-database] tbody tr')].some(tr=>tr.querySelector(`[data-id="${id}"][data-location="${locationId}"]`)&&Number(tr.children[3]?.textContent.trim())===9),{id:item.id,locationId:location.id},{timeout:12000});
      const persisted=await api(`/api/inventory/${site}`);
      assert.equal(persisted.items.find(i=>i.id===item.id).name_vi,mainName);
      assert.equal(Number(persisted.stock.find(s=>s.item_id===item.id&&s.location_id===location.id).minimum_quantity),9);
      await main.reload({waitUntil:"domcontentloaded"});
      await main.waitForFunction(selector=>document.querySelector(selector)?.value==='9',minSelector,{timeout:15000});
      assert((await row.textContent()).includes(mainName),`${site}: reload reverted metadata`);
      assert((await row.textContent()).includes(areaName),`${site}: reload reverted area name`);
      assert((await row.textContent()).includes(locationName),`${site}: reload reverted location name`);
      await workspace.locator('[data-idb-action="tab-items"]').click();await search(key);
      // On both mobile and desktop the four actions must no longer force a
      // large permanent action stack, while remaining keyboard reachable.
      const adminRow=workspace.locator(`[data-idb-item="${item.id}"]`);
      assert.equal(await adminRow.locator('details[open]').count(),0);
      assert.equal(await adminRow.locator('[data-idb-action="archive-item"]').count(),1);
      console.log('INVENTORY_CROSS_SURFACE_SITE_OK',profile.name,site);
    }
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}
