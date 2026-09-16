// CHUNK 2: REPLACE THE ENTIRE PART 1 OF app.js WITH THIS
import { GoogleGenerativeAI } from "@google/generative-ai";

let materials = JSON.parse(localStorage.getItem('cosmetic_materials')) || [];
let recipes = JSON.parse(localStorage.getItem('cosmetic_recipes')) || [];
let orders = JSON.parse(localStorage.getItem('cosmetic_orders')) || [];
let temporaryRecipeIngredients = [], temporaryPresetRules = [], temporaryOrderBasket = [];

window.addEventListener('DOMContentLoaded', () => {
    renderIngredients(); 
    syncDropdownOptions(); 
    renderRecipes(); 
    renderOrders(); 
    calculateEarnings(); 
    scanForPendingAlerts();
    
    // Check memory for saved Gemini API keys
    const savedKey1 = localStorage.getItem('gemini_key_1');
    const savedKey2 = localStorage.getItem('gemini_key_2');
    
    if(savedKey1) document.getElementById('geminiKey1').value = savedKey1;
    if(savedKey2) document.getElementById('geminiKey2').value = savedKey2;
    
    // Hide the key setup box automatically if keys are already found in memory
    if (savedKey1 || savedKey2) {
        document.querySelector('.ai-glass-panel').style.display = 'none';
    }
    
    // Secret Unhide Trick: Clicking the top title banner toggles the key box back open
    const logo = document.querySelector('.logo-area');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', () => {
            const panel = document.querySelector('.ai-glass-panel');
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        });
    }
    
    // AUTOMATIC TAB ROUTER: Connects clicks perfectly without breaking local host or mobile engines
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTabId = btn.getAttribute('data-target');
            
            // 1. Hide all tab content screens safely
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            // 2. Turn off lights on all navigation buttons
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            
            // 3. Turn on target tab content display block
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) targetContent.classList.add('active');
            
            // 4. Set clicked button status to glowing active color
            btn.classList.add('active');
        });
    });
    
    document.getElementById('aiBtn').addEventListener('click', runGeminiCommand);
});



// Deletes a raw material item when you click its remove button
window.deleteMaterial = function(id) { 
    materials = materials.filter(m => m.id !== id); 
    persistAndSync(); 
};

// Refreshes the interface to show all inventory items currently on file inside your glass panels
function renderIngredients() {
    const grid = document.getElementById('ingredientsGrid'); 
    grid.innerHTML = '';
    materials.forEach(m => {
        const div = document.createElement('div'); 
        div.className = 'card';
        div.innerHTML = `
            <h4>${m.name}</h4>
            <p>Type: <strong>${m.type.toUpperCase()}</strong></p>
            <p>Cost: Rs. ${m.price.toFixed(2)}</p>
            <button onclick="deleteMaterial('${m.id}')" style="background:#dc3545; font-size:12px; padding:6px; width:100%; border-radius:6px; margin-top:8px;">Remove Item</button>
        `;
        grid.appendChild(div);
    });
}

// Automatically syncs items to dropdown inputs across the website layouts
function syncDropdownOptions() {
    const ingSelect = document.getElementById('recipeIngSelect');
    const conSelect = document.getElementById('presetContainerSelect');
    const prodSelect = document.getElementById('orderProductSelect');
    
    ingSelect.innerHTML = ''; 
    conSelect.innerHTML = ''; 
    prodSelect.innerHTML = '';

    materials.filter(m => m.type === 'ingredient').forEach(m => { 
        ingSelect.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/g)</option>`; 
    });
    materials.filter(m => m.type === 'container').forEach(m => { 
        conSelect.innerHTML += `<option value="${m.id}">${m.name} (Rs.${m.price}/pc)</option>`; 
    });
    recipes.forEach(r => { 
        r.presets.forEach(p => { 
            prodSelect.innerHTML += `<option value="${r.id}::${p.label}">${r.name} - ${p.label} (Rs.${p.finalPrice.toFixed(2)})</option>`; 
        }); 
    });

    const dl = document.getElementById('customersList'); 
    dl.innerHTML = '';
    [...new Set(orders.map(o => o.customerName))].forEach(c => { 
        dl.innerHTML += `<option value="${c}">`; 
    });
}
// Adds an item to the current formula recipe building list
window.addIngredientToRecipe = function() {
    const id = document.getElementById('recipeIngSelect').value;
    const qty = parseFloat(document.getElementById('recipeIngQty').value);
    const material = materials.find(m => m.id === id);
    
    if (!material || isNaN(qty) || qty <= 0) return;
    
    temporaryRecipeIngredients.push({ materialId: id, name: material.name, qty, pricePerGram: material.price });
    document.getElementById('recipeIngQty').value = ''; 
    calculateActiveRecipe();
};

// Removes an ingredient item from your active draft recipe list
window.removeRecipeIngredient = function(index) { 
    temporaryRecipeIngredients.splice(index, 1); 
    calculateActiveRecipe(); 
};

// Performs all real-time calculations for your active batch formulas
window.calculateActiveRecipe = function() {
    const tbody = document.getElementById('recipeRows'); 
    tbody.innerHTML = '';
    let totalWeight = 0, rawCost = 0;
    
    temporaryRecipeIngredients.forEach((ing, idx) => {
        const itemCost = ing.qty * ing.pricePerGram; 
        totalWeight += ing.qty; 
        rawCost += itemCost;
        tbody.innerHTML += `
            <tr>
                <td><strong>${ing.name}</strong></td>
                <td>${ing.qty}g</td>
                <td>Rs. ${ing.pricePerGram.toFixed(2)}</td>
                <td>Rs. ${itemCost.toFixed(2)}</td>
                <td><button onclick="removeRecipeIngredient(${idx})" style="background:#dc3545; padding:2px 6px; border:none; color:white; border-radius:4px;">x</button></td>
            </tr>
        `;
    });
    
    const otherCost = parseFloat(document.getElementById('batchOther').value) || 0;
    const profitInput = parseFloat(document.getElementById('batchProfit').value) || 0;
    let finalCost = rawCost + otherCost;
    
    if (document.getElementById('batchProfitType').value === 'percent') {
        finalCost += (finalCost * (profitInput / 100)); 
    } else {
        finalCost += profitInput;
    }
    
    document.getElementById('lblBatchWeight').innerText = totalWeight.toFixed(1);
    document.getElementById('lblBatchRawCost').innerText = rawCost.toFixed(2);
    document.getElementById('lblBatchFinalCost').innerText = finalCost.toFixed(2);
};

// Registers a new packaging size variation (Selling Preset Rule) to the active recipe
window.addPresetRule = function() {
    const label = document.getElementById('presetLabel').value.trim();
    const weight = parseFloat(document.getElementById('presetWeight').value);
    const containerId = document.getElementById('presetContainerSelect').value;
    const profit = parseFloat(document.getElementById('presetProfit').value) || 0;
    const profitType = document.getElementById('presetProfitType').value;
    const container = materials.find(m => m.id === containerId);
    
    if (!label || isNaN(weight) || !container) return alert("Please fill in the Label, Weight, and Container.");
    
    temporaryPresetRules.push({ label, weight, containerId, containerName: container.name, containerPrice: container.price, profit, profitType });
    const li = document.createElement('li'); 
    li.innerText = `${label}: ${weight}g [Packaging: ${container.name}]`;
    document.getElementById('presetRulesList').appendChild(li);
    
    document.getElementById('presetLabel').value = ''; 
    document.getElementById('presetWeight').value = '';
};
// Calculates individual product size rules fractions and commits finished recipes to storage
window.saveRecipe = function() {
    const name = document.getElementById('recipeName').value.trim();
    const rawBatchCost = parseFloat(document.getElementById('lblBatchRawCost').innerText);
    const totalBatchWeight = parseFloat(document.getElementById('lblBatchWeight').innerText);
    
    if (!name || temporaryRecipeIngredients.length === 0) return alert("Recipe must have a name and at least one ingredient.");
    
    const processedPresets = temporaryPresetRules.map(rule => {
        const factor = totalBatchWeight > 0 ? (rule.weight / totalBatchWeight) : 0;
        const ingFractionCost = rawBatchCost * factor;
        const baselineCost = ingFractionCost + rule.containerPrice;
        let retailPrice = baselineCost;
        
        if (rule.profitType === 'percent') {
            retailPrice += (baselineCost * (rule.profit / 100)); 
        } else {
            retailPrice += rule.profit;
        }
        return { ...rule, calculatedCost: baselineCost, finalPrice: retailPrice, fractionCost: ingFractionCost };
    });
    
    recipes.push({ id: Date.now().toString(), name, ingredients: [...temporaryRecipeIngredients], rawBatchCost, totalBatchWeight, presets: processedPresets });
    temporaryRecipeIngredients = []; 
    temporaryPresetRules = [];
    
    document.getElementById('recipeRows').innerHTML = ''; 
    document.getElementById('presetRulesList').innerHTML = '';
    document.getElementById('recipeName').value = ''; 
    persistAndSync(); 
    renderRecipes();
};

window.deleteRecipe = function(id) { 
    recipes = recipes.filter(r => r.id !== id); 
    persistAndSync(); 
    renderRecipes(); 
};

// Generates the clean layout configurations that snap perfectly into rows of 3 box view items
function renderRecipes() {
    const grid = document.getElementById('recipeGrid'); 
    grid.innerHTML = '';
    recipes.forEach(r => {
        let pHTML = '';
        r.presets.forEach(p => { 
            pHTML += `<div style="font-size:12px; background:#1e293b; padding:6px; margin-top:6px; border-radius:6px; color:#fff; border:1px solid rgba(255,255,255,0.05);"><strong>${p.label}</strong><br>Cost: Rs. ${p.calculatedCost.toFixed(2)} | Retail: <strong>Rs. ${p.finalPrice.toFixed(2)}</strong></div>`; 
        });
        const div = document.createElement('div'); 
        div.className = 'card';
        div.innerHTML = `
            <h3>🧪 ${r.name}</h3>
            <p class="hint">Batch: ${r.totalBatchWeight}g | Raw: Rs. ${r.rawBatchCost.toFixed(2)}</p>
            ${pHTML}
            <div style="display:flex; gap:6px; margin-top:12px; width:100%;">
                <button onclick="window.print()" style="background:#0284c7; font-size:11px; flex:1; padding:6px; border-radius:4px; border:none; color:white;">🖨️ Print Batch</button>
                <button onclick="deleteRecipe('${r.id}')" style="background:#dc3545; font-size:11px; width:35px; border-radius:4px; border:none; color:white;">✕</button>
            </div>
        `;
        grid.appendChild(div);
    });
}

// Loads product presets straight into a live customer multi-item shopping checkout cart basket
window.addItemToOrderBasket = function() {
    const value = document.getElementById('orderProductSelect').value;
    const qty = parseInt(document.getElementById('orderProductQty').value) || 1;
    if (!value) return;
    
    const [rId, pLabel] = value.split('::');
    const recipe = recipes.find(r => r.id === rId);
    const preset = recipe.presets.find(p => p.label === pLabel);
    
    temporaryOrderBasket.push({ recipeId: rId, recipeName: recipe.name, presetLabel: pLabel, qty, unitPrice: preset.finalPrice, unitCost: preset.calculatedCost, fractionCost: preset.fractionCost, containerPrice: preset.containerPrice });
    const li = document.createElement('li'); 
    li.style.margin = "4px 0";
    li.innerHTML = `<strong>${qty}x</strong> ${recipe.name} (${pLabel}) - Rs. ${(preset.finalPrice * qty).toFixed(2)}`;
    document.getElementById('orderBasket').appendChild(li);
};

window.submitFinalOrder = function() {
    const name = document.getElementById('orderCustName').value.trim();
    if (!name || temporaryOrderBasket.length === 0) return alert("Your cart basket is empty.");
    
    orders.push({ id: Date.now().toString(), customerName: name, contact: document.getElementById('orderCustContact').value.trim(), items: [...temporaryOrderBasket], paymentStatus: document.getElementById('orderPayStatus').value, deliveryStatus: document.getElementById('orderDevStatus').value, date: new Date().toISOString() });
    temporaryOrderBasket = []; 
    document.getElementById('orderBasket').innerHTML = '';
    document.getElementById('orderCustName').value = ''; 
    document.getElementById('orderCustContact').value = '';
    
    persistAndSync(); 
    renderOrders(); 
    calculateEarnings(); 
    scanForPendingAlerts();
};
window.updateOrderStatus = function(id, type, val) {
    const o = orders.find(ord => ord.id === id);
    if (o) { 
        if (type === 'pay') o.paymentStatus = val; else o.deliveryStatus = val; 
        localStorage.setItem('cosmetic_orders', JSON.stringify(orders)); 
        calculateEarnings(); 
        scanForPendingAlerts(); 
        renderOrders(); 
    }
};

window.deleteOrder = function(id) { 
    orders = orders.filter(o => o.id !== id); 
    persistAndSync(); 
    renderOrders(); 
    calculateEarnings(); 
    scanForPendingAlerts(); 
};

window.renderOrders = function() {
    const ledger = document.getElementById('ordersLedger'); 
    ledger.innerHTML = '';
    const searchVal = document.getElementById('filterSearch').value.toLowerCase();
    const payFilter = document.getElementById('filterPayment').value;
    const devFilter = document.getElementById('filterDelivery').value;
    
    let filtered = orders.filter(o => (o.customerName.toLowerCase().includes(searchVal)) && (payFilter === 'all' || o.paymentStatus === payFilter) && (devFilter === 'all' || o.deliveryStatus === devFilter));
    if (document.getElementById('sortOrders').value === 'newest') filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(o => {
        let itemsSummary = '', orderTotal = 0;
        o.items.forEach(i => { orderTotal += (i.unitPrice * i.qty); itemsSummary += `<li>${i.qty} x ${i.recipeName} [${i.presetLabel}] - Rs. ${(i.unitPrice * i.qty).toFixed(2)}</li>`; });
        const div = document.createElement('div'); 
        div.className = `ledger-item ${o.paymentStatus === 'Paid' ? 'paid' : ''}`;
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; width:100%;">
                <div>
                    <strong>👤 Invoice: ${o.customerName}</strong> ${o.contact ? `(📞 ${o.contact})` : ''}<br>
                    <span style="font-size:11px; color:#64748b;">Logged: ${new Date(o.date).toLocaleString()}</span>
                    <ul style="font-size:12.5px; margin:6px 0; padding-left:18px;">${itemsSummary}</ul>
                    <strong>Grand Total: LKR ${orderTotal.toFixed(2)}</strong>
                </div>
                <div class="ledger-actions-wrapper" style="display:flex; flex-direction:column; gap:6px;">
                    <select onchange="updateOrderStatus('${o.id}', 'pay', this.value)">
                        <option value="Unpaid" ${o.paymentStatus==='Unpaid'?'selected':''}>❌ Unpaid</option>
                        <option value="Paid" ${o.paymentStatus==='Paid'?'selected':''}>✅ Paid</option>
                    </select>
                    <select onchange="updateOrderStatus('${o.id}', 'dev', this.value)">
                        <option value="Not Made" ${o.deliveryStatus==='Not Made'?'selected':''}>⏳ Not Made</option>
                        <option value="Made" ${o.deliveryStatus==='Made'?'selected':''}>🛠️ Made</option>
                        <option value="Delivered" ${o.deliveryStatus==='Delivered'?'selected':''}>📦 Delivered</option>
                    </select>
                    <div style="display:flex; gap:4px; margin-top:2px;">
                        <button onclick="printSingleInvoice(this)" style="background:#0284c7; font-size:11px; flex:1; padding:4px 8px; border-radius:4px; border:none; color:white;">🖨️ Receipt</button>
                        <button onclick="deleteOrder('${o.id}')" style="background:#dc3545; font-size:11px; padding:4px 8px; border-radius:4px; border:none; color:white;">✕</button>
                    </div>
                </div>
            </div>`;
        ledger.appendChild(div);
    });
};

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
        if (pending > 0) list.innerHTML += `<li class="alert-item production">⏳ You have <strong>${pending} formulations</strong> left to formulate inside the lab.</li>`;
        unpaid.forEach(u => { list.innerHTML += `<li class="alert-item collection">💸 <strong>Collect Funds:</strong> Reach out to <strong>${u}</strong> to collect outstanding payments.</li>`; });
    } else banner.classList.add('hidden');
};

window.toggleNotifPanel = function() { document.getElementById('notificationCenter').classList.add('hidden'); };

window.handleExcelUpload = function(event) {
    const file = event.target.files; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); materials = [];
        if (workbook.SheetNames) {
            XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames]).forEach(r => { if(r.Name && r.Price) materials.push({ id: 'xl-i-'+Math.random().toString(36).substr(2,4), name: r.Name, price: parseFloat(r.Price), type: 'ingredient' }); });
        }
        if (workbook.SheetNames) {
            XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames]).forEach(r => { if(r.Name && r.Price) materials.push({ id: 'xl-c-'+Math.random().toString(36).substr(2,4), name: r.Name, price: parseFloat(r.Price), type: 'container' }); });
        }
        persistAndSync(); alert("Excel Synced Successfully.");
    };
    reader.readAsArrayBuffer(file);
};

function persistAndSync() { localStorage.setItem('cosmetic_materials', JSON.stringify(materials)); localStorage.setItem('cosmetic_recipes', JSON.stringify(recipes)); localStorage.setItem('cosmetic_orders', JSON.stringify(orders)); renderIngredients(); syncDropdownOptions(); }

async function runGeminiCommand() {
    const slot = document.getElementById('activeKeySlot').value;
    const key1 = document.getElementById('geminiKey1').value.trim();
    const key2 = document.getElementById('geminiKey2').value.trim();
    const prompt = document.getElementById('aiPrompt').value.trim(); 
    const status = document.getElementById('aiStatus');

    localStorage.setItem('gemini_key_1', key1);
    localStorage.setItem('gemini_key_2', key2);

    let activeKey = (slot === 'key1') ? key1 : key2;
    if (!activeKey || !prompt) return alert("Provide API Key and Command."); 
    status.innerText = "Processing command via selected key slot...";
    
    try {
        const model = new GoogleGenerativeAI(activeKey).getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
        const instructions = `Map prompt to structural JSON. Action 1: {"action": "ADD_MATERIAL", "name": "Name", "price": 10.0, "type": "ingredient"/"container"}. Action 2: {"action": "ADD_ORDER", "customerName": "Name", "contact": "Phone", "paymentStatus": "Paid"/"Unpaid", "deliveryStatus": "Not Made"/"Made"}. Prompt: "${prompt}"`;
        const res = await model.generateContent(instructions); const parsed = JSON.parse(await res.response.text());
        if (parsed.action === "ADD_MATERIAL") { materials.push({ id: Date.now().toString(), name: parsed.name, price: parsed.price, type: parsed.type }); persistAndSync(); status.innerText = `Added item: ${parsed.name}`; }
        else if (parsed.action === "ADD_ORDER") { orders.push({ id: Date.now().toString(), customerName: parsed.customerName, contact: parsed.contact||"", items: [], paymentStatus: parsed.paymentStatus||"Unpaid", deliveryStatus: parsed.deliveryStatus||"Not Made", date: new Date().toISOString() }); persistAndSync(); renderOrders(); calculateEarnings(); scanForPendingAlerts(); status.innerText = `Log active for: ${parsed.customerName}`; }
        document.getElementById('aiPrompt').value = '';
    } catch (err) { status.innerText = "Error: " + err.message; }
}
