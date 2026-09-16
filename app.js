// PART 1 OF 5: MEMORY STORAGE & PWA SETUP
let materials = JSON.parse(localStorage.getItem('cosmetic_materials')) || [];
let recipes = JSON.parse(localStorage.getItem('cosmetic_recipes')) || [];
let orders = JSON.parse(localStorage.getItem('cosmetic_orders')) || [];
const APP_VERSION = 'v1.0.0';
// Default webhook / sheet URL (user-provided). Stored in localStorage under 'sheets_webhook'.
const DEFAULT_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/11aKW-aMswgq4Rsn9u4mH6_nZHymA1gn3lkX77zVxW58/edit?gid=0#gid=0';
let temporaryRecipeIngredients = [], temporaryPresetRules = [], temporaryOrderBasket = [];

// Lightweight DOM helpers to avoid repeated null-checks
function $id(id) { try { return document.getElementById(id); } catch(e) { return null; } }
function $val(id) { const e = $id(id); return e ? e.value : ''; }
function $setText(id, text) { const e = $id(id); if (e) e.innerText = text; }
function $setHtml(id, html) { const e = $id(id); if (e) e.innerHTML = html; }

// Register background offline tools safely without using modules
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
    .then(reg => console.log('Background PWA Routine Enabled'))
    .catch(err => console.log('PWA background integration offline'));
}

// Automatically load elements when the page structure is mounted
window.addEventListener('DOMContentLoaded', () => {
    renderIngredients(); 
    syncDropdownOptions(); 
    renderRecipes(); 
    renderOrders(); 
    calculateEarnings(); 
    scanForPendingAlerts();
    
    // Auto-load your hidden API keys from your device memory
    const savedKey1 = localStorage.getItem('gemini_key_1');
    const savedKey2 = localStorage.getItem('gemini_key_2');
    const gem1El = document.getElementById('geminiKey1');
    const gem2El = document.getElementById('geminiKey2');
    if (savedKey1 && gem1El) gem1El.value = savedKey1;
    if (savedKey2 && gem2El) gem2El.value = savedKey2;
    
    if (savedKey1 || savedKey2) {
        const aiPanel = document.querySelector('.ai-glass-panel');
        if (aiPanel) aiPanel.style.display = 'none';
    }

    // show version label if present
    const verEl = document.getElementById('appVersion'); if (verEl) verEl.innerText = APP_VERSION;

    // prefill Sheets webhook input from localStorage or default, and autosave on change
    const sheetInput = document.getElementById('sheetsWebhook');
    try {
        const saved = localStorage.getItem('sheets_webhook');
        if (sheetInput) sheetInput.value = saved || DEFAULT_SHEETS_URL || '';
        if (sheetInput) sheetInput.addEventListener('change', (e) => { localStorage.setItem('sheets_webhook', (e.target.value||'').trim()); });
    } catch (e) { console.warn('sheets webhook localStorage error', e); }
    
    // Unhide trick: Clicking the main suite title toggles your key config panel
    const logo = document.querySelector('.logo-area');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', () => {
            const panel = document.querySelector('.ai-glass-panel');
            if (!panel) return;
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        });
    }
    // HIGH-COMPATIBILITY TAB ENGINE: Connects click attributes directly
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-target');
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
                // ensure visible and scrolled into view on small screens
                try { targetContent.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
            }
            btn.classList.add('active');
            // refresh dropdowns when switching tabs to avoid zero-size/select issues
            try { syncDropdownOptions(); } catch(e){}
            if (targetTabId === 'recipes') { try { filterIngredientOptions(); } catch(e){} }
            // focus first input for convenience
            setTimeout(() => { const f = targetContent && targetContent.querySelector('input, select, button'); if (f) f.focus(); }, 120);
        });
    });
    
    const aiBtn = document.getElementById('aiBtn'); if (aiBtn) aiBtn.addEventListener('click', runGeminiCommand);
    const exportBtn = document.getElementById('exportMaterialsBtn'); if (exportBtn) exportBtn.addEventListener('click', exportMaterials);
    const importFile = document.getElementById('importMaterialsFile'); if (importFile) importFile.addEventListener('change', handleImportMaterials);
    const searchInput = document.getElementById('recipeIngSearch'); if (searchInput) searchInput.addEventListener('input', filterIngredientOptions);
    const fab = document.getElementById('fabQuickAdd'); if (fab) fab.addEventListener('click', () => {
        // open orders tab and focus customer name for quick mobile order entry
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const btn = document.querySelector('.tab-btn[data-target="orders"]'); if (btn) btn.classList.add('active');
        const content = document.getElementById('orders'); if (content) content.classList.add('active');
        setTimeout(() => { const cust = document.getElementById('orderCustName'); if (cust) cust.focus(); }, 200);
    });
});

window.addMaterial = function() {
    const nameEl = document.getElementById('matName');
    const priceEl = document.getElementById('matPrice');
    const typeEl = document.getElementById('matType');
    const name = nameEl ? nameEl.value.trim() : '';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const type = typeEl ? typeEl.value : 'ingredient';
    if (!name || isNaN(price)) return alert("Please fulfill raw entry values.");
    materials.push({ id: Date.now().toString(), name, price, type });
    persistAndSync();
    document.getElementById('matName').value = ''; 
    document.getElementById('matPrice').value = '';
};

window.deleteMaterial = function(id) { 
    materials = materials.filter(m => m.id !== id); 
    persistAndSync(); 
};
function renderIngredients() {
    const grid = document.getElementById('ingredientsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    materials.forEach(m => {
        const div = document.createElement('div'); div.className = 'card';
        div.innerHTML = `<h4>${m.name}</h4><p>Type: <strong>${m.type.toUpperCase()}</strong></p><p>Cost: Rs. ${Number(m.price).toFixed(2)}</p><div style="display:flex; gap:8px; margin-top:8px;"><button onclick="editMaterial('${m.id}')" style="background:#0284c7; font-size:12px; padding:6px; flex:1; border-radius:6px; border:none; color:white;">Edit</button><button onclick="deleteMaterial('${m.id}')" style="background:#dc3545; font-size:12px; padding:6px; flex:1; border-radius:6px; border:none; color:white;">Remove</button></div>`;
        grid.appendChild(div);
    });
}

window.editMaterial = function(id) {
    const m = materials.find(x => x.id === id); if (!m) return alert('Material not found');
    const newName = prompt('Edit material name:', m.name); if (newName === null) return; // cancelled
    const newPriceRaw = prompt('Edit price (LKR) — numbers only:', String(m.price)); if (newPriceRaw === null) return;
    const newPrice = parseFloat(newPriceRaw.replace(/[^0-9\.\-]/g, ''));
    if (isNaN(newPrice)) return alert('Invalid price');
    m.name = newName.trim() || m.name; m.price = newPrice;
    persistAndSync();
};

function syncDropdownOptions() {
    const ingSelect = document.getElementById('recipeIngSelect');
    const conSelect = document.getElementById('presetContainerSelect');
    const prodSelect = document.getElementById('orderProductSelect');

    if (ingSelect) {
        ingSelect.innerHTML = '';
        materials.filter(m => m.type === 'ingredient').forEach(m => { ingSelect.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/g)</option>`; });
    }

    if (conSelect) {
        conSelect.innerHTML = '';
        materials.filter(m => m.type === 'container').forEach(m => { conSelect.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/pc)</option>`; });
    }

    if (prodSelect) {
        prodSelect.innerHTML = '';
        recipes.forEach(r => { (r.presets||[]).forEach(p => { prodSelect.innerHTML += `<option value="${r.id}::${p.label}">${r.name} - ${p.label} (Rs.${(p.finalPrice||0).toFixed(2)})</option>`; }); });
    }

    const dl = document.getElementById('customersList');
    if (dl) {
        dl.innerHTML = '';
        [...new Set(orders.map(o => o.customerName || ''))].forEach(c => { if(c) dl.innerHTML += `<option value="${c}">`; });
    }
}

window.addIngredientToRecipe = function() {
    const id = document.getElementById('recipeIngSelect').value;
    const qty = parseFloat(document.getElementById('recipeIngQty').value);
    const material = materials.find(m => m.id === id);
    if (!material || isNaN(qty) || qty <= 0) return;
    temporaryRecipeIngredients.push({ materialId: id, name: material.name, qty, pricePerGram: material.price });
    document.getElementById('recipeIngQty').value = ''; calculateActiveRecipe();
};

window.removeRecipeIngredient = function(index) { temporaryRecipeIngredients.splice(index, 1); calculateActiveRecipe(); };
window.calculateActiveRecipe = function() {
    const tbody = document.getElementById('recipeRows'); tbody.innerHTML = '';
    let totalWeight = 0, rawCost = 0;
    temporaryRecipeIngredients.forEach((ing, idx) => {
        const itemCost = ing.qty * ing.pricePerGram; totalWeight += ing.qty; rawCost += itemCost;
        tbody.innerHTML += `<tr><td><strong>${ing.name}</strong></td><td>${ing.qty}g</td><td>Rs. ${ing.pricePerGram.toFixed(2)}</td><td>Rs. ${itemCost.toFixed(2)}</td><td><button onclick="removeRecipeIngredient(${idx})" style="background:#dc3545; padding:2px 6px;">x</button></td></tr>`;
    });
    const otherCost = parseFloat(document.getElementById('batchOther').value) || 0;
    const profitInput = parseFloat(document.getElementById('batchProfit').value) || 0;
    let finalCost = rawCost + otherCost;
    if (document.getElementById('batchProfitType').value === 'percent') finalCost += (finalCost * (profitInput / 100)); else finalCost += profitInput;
    document.getElementById('lblBatchWeight').innerText = totalWeight.toFixed(1);
    document.getElementById('lblBatchRawCost').innerText = rawCost.toFixed(2);
    document.getElementById('lblBatchFinalCost').innerText = finalCost.toFixed(2);
};

window.addPresetRule = function() {
    const label = document.getElementById('presetLabel').value.trim();
    const weight = parseFloat(document.getElementById('presetWeight').value);
    const containerId = document.getElementById('presetContainerSelect').value;
    const profit = parseFloat(document.getElementById('presetProfit').value) || 0;
    const profitType = document.getElementById('presetProfitType').value;
    const container = materials.find(m => m.id === containerId);
    if (!label || isNaN(weight) || !container) return alert("Fill fields.");
    temporaryPresetRules.push({ label, weight, containerId, containerName: container.name, containerPrice: container.price, profit, profitType });
    const li = document.createElement('li'); li.innerText = `${label}: ${weight}g [${container.name}]`;
    document.getElementById('presetRulesList').appendChild(li);
    document.getElementById('presetLabel').value = ''; document.getElementById('presetWeight').value = '';
};

window.saveRecipe = function() {
    const name = document.getElementById('recipeName').value.trim();
    const rawBatchCost = parseFloat(document.getElementById('lblBatchRawCost').innerText);
    const totalBatchWeight = parseFloat(document.getElementById('lblBatchWeight').innerText);
    if (!name || temporaryRecipeIngredients.length === 0) return alert("Missing structural details.");
    const processedPresets = temporaryPresetRules.map(rule => {
        const factor = totalBatchWeight > 0 ? (rule.weight / totalBatchWeight) : 0;
        const ingFractionCost = rawBatchCost * factor;
        const baselineCost = ingFractionCost + rule.containerPrice;
        let retailPrice = baselineCost;
        if (rule.profitType === 'percent') retailPrice += (baselineCost * (rule.profit / 100)); else retailPrice += rule.profit;
        return { ...rule, calculatedCost: baselineCost, finalPrice: retailPrice, fractionCost: ingFractionCost };
    });
    recipes.push({ id: Date.now().toString(), name, ingredients: [...temporaryRecipeIngredients], rawBatchCost, totalBatchWeight, presets: processedPresets });
    temporaryRecipeIngredients = []; temporaryPresetRules = [];
    document.getElementById('recipeRows').innerHTML = ''; document.getElementById('presetRulesList').innerHTML = '';
    document.getElementById('recipeName').value = ''; persistAndSync(); renderRecipes();
};

window.deleteRecipe = function(id) { recipes = recipes.filter(r => r.id !== id); persistAndSync(); renderRecipes(); };

function renderRecipes() {
    const grid = document.getElementById('recipeGrid'); grid.innerHTML = '';
    recipes.forEach(r => {
        let pHTML = '';
        r.presets.forEach(p => { pHTML += `<div style="font-size:12px; background:#1e293b; padding:6px; margin-top:6px; border-radius:6px; color:#fff;"><strong>${p.label}</strong><br>Cost: Rs. ${p.calculatedCost.toFixed(2)} | Price: <strong>Rs. ${p.finalPrice.toFixed(2)}</strong></div>`; });
        const div = document.createElement('div'); div.className = 'card';
        div.innerHTML = `<h3>🧪 ${r.name}</h3><p class="hint">Batch: ${r.totalBatchWeight}g</p>${pHTML}<div style="display:flex; gap:6px; margin-top:12px;"><button onclick="window.print()" style="background:#0284c7; font-size:11px; flex:1;">🖨️ Print</button><button onclick="deleteRecipe('${r.id}')" style="background:#dc3545; font-size:11px; width:35px;">✕</button></div>`;
        grid.appendChild(div);
    });
}
// PART 5A: CHECKOUT CART BASKET & INVOICE GRID LEDGER RENDERER
window.addItemToOrderBasket = function() {
    const prodSelect = document.getElementById('orderProductSelect');
    const qty = parseInt(document.getElementById('orderProductQty').value) || 1;
    let item = null;
    if (prodSelect && prodSelect.value) {
        const value = prodSelect.value;
        const [rId, pLabel] = value.split('::');
        const recipe = recipes.find(r => r.id === rId);
        const preset = recipe && recipe.presets ? recipe.presets.find(p => p.label === pLabel) : null;
        if (!recipe || !preset) return alert('Selected product not found.');
        item = { recipeId: rId, recipeName: recipe.name, presetLabel: pLabel, qty, unitPrice: preset.finalPrice, unitCost: preset.calculatedCost, fractionCost: preset.fractionCost, containerPrice: preset.containerPrice };
    } else {
        // allow ad-hoc custom product
        const cname = (document.getElementById('orderCustomName') || {}).value || '';
        const cprice = parseFloat((document.getElementById('orderCustomPrice') || {}).value) || 0;
        if (!cname) return alert('Enter a product name or select a product.');
        item = { recipeId: null, recipeName: cname, presetLabel: 'Custom', qty, unitPrice: cprice, unitCost: 0, fractionCost: 0, containerPrice: 0 };
    }
    temporaryOrderBasket.push(item);
    const li = document.createElement('li'); li.innerHTML = `<strong>${qty}x</strong> ${item.recipeName} ${item.presetLabel ? '('+item.presetLabel+')' : ''} - Rs. ${(item.unitPrice*item.qty).toFixed(2)}`;
    document.getElementById('orderBasket').appendChild(li);
};

window.submitFinalOrder = async function() {
    const name = document.getElementById('orderCustName').value.trim();
    if (!name || temporaryOrderBasket.length === 0) return alert("Basket empty.");
    const newOrder = { id: Date.now().toString(), customerName: name, contact: document.getElementById('orderCustContact').value.trim(), items: [...temporaryOrderBasket], paymentStatus: document.getElementById('orderPayStatus').value, deliveryStatus: document.getElementById('orderDevStatus').value, date: new Date().toISOString() };
    orders.push(newOrder);
    temporaryOrderBasket = []; document.getElementById('orderBasket').innerHTML = '';
    document.getElementById('orderCustName').value = ''; document.getElementById('orderCustContact').value = '';
    persistAndSync(); renderOrders(); calculateEarnings(); scanForPendingAlerts();
    try { await sendOrderToGoogle(newOrder); } catch (e) { console.warn('Send to Google failed', e); }
};

window.updateOrderStatus = function(id, type, val) {
    const o = orders.find(ord => ord.id === id);
    if (o) { if (type === 'pay') o.paymentStatus = val; else o.deliveryStatus = val; localStorage.setItem('cosmetic_orders', JSON.stringify(orders)); calculateEarnings(); scanForPendingAlerts(); renderOrders(); }
};

window.deleteOrder = function(id) { orders = orders.filter(o => o.id !== id); persistAndSync(); renderOrders(); calculateEarnings(); scanForPendingAlerts(); };

window.renderOrders = function() {
    const ledger = document.getElementById('ordersLedger'); ledger.innerHTML = '';
    const searchVal = document.getElementById('filterSearch').value.toLowerCase();
    const payFilter = document.getElementById('filterPayment').value;
    const devFilter = document.getElementById('filterDelivery').value;
    let filtered = orders.filter(o => (o.customerName.toLowerCase().includes(searchVal)) && (payFilter === 'all' || o.paymentStatus === payFilter) && (devFilter === 'all' || o.deliveryStatus === devFilter));
    if (document.getElementById('sortOrders').value === 'newest') filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(o => {
        let itemsSummary = '', orderTotal = 0;
        o.items.forEach(i => { orderTotal += (i.unitPrice * i.qty); itemsSummary += `<li>${i.qty} x ${i.recipeName} [${i.presetLabel}] - Rs. ${(i.unitPrice * i.qty).toFixed(2)}</li>`; });
        const div = document.createElement('div'); div.className = `ledger-item ${o.paymentStatus === 'Paid' ? 'paid' : ''}`;
        div.innerHTML = `<div style="display:flex; justify-content:space-between; flex-wrap:wrap; width:100%;"><div><strong>👤 Invoice: ${o.customerName}</strong><ul style="font-size:12px;">${itemsSummary}</ul><strong>Total: Rs. ${orderTotal.toFixed(2)}</strong></div><div class="ledger-actions-wrapper"><select onchange="updateOrderStatus('${o.id}', 'pay', this.value)"><option value="Unpaid" ${o.paymentStatus==='Unpaid'?'selected':''}>❌ Unpaid</option><option value="Paid" ${o.paymentStatus==='Paid'?'selected':''}>Account Settled</option></select><select onchange="updateOrderStatus('${o.id}', 'dev', this.value)"><option value="Not Made" ${o.deliveryStatus==='Not Made'?'selected':''}>⏳ Pending Mix</option><option value="Made" ${o.deliveryStatus==='Made'?'selected':''}>🛠️ Ready</option><option value="Delivered" ${o.deliveryStatus==='Delivered'?'selected':''}>📦 Shipped</option></select><div style="display:flex; gap:4px; margin-top:2px;"><button onclick="printSingleInvoice(this)" style="background:#0284c7; font-size:11px; flex:1;">🖨️ Print</button><button onclick="deleteOrder('${o.id}')" style="background:#dc3545; font-size:11px;">✕</button></div></div></div>`;
        ledger.appendChild(div);
    });
};
// PART 5B: PRINTING, NOTIFICATIONS, EXCEL PARSING, & TWIN GEMINI SUITE
window.printSingleInvoice = function(buttonEl) {
    const parentItem = buttonEl.closest('.ledger-item');
    parentItem.classList.add('force-print-target');
    window.print();
    parentItem.classList.remove('force-print-target');
};

function calculateEarnings() {
    let rev = 0, cost = 0, other = 0;
    orders.forEach(o => { o.items.forEach(i => { rev += (i.unitPrice * i.qty); cost += ((i.fractionCost + i.containerPrice) * i.qty); other += ((i.unitCost - (i.fractionCost + i.containerPrice)) * i.qty); }); });
    document.getElementById('totalRevenue').innerText = `Rs. ${rev.toFixed(2)}`;
    document.getElementById('totalCost').innerText = `Rs. ${cost.toFixed(2)}`;
    document.getElementById('totalOther').innerText = `Rs. ${other.toFixed(2)}`;
    document.getElementById('totalProfit').innerText = `Rs. ${(rev - cost - other).toFixed(2)}`;
}

window.scanForPendingAlerts = function() {
    const banner = document.getElementById('notificationCenter'); const list = document.getElementById('notifList'); list.innerHTML = '';
    let pending = 0, unpaid = [];
    orders.forEach(o => { if (o.deliveryStatus === 'Not Made') pending++; if (o.paymentStatus === 'Unpaid') unpaid.push(o.customerName); });
    if (pending > 0 || unpaid.length > 0) {
        banner.classList.remove('hidden');
        if (Notification.permission === 'default') Notification.requestPermission();
        if (pending > 0) { list.innerHTML += `<li class="alert-item production">⏳ You have <strong>${pending} pending formulations</strong> left.</li>`; sendMobileNotification("Pending Lab Orders!", `You have ${pending} formulations to mix.`); }
        unpaid.forEach(u => { list.innerHTML += `<li class="alert-item collection">💸 <strong>Collect Funds:</strong> Ask money from <strong>${u}</strong>.</li>`; sendMobileNotification("Collect Payment!", `Remember to ask money from ${u}.`); });
    } else banner.classList.add('hidden');
};

window.toggleNotifPanel = function() { document.getElementById('notificationCenter').classList.add('hidden'); };

function sendMobileNotification(titleText, bodyText) {
    if (Notification.permission === 'granted' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_NOTIFICATION', title: titleText, body: bodyText });
    }
}

window.handleExcelUpload = function(event) {
    const file = event.target.files; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); materials = [];
        if (workbook.SheetNames.length > 0) {
            XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).forEach(r => { if(r.Name && r.Price) materials.push({ id: 'xl-i-'+Math.random().toString(36).substr(2,4), name: r.Name, price: parseFloat(r.Price), type: 'ingredient' }); });
        }
        if (workbook.SheetNames.length > 1) {
            XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[1]]).forEach(r => { if(r.Name && r.Price) materials.push({ id: 'xl-c-'+Math.random().toString(36).substr(2,4), name: r.Name, price: parseFloat(r.Price), type: 'container' }); });
        }
        persistAndSync(); alert("Excel Synced Successfully.");
    };
    reader.readAsArrayBuffer(file);
};

function persistAndSync() { 
    localStorage.setItem('cosmetic_materials', JSON.stringify(materials)); 
    localStorage.setItem('cosmetic_recipes', JSON.stringify(recipes)); 
    localStorage.setItem('cosmetic_orders', JSON.stringify(orders)); 
    renderIngredients(); 
    syncDropdownOptions(); 
}

function exportMaterials() {
    try {
        const dataStr = JSON.stringify(materials, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'materials.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    } catch (err) { alert('Export failed: ' + err.message); }
}

function handleImportMaterials(event) {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!Array.isArray(parsed)) return alert('Invalid file format. Expected JSON array.');
            materials = parsed;
            persistAndSync();
            alert('Materials imported successfully.');
        } catch (err) { alert('Import error: ' + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function filterIngredientOptions() {
    const q = (document.getElementById('recipeIngSearch') ? document.getElementById('recipeIngSearch').value.trim().toLowerCase() : '');
    const sel = document.getElementById('recipeIngSelect'); if (!sel) return;
    // rebuild options to avoid relying on option.hidden (inconsistent across browsers)
    sel.innerHTML = '';
    const candidates = materials.filter(m => m.type === 'ingredient' && (!q || m.name.toLowerCase().includes(q)));
    if (candidates.length === 0 && q) {
        // if no match, show all as fallback
        materials.filter(m => m.type === 'ingredient').forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/g)</option>`);
    } else {
        candidates.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/g)</option>`);
    }
}

async function sendMaterialsToGoogle() {
    const url = (document.getElementById('sheetsWebhook') || {}).value;
    if (!url) return alert('Set the Google Sheets webhook URL first.');
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'materials_upsert', materials })
        });
        const data = await resp.text();
        alert('Sync complete. Server response: ' + data);
    } catch (err) { alert('Sync failed: ' + err.message); }
}

async function pullMaterialsFromGoogle() {
    const url = (document.getElementById('sheetsWebhook') || {}).value;
    if (!url) return alert('Set the Google Sheets webhook URL first.');
    try {
        const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'action=get_materials';
        const resp = await fetch(fetchUrl, { method: 'GET' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const remote = await resp.json();
        if (!Array.isArray(remote)) throw new Error('Unexpected response format');
        materials = remote;
        persistAndSync();
        alert('Materials pulled and imported successfully.');
    } catch (err) { alert('Pull failed: ' + err.message); }
}

// Wire sync buttons on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const up = document.getElementById('syncMaterialsUpBtn');
    const pull = document.getElementById('pullMaterialsBtn');
    if (up) up.addEventListener('click', sendMaterialsToGoogle);
    if (pull) pull.addEventListener('click', pullMaterialsFromGoogle);
});

async function sendOrderToGoogle(order) {
    const url = document.getElementById('sheetsWebhook') ? document.getElementById('sheetsWebhook').value.trim() : '';
    if (!url) return; // silently skip when not configured
    try {
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
        if (!resp.ok) throw new Error('Request failed with ' + resp.status);
        console.log('Order sent to Google Sheets webhook');
    } catch (err) {
        console.error('sendOrderToGoogle error', err);
        throw err;
    }
}

window.testSheetWebhook = async function() {
    const url = document.getElementById('sheetsWebhook') ? document.getElementById('sheetsWebhook').value.trim() : '';
    if (!url) return alert('Paste your Apps Script Webhook URL in the field first.');
    try {
        const sample = { test: true, time: new Date().toISOString(), note: 'Sample ping from Cosmetic Lab Suite' };
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) });
        if (!r.ok) throw new Error('Response ' + r.status);
        alert('Webhook responded OK.');
    } catch (e) { alert('Webhook test failed: ' + e.message); }
}

async function runGeminiCommand() {
    const slot = document.getElementById('activeKeySlot').value;
    const key1 = document.getElementById('geminiKey1').value.trim();
    const key2 = document.getElementById('geminiKey2').value.trim();
    const prompt = document.getElementById('aiPrompt').value.trim(); 
    const status = document.getElementById('aiStatus');
    localStorage.setItem('gemini_key_1', key1); localStorage.setItem('gemini_key_2', key2);
    let activeKey = (slot === 'key1') ? key1 : key2;
    if (!activeKey || !prompt) return alert("Provide Key and Command."); status.innerText = "Processing...";
    try {
        const aiEngine = new window.GoogleGenerativeAI(activeKey);
        const model = aiEngine.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
        const instructions = `Map prompt to structural JSON. Action 1: {"action": "ADD_MATERIAL", "name": "Name", "price": 10.0, "type": "ingredient"/"container"}. Action 2: {"action": "ADD_ORDER", "customerName": "Name", "contact": "Phone", "paymentStatus": "Paid"/"Unpaid", "deliveryStatus": "Not Made"/"Made"}. Prompt: "${prompt}"`;
        const res = await model.generateContent(instructions); const parsed = JSON.parse(await res.response.text());
        if (parsed.action === "ADD_MATERIAL") { materials.push({ id: Date.now().toString(), name: parsed.name, price: parsed.price, type: parsed.type }); persistAndSync(); status.innerText = `Added item: ${parsed.name}`; }
        else if (parsed.action === "ADD_ORDER") { orders.push({ id: Date.now().toString(), customerName: parsed.customerName, contact: parsed.contact||"", items: [], paymentStatus: parsed.paymentStatus||"Unpaid", deliveryStatus: parsed.deliveryStatus||"Not Made", date: new Date().toISOString() }); persistAndSync(); renderOrders(); calculateEarnings(); scanForPendingAlerts(); status.innerText = `Log active for: ${parsed.customerName}`; }
        document.getElementById('aiPrompt').value = '';
    } catch (err) { 
        status.innerText = "Error: " + err.message; 
    }
}
