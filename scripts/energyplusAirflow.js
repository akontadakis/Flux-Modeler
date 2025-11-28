
import { project } from './project.js';
import {
    getConfig,
    setZoneInfiltration,
    setZoneVentilation,
    setZoneMixing,
    setZoneCrossMixing,
    setZoneRefrigerationDoorMixing,
    setZoneEarthtube
} from './energyplusConfigService.js';

let dom;

// Helper to get zones
function getZones() {
    if (project && typeof project.getZones === 'function') {
        return project.getZones() || [];
    }
    return [];
}

function getScheduleNames() {
    const { config } = getConfig(project);
    const schedules = config.schedules || {};
    const names = [];
    if (schedules.dayHourly) names.push(...schedules.dayHourly.map(s => s.name));
    if (schedules.compact) names.push(...schedules.compact.map(s => s.name));
    if (schedules.constant) names.push(...schedules.constant.map(s => s.name));
    if (schedules.file) names.push(...schedules.file.map(s => s.name));
    if (schedules.year) names.push(...schedules.year.map(s => s.name));
    return [...new Set(names)].sort();
}

const CATEGORIES = [
    { id: 'infiltration', label: 'Infiltration' },
    { id: 'ventilation', label: 'Ventilation' },
    { id: 'mixing', label: 'Mixing' },
    { id: 'earthtube', label: 'Earthtube' }
];

export function openAirflowPanel() {
    const panelId = 'panel-energyplus-airflow';
    const btnId = 'toggle-panel-airflow-btn';
    const btn = document.getElementById(btnId);

    let panel = document.getElementById(panelId);

    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
        return;
    }

    if (!panel) {
        panel = createAirflowPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);
    }

    panel.classList.remove('hidden');
    if (btn) btn.classList.add('active');

    // Bring to front
    const allPanels = document.querySelectorAll('.floating-window');
    let maxZ = 100;
    allPanels.forEach(p => {
        const z = parseInt(window.getComputedStyle(p).zIndex) || 0;
        if (z > maxZ) maxZ = z;
    });
    panel.style.zIndex = maxZ + 1;

    // Default to first category
    renderSidebarList(panel);
    renderCategoryContent(panel, 'infiltration');
}

function createAirflowPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-airflow';
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Outdoor Air & Ventilation</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>
            
            <div style="display: flex; flex: 1; overflow: hidden;">
                <!-- Left Sidebar: Category List -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                        <span class="label">Airflow Types</span>
                    </div>
                    <div id="af-sidebar-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- Categories injected here -->
                    </div>
                </div>

                <!-- Right Content: Table or Editor -->
                <div id="af-content" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <!-- Dynamic Content -->
                </div>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    return panel;
}

function renderSidebarList(panel) {
    const listContainer = panel.querySelector('#af-sidebar-list');
    listContainer.innerHTML = '';

    // We store the active category in dataset to persist across re-renders if needed, 
    // but for now we just default or rely on click.
    const currentCat = panel.dataset.activeCategory || 'infiltration';

    CATEGORIES.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        if (cat.id === currentCat) {
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';
        }

        item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

        item.addEventListener('mouseenter', () => {
            if (cat.id !== panel.dataset.activeCategory) item.style.backgroundColor = 'var(--hover-bg)';
        });
        item.addEventListener('mouseleave', () => {
            if (cat.id !== panel.dataset.activeCategory) item.style.backgroundColor = '';
        });

        item.addEventListener('click', () => {
            panel.dataset.activeCategory = cat.id;
            renderSidebarList(panel);
            renderCategoryContent(panel, cat.id);
        });

        listContainer.appendChild(item);
    });
}

function renderCategoryContent(panel, categoryId) {
    const container = panel.querySelector('#af-content');
    const { config } = getConfig(project);

    let data = [];
    let title = '';
    let itemName = '';
    let setter;

    if (categoryId === 'infiltration') {
        data = config.zoneInfiltration || [];
        title = 'Infiltration';
        itemName = 'Infiltration Object';
        setter = setZoneInfiltration;
    } else if (categoryId === 'ventilation') {
        data = config.zoneVentilation || [];
        title = 'Ventilation';
        itemName = 'Ventilation Object';
        setter = setZoneVentilation;
    } else if (categoryId === 'mixing') {
        data = config.zoneMixing || [];
        title = 'Mixing';
        itemName = 'Mixing Object';
        setter = setZoneMixing;
    } else if (categoryId === 'earthtube') {
        data = config.zoneEarthtube || [];
        title = 'Earthtube';
        itemName = 'Earthtube Object';
        setter = setZoneEarthtube;
    }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold text-sm uppercase">${title}</h3>
            <button class="btn btn-xs btn-primary" id="af-add-btn">Add ${itemName}</button>
        </div>
        <div class="overflow-x-auto border border-gray-700 rounded bg-black/20">
            <table class="w-full text-xs text-left">
                <thead class="bg-black/40 text-[--text-secondary]">
                    <tr>
                        <th class="p-2 font-medium">Name</th>
                        <th class="p-2 font-medium">Zone</th>
                        <th class="p-2 font-medium">Schedule</th>
                        <th class="p-2 font-medium">Value</th>
                        <th class="p-2 w-20 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700/50">
                    ${data.map((item, index) => `
                        <tr class="hover:bg-white/5 transition-colors">
                            <td class="p-2">${item.name || '-'}</td>
                            <td class="p-2">${item.zoneName || '-'}</td>
                            <td class="p-2">${item.scheduleName || '-'}</td>
                            <td class="p-2">${formatValue(item, categoryId)}</td>
                            <td class="p-2 text-right">
                                <button class="btn btn-xxs btn-secondary edit-btn mr-1" data-index="${index}">Edit</button>
                                <button class="btn btn-xxs btn-danger delete-btn" data-index="${index}">&times;</button>
                            </td>
                        </tr>
                    `).join('')}
                    ${data.length === 0 ? '<tr><td colspan="5" class="p-4 text-center text-[--text-secondary] italic">No items defined.</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    // Listeners
    container.querySelector('#af-add-btn').addEventListener('click', () => {
        renderEditor(panel, categoryId, null);
    });

    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            renderEditor(panel, categoryId, idx);
        });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('Delete this item?')) {
                const idx = parseInt(e.target.dataset.index);
                const newData = [...data];
                newData.splice(idx, 1);
                setter(project, newData);
                renderCategoryContent(panel, categoryId);
            }
        });
    });
}

function formatValue(item, categoryId) {
    if (categoryId === 'infiltration') {
        if (item.designFlowRateCalculationMethod === 'Flow/Zone') return `${item.designFlowRate} m³/s`;
        if (item.designFlowRateCalculationMethod === 'AirChanges/Hour') return `${item.airChangesPerHour} ACH`;
        return item.designFlowRateCalculationMethod || '-';
    }
    if (categoryId === 'ventilation') {
        return `${item.designFlowRate} m³/s (${item.ventilationType})`;
    }
    if (categoryId === 'mixing') {
        return `${item.designFlowRate} m³/s (from ${item.sourceZoneName})`;
    }
    if (categoryId === 'earthtube') {
        return `${item.designFlowRate} m³/s (${item.earthtubeType})`;
    }
    return '-';
}

function renderEditor(panel, categoryId, index) {
    const container = panel.querySelector('#af-content');
    const { config } = getConfig(project);
    const zones = getZones();
    const schedNames = getScheduleNames();

    let dataList = [];
    let setter;
    let defaultConfig = {};

    if (categoryId === 'infiltration') {
        dataList = config.zoneInfiltration || [];
        setter = setZoneInfiltration;
        defaultConfig = { designFlowRateCalculationMethod: 'Flow/Zone', designFlowRate: 0.1 };
    } else if (categoryId === 'ventilation') {
        dataList = config.zoneVentilation || [];
        setter = setZoneVentilation;
        defaultConfig = { ventilationType: 'Natural', designFlowRate: 0.1 };
    } else if (categoryId === 'mixing') {
        dataList = config.zoneMixing || [];
        setter = setZoneMixing;
        defaultConfig = { designFlowRate: 0.1 };
    } else if (categoryId === 'earthtube') {
        dataList = config.zoneEarthtube || [];
        setter = setZoneEarthtube;
        defaultConfig = { earthtubeType: 'Natural', designFlowRate: 0.1 };
    }

    const isNew = index === null;
    const item = isNew ? { name: `New ${categoryId}`, ...defaultConfig } : { ...dataList[index] };

    const renderLabel = (text, tooltip) => {
        const info = tooltip ? `<span class="info-icon">i<span class="info-popover">${tooltip}</span></span>` : '';
        return `<label class="label">${text}${info}</label>`;
    };

    const zoneOpts = (sel) => {
        let html = '<option value="">(select zone)</option>';
        zones.forEach(z => {
            const s = z.name === sel ? ' selected' : '';
            html += `<option value="${z.name}"${s}>${z.name}</option>`;
        });
        return html;
    };

    const schedOpts = (sel) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach(n => {
            const s = n === sel ? ' selected' : '';
            html += `<option value="${n}"${s}>${n}</option>`;
        });
        return html;
    };

    let fieldsHtml = `
        <div>
            ${renderLabel('Name', 'Unique name for this object.')}
            <input type="text" id="af-name" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.name || ''}">
        </div>
        <div>
            ${renderLabel('Zone Name', 'The zone this object applies to.')}
            <select id="af-zone" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">${zoneOpts(item.zoneName)}</select>
        </div>
        <div>
            ${renderLabel('Schedule Name', 'Schedule modifying the parameters.')}
            <select id="af-sched" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">${schedOpts(item.scheduleName)}</select>
        </div>
    `;

    // Specific Fields
    if (categoryId === 'infiltration') {
        const method = item.designFlowRateCalculationMethod || 'Flow/Zone';
        fieldsHtml += `
            <div>
                ${renderLabel('Calculation Method', 'Method to calculate the design flow rate.')}
                <select id="af-method" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Flow/Zone" ${method === 'Flow/Zone' ? 'selected' : ''}>Flow/Zone</option>
                    <option value="Flow/Area" ${method === 'Flow/Area' ? 'selected' : ''}>Flow/Area</option>
                    <option value="Flow/ExteriorArea" ${method === 'Flow/ExteriorArea' ? 'selected' : ''}>Flow/ExteriorArea</option>
                    <option value="Flow/ExteriorWallArea" ${method === 'Flow/ExteriorWallArea' ? 'selected' : ''}>Flow/ExteriorWallArea</option>
                    <option value="AirChanges/Hour" ${method === 'AirChanges/Hour' ? 'selected' : ''}>AirChanges/Hour</option>
                </select>
            </div>
            <div>
                ${renderLabel('Design Flow Rate [m³/s]', 'Design flow rate (m³/s).')}
                <input type="number" step="0.001" id="af-flow" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.designFlowRate ?? ''}">
            </div>
            <div>
                ${renderLabel('Flow per Zone Floor Area [m³/s-m²]', 'Flow rate per zone floor area.')}
                <input type="number" step="0.0001" id="af-flow-area" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.flowPerZoneFloorArea ?? ''}">
            </div>
            <div>
                ${renderLabel('Air Changes per Hour', 'Air changes per hour (1/hr).')}
                <input type="number" step="0.1" id="af-ach" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.airChangesPerHour ?? ''}">
            </div>
        `;
    } else if (categoryId === 'ventilation') {
        const type = item.ventilationType || 'Natural';
        fieldsHtml += `
            <div>
                ${renderLabel('Ventilation Type', 'Type of ventilation.')}
                <select id="af-type" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Natural" ${type === 'Natural' ? 'selected' : ''}>Natural</option>
                    <option value="Intake" ${type === 'Intake' ? 'selected' : ''}>Intake</option>
                    <option value="Exhaust" ${type === 'Exhaust' ? 'selected' : ''}>Exhaust</option>
                    <option value="Balanced" ${type === 'Balanced' ? 'selected' : ''}>Balanced</option>
                </select>
            </div>
            <div>
                ${renderLabel('Design Flow Rate [m³/s]', 'Design flow rate (m³/s).')}
                <input type="number" step="0.001" id="af-flow" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.designFlowRate ?? ''}">
            </div>
            <div>
                ${renderLabel('Min Indoor Temp [°C]', 'Minimum indoor temperature for ventilation.')}
                <input type="number" step="0.1" id="af-min-tin" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.minimumIndoorTemperature ?? ''}">
            </div>
        `;
    } else if (categoryId === 'mixing') {
        fieldsHtml += `
            <div>
                ${renderLabel('Source Zone Name', 'Zone to mix from.')}
                <select id="af-source-zone" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">${zoneOpts(item.sourceZoneName)}</select>
            </div>
            <div>
                ${renderLabel('Design Flow Rate [m³/s]', 'Mixing flow rate.')}
                <input type="number" step="0.001" id="af-flow" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.designFlowRate ?? ''}">
            </div>
            <div>
                ${renderLabel('Delta Temperature [°C]', 'Required temperature difference.')}
                <input type="number" step="0.1" id="af-delta-t" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.deltaTemperature ?? ''}">
            </div>
        `;
    } else if (categoryId === 'earthtube') {
        const type = item.earthtubeType || 'Natural';
        fieldsHtml += `
            <div>
                ${renderLabel('Earthtube Type', 'Type of earthtube.')}
                <select id="af-type" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Natural" ${type === 'Natural' ? 'selected' : ''}>Natural</option>
                    <option value="Intake" ${type === 'Intake' ? 'selected' : ''}>Intake</option>
                    <option value="Exhaust" ${type === 'Exhaust' ? 'selected' : ''}>Exhaust</option>
                </select>
            </div>
            <div>
                ${renderLabel('Design Flow Rate [m³/s]', 'Design flow rate.')}
                <input type="number" step="0.001" id="af-flow" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.designFlowRate ?? ''}">
            </div>
            <div>
                ${renderLabel('Fan Pressure Rise [Pa]', 'Pressure rise across the fan.')}
                <input type="number" step="1" id="af-fan-press" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.fanPressureRise ?? ''}">
            </div>
            <div>
                ${renderLabel('Pipe Radius [m]', 'Radius of the pipe.')}
                <input type="number" step="0.01" id="af-pipe-r" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.pipeRadius ?? ''}">
            </div>
            <div>
                ${renderLabel('Pipe Length [m]', 'Length of the pipe.')}
                <input type="number" step="0.1" id="af-pipe-l" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.pipeLength ?? ''}">
            </div>
            <div>
                ${renderLabel('Pipe Depth [m]', 'Depth underground.')}
                <input type="number" step="0.1" id="af-pipe-d" class="w-full mt-1 text-xs bg-black/40 border border-gray-600 rounded px-2 py-1 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${item.pipeDepthUnderGround ?? ''}">
            </div>
        `;
    }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
            <h3 class="font-semibold text-sm uppercase">${isNew ? 'Add' : 'Edit'} ${categoryId}</h3>
            <button class="btn btn-xs btn-secondary" id="af-cancel-btn">Cancel</button>
        </div>
        <div class="space-y-4">
            ${fieldsHtml}
            <div class="mt-4 pt-4 border-t border-gray-700 flex justify-end gap-2">
                <button class="btn btn-sm btn-primary" id="af-save-btn">Save</button>
            </div>
        </div>
    `;

    // Handlers
    container.querySelector('#af-cancel-btn').addEventListener('click', () => {
        renderCategoryContent(panel, categoryId);
    });

    container.querySelector('#af-save-btn').addEventListener('click', () => {
        const newItem = { ...item };
        newItem.name = container.querySelector('#af-name').value;
        newItem.zoneName = container.querySelector('#af-zone').value;
        newItem.scheduleName = container.querySelector('#af-sched').value;

        const getVal = (id) => {
            const el = container.querySelector(id);
            return el ? (parseFloat(el.value) || undefined) : undefined;
        };
        const getStr = (id) => {
            const el = container.querySelector(id);
            return el ? el.value : undefined;
        };

        if (categoryId === 'infiltration') {
            newItem.designFlowRateCalculationMethod = getStr('#af-method');
            newItem.designFlowRate = getVal('#af-flow');
            newItem.flowPerZoneFloorArea = getVal('#af-flow-area');
            newItem.airChangesPerHour = getVal('#af-ach');
        } else if (categoryId === 'ventilation') {
            newItem.ventilationType = getStr('#af-type');
            newItem.designFlowRate = getVal('#af-flow');
            newItem.minimumIndoorTemperature = getVal('#af-min-tin');
        } else if (categoryId === 'mixing') {
            newItem.sourceZoneName = getStr('#af-source-zone');
            newItem.designFlowRate = getVal('#af-flow');
            newItem.deltaTemperature = getVal('#af-delta-t');
        } else if (categoryId === 'earthtube') {
            newItem.earthtubeType = getStr('#af-type');
            newItem.designFlowRate = getVal('#af-flow');
            newItem.fanPressureRise = getVal('#af-fan-press');
            newItem.pipeRadius = getVal('#af-pipe-r');
            newItem.pipeLength = getVal('#af-pipe-l');
            newItem.pipeDepthUnderGround = getVal('#af-pipe-d');
        }

        const newData = [...dataList];
        if (isNew) {
            newData.push(newItem);
        } else {
            newData[index] = newItem;
        }

        setter(project, newData);
        renderCategoryContent(panel, categoryId);
    });
}
